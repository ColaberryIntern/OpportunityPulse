// Research Intelligence Phase 4 — research-to-build pipeline.
//
// The doc's capstone: turn a research paper into a concrete build plan —
//   Research Paper → Commercial Opportunity → Product Idea → Architecture
//   → MVP scope → Potential Customers → Proposal angle.
//
// This is the synthesis layer that USES every prior phase:
//   - Phase 2.1 research_summary.buildable → which papers get a brief
//   - Phase 2.2 cross_channel_matches → the "potential customers" signal
//     (gov contracts / freelance projects already linked to this paper)
//   - the paper's own metadata (repo, domains, citations)
//
// Output lands on aiAnalysis.build_brief. Only generated for papers the
// Phase 2.1 summary flagged as buildable — no point briefing a paper we
// already decided we can't ship.

const { Opportunity, AnalysisRun } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');

const BATCH_SIZE = 12;

const SYSTEM_PROMPT = `You are a product strategist at Colaberry, an AI services + product company.
You take an AI research paper that's already been judged "buildable" and turn it into a concrete build plan Colaberry could act on.

You're given: the paper (title + abstract), its existing AI summary (exec summary, build recommendation, market timing), and — importantly — the REAL opportunities in other channels that this paper already connects to (government contracts, freelance projects, jobs, funding). Use those as the demand signal: they are evidence someone is already paying for this.

Produce a JSON object:
{
  "product_idea": "1-2 sentences: the specific product/service to build from this research.",
  "target_customers": "1-2 sentences: who buys it. Reference the linked opportunities if they're relevant — e.g. 'the 3 linked state IT contracts suggest gov procurement is a near-term buyer.'",
  "suggested_architecture": "2-3 sentences: the rough technical shape — components, what's reused vs. net-new.",
  "mvp_scope": "1-2 sentences: the smallest version that proves value and could ship in ~1 quarter.",
  "proposal_angle": "1 sentence: the one-line pitch for a proposal or sales conversation.",
  "confidence": 0.0-1.0
}

Rules:
- Be concrete and specific to THIS paper. No generic "build an AI platform" filler.
- Ground target_customers in the linked opportunities when they exist. If there are none, say so honestly ("no direct demand signal yet — speculative").
- mvp_scope must be genuinely small — a quarter of work for a small team, not a moonshot.
- confidence reflects how real + near-term this build is. Most should be 0.4-0.7.
- Respond with ONLY the JSON object.`;

function buildUserPrompt(opp) {
  const sd = opp.sourceData || {};
  const ai = opp.aiAnalysis || {};
  const summary = ai.research_summary || {};
  const ccm = (ai.cross_channel_matches && ai.cross_channel_matches.matches) || [];

  const lines = [
    `Paper: ${opp.title || ''}`,
    sd.githubRepo ? `Has public GitHub repo: yes (${sd.githubRepo})` : '',
    Array.isArray(sd.domains) && sd.domains.length ? `Domains: ${sd.domains.join(', ')}` : '',
    '',
    'Abstract:',
    String(opp.description || '').slice(0, 2000),
    '',
    'Existing AI summary:',
    `- Executive summary: ${summary.executive_summary || '(none)'}`,
    `- Build recommendation: ${summary.build_recommendation || '(none)'}`,
    `- Market timing: ${summary.market_timing || '(none)'}`,
    `- Competitive insight: ${summary.competitive_insight || '(none)'}`,
    '',
  ];

  if (ccm.length > 0) {
    lines.push(`Linked opportunities in other channels (${ccm.length}) — your demand signal:`);
    for (const m of ccm.slice(0, 8)) {
      lines.push(`  - [${m.channel}] ${m.title}${m.value ? ` ($${Number(m.value).toLocaleString()})` : ''} — shares: ${(m.shared_terms || []).join(', ')}`);
    }
  } else {
    lines.push('Linked opportunities: NONE — no direct demand signal in other channels yet.');
  }
  return lines.join('\n');
}

function sanitizeBrief(parsed, modelUsed) {
  const conf = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  return {
    product_idea: String(parsed.product_idea || '').slice(0, 600),
    target_customers: String(parsed.target_customers || '').slice(0, 600),
    suggested_architecture: String(parsed.suggested_architecture || '').slice(0, 800),
    mvp_scope: String(parsed.mvp_scope || '').slice(0, 600),
    proposal_angle: String(parsed.proposal_angle || '').slice(0, 300),
    confidence: conf,
    generated_at: new Date().toISOString(),
    model_used: modelUsed,
  };
}

// Generate a build brief for one buildable research opp.
async function generateBuildBrief(opportunity) {
  const ai = getAIClient();
  const { content, tokensUsed } = await ai.chat(SYSTEM_PROMPT, buildUserPrompt(opportunity), {
    temperature: 0.3,
    maxTokens: 800,
  });
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    logger.warn('researchBuildBrief: AI returned non-JSON', { id: opportunity.id, snippet: String(content).slice(0, 160) });
    parsed = {};
  }
  const brief = sanitizeBrief(parsed, ai.model);
  const existing = opportunity.aiAnalysis || {};
  await opportunity.update({
    aiAnalysis: { ...existing, build_brief: brief },
  });
  return { brief, tokensUsed };
}

// Batch: brief the buildable research opps that don't have one yet.
// "Buildable" = Phase 2.1 marked research_summary.buildable === true.
async function generateBuildBriefBatch({ limit = BATCH_SIZE, force = false } = {}) {
  const run = await AnalysisRun.create({
    type: 'research_build_brief',
    status: 'running',
    startedAt: new Date(),
  });
  try {
    // Pull research opps with a summary; filter to buildable in-process
    // (the buildable flag lives inside the aiAnalysis JSONB).
    const opps = await Opportunity.findAll({
      where: { type: 'research', status: 'active' },
      order: [['published_at', 'DESC']],
      limit: 300,
    });
    const buildable = opps.filter((o) => o.aiAnalysis
      && o.aiAnalysis.research_summary
      && o.aiAnalysis.research_summary.buildable === true);
    const todo = (force ? buildable : buildable.filter((o) => !o.aiAnalysis.build_brief))
      .slice(0, Math.min(Number(limit) || BATCH_SIZE, 50));

    if (todo.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: {
          message: 'No buildable research opps need a brief.',
          buildableTotal: buildable.length,
        },
        completedAt: new Date(),
      });
      return run;
    }

    let success = 0;
    let tokensUsed = 0;
    let withDemandSignal = 0;
    const errors = [];

    for (const opp of todo) {
      try {
        const ccm = opp.aiAnalysis.cross_channel_matches;
        if (ccm && Array.isArray(ccm.matches) && ccm.matches.length > 0) withDemandSignal += 1;
        const { tokensUsed: t } = await generateBuildBrief(opp);
        tokensUsed += t;
        success += 1;
      } catch (e) {
        errors.push({ opportunityId: opp.id, error: e.message });
        logger.warn('researchBuildBrief: failed for opp', { id: opp.id, error: e.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: todo.length,
      outputCount: success,
      results: {
        briefed: success,
        withDemandSignal,
        buildableTotal: buildable.length,
      },
      errors,
      tokensUsed,
      completedAt: new Date(),
    });
    logger.info('researchBuildBrief batch complete', { input: todo.length, briefed: success, errors: errors.length });
    return run;
  } catch (error) {
    logger.error('researchBuildBrief batch failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

module.exports = {
  buildUserPrompt,
  sanitizeBrief,
  generateBuildBrief,
  generateBuildBriefBatch,
};
