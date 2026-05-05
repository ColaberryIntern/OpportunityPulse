// Action Generator: takes an opportunity and produces a proposal / offer /
// analysis via gpt-4o-mini. Stored in opportunity_outputs as a draft for
// admin review.
//
// v3 upgrades (Execution Intelligence):
//  - System prompt is suffixed with COLABERRY_POSITIONING so every
//    generated output frames Colaberry's "AI pilot → paid engagement"
//    play and uses service-specific language (no generic "leverage AI").
//  - User prompt is enriched with the calling user's business profile
//    AND the last N approved outputs of the same type — so generation
//    rhymes with what the team has already won.
//  - On persist, opportunity_outputs.metadata captures template_used,
//    personalization_score (0-100, deterministic), past_wins_used,
//    and profile_hash so we can audit + improve later.

const logger = require('../logging/logger');
const { Opportunity, OpportunityOutput } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const profileSvc = require('./profile.service');
const pastWinsSvc = require('./pastWins.service');
const { profileHash } = require('./fitScoring.service');
const billing = require('./billing.service');

const ALLOWED_TYPES = ['proposal', 'offer', 'analysis'];

const COLABERRY_POSITIONING =
  '\n\nYou represent Colaberry — an AI training, workforce, and analytics '
  + 'consulting firm. When framing engagements, prefer the "AI pilot → paid '
  + 'engagement" structure: a 2-4 week pilot deliverable that proves value, '
  + 'transitioning into a 3-6 month paid build. Use service-specific language '
  + '(name the actual products: data warehousing, AI training cohorts, '
  + 'workforce upskilling, document intelligence, predictive analytics). '
  + 'Never use empty phrases like "leverage cutting-edge AI", '
  + '"synergy", or "unlock value." Be concrete: name tools, name '
  + 'numbers, name timelines.';

const SYSTEM_PROMPTS = {
  proposal:
    'You write concise, persuasive procurement proposals. Output a draft '
    + 'proposal under 600 words, structured as: ## Executive Summary | ## Approach '
    + '| ## Team & Tools | ## Timeline | ## Pricing. Plain markdown only — no '
    + 'preamble, no boilerplate disclaimers. Concrete numbers and named tools, '
    + 'never generic phrasing like "leverage cutting-edge AI".',
  offer:
    'You produce one-page offer letters that respond to procurement RFPs. '
    + 'Output under 350 words: opening paragraph that names the buyer + the bid '
    + 'ref, three bullet points of differentiated value, a price range, and a '
    + 'clear next-step CTA. Plain markdown.',
  analysis:
    'You write structured opportunity analyses for an internal review. '
    + 'Output 4 sections: ## Fit | ## Risks | ## What to build | ## Go/No-go. '
    + 'Be brutally honest about no-go signals. Plain markdown, under 500 words.',
};

function buildUserPrompt(opp, userProfile, pastWins) {
  const ai = opp.aiAnalysis || {};
  const lines = [
    `Title: ${opp.title || ''}`,
    `Buyer / Agency: ${opp.location || opp.source || ''}`,
    `Category: ${opp.category || ''}`,
    `Estimated value (USD): ${opp.value != null ? opp.value : 'unknown'}`,
    `Close / expires: ${opp.expiresAt ? new Date(opp.expiresAt).toISOString().slice(0, 10) : 'unknown'}`,
    `Source: ${opp.source || ''}  (${opp.sourceUrl || 'no link'})`,
    '',
    'Existing AI analysis (if any):',
    `  ai_category: ${ai.ai_category || ''}`,
    `  fit_score: ${ai.fit_score ?? ''}`,
    `  automation_potential: ${ai.automation_potential ?? ''}`,
    `  repeatability: ${ai.repeatability ?? ''}`,
    `  recommended_product: ${ai.recommended_product || ''}`,
    `  signals: ${(ai.signals || []).join(', ')}`,
    '',
    `Description: ${(opp.description || '').slice(0, 1500)}`,
  ];

  if (userProfile) {
    lines.push('', 'Our company profile (use this to keep voice + emphasis consistent):');
    if (userProfile.services && userProfile.services.length) {
      lines.push(`  services: ${userProfile.services.join(', ')}`);
    }
    if (userProfile.industries && userProfile.industries.length) {
      lines.push(`  industries we serve: ${userProfile.industries.join(', ')}`);
    }
    if (userProfile.tools && userProfile.tools.length) {
      lines.push(`  tools/stack: ${userProfile.tools.join(', ')}`);
    }
    if (userProfile.pastWins && userProfile.pastWins.length) {
      lines.push(`  named past wins: ${userProfile.pastWins.join('; ')}`);
    }
  }

  if (pastWins && pastWins.length) {
    lines.push('', `Last ${pastWins.length} approved ${pastWins[0].type}(s) — match the tone, structure, and concreteness:`);
    for (const w of pastWins) {
      const t = (w.opportunity && w.opportunity.title) || '(untitled)';
      const cat = (w.opportunity && w.opportunity.category) || 'n/a';
      // Only the first ~400 chars per past win to keep prompt cheap.
      const snippet = String(w.content || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      lines.push(`  • [${cat}] ${t} → "${snippet}…"`);
    }
  }

  return lines.join('\n');
}

// Personalization score (0-100, deterministic): how many tokens from
// userProfile.services / industries / tools / pastWins appear in the
// generated content. Token = lowercased word ≥4 chars. Saturating —
// after 25 unique hits we max out.
function scorePersonalization({ userProfile, pastWins, content }) {
  if (!content) return 0;
  const corpus = String(content).toLowerCase();
  const tokenSet = new Set();
  const collect = (arr) => {
    if (!arr) return;
    for (const item of arr) {
      for (const tok of String(item).toLowerCase().split(/\W+/)) {
        if (tok.length >= 4) tokenSet.add(tok);
      }
    }
  };
  if (userProfile) {
    collect(userProfile.services);
    collect(userProfile.industries);
    collect(userProfile.tools);
    collect(userProfile.pastWins);
  }
  if (pastWins) {
    for (const w of pastWins) {
      if (w && w.opportunity) collect([w.opportunity.title, w.opportunity.category]);
    }
  }
  let hits = 0;
  for (const tok of tokenSet) {
    if (corpus.includes(tok)) hits += 1;
    if (hits >= 25) break;
  }
  return Math.min(100, Math.round((hits / 25) * 100));
}

// Public: generate ONE output for an opportunity. Persists as draft.
async function generateOutput({ opportunityId, type, generatedBy = null, userId = null }) {
  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error(`Unknown output type: ${type}`);
  }
  const opp = await Opportunity.findByPk(opportunityId);
  if (!opp) throw new Error(`opportunity ${opportunityId} not found`);

  // userId defaults to generatedBy — both are the calling admin in practice.
  const effectiveUserId = userId != null ? userId : generatedBy;
  const userProfile = await profileSvc.getOrDefault(effectiveUserId);
  const pastWins = await pastWinsSvc.getRecentApproved({
    type, limit: 5, generatedBy: effectiveUserId,
  }).catch((e) => {
    logger.warn('OIED: pastWins lookup failed (continuing without)', { error: e.message });
    return [];
  });

  const aiClient = getAIClient();
  const systemPrompt = SYSTEM_PROMPTS[type] + COLABERRY_POSITIONING;
  const userPromptText = buildUserPrompt(opp, userProfile, pastWins);
  const { content } = await aiClient.chat(
    systemPrompt,
    userPromptText,
    // responseFormat:'text' → emits markdown, not JSON.
    { temperature: 0.4, maxTokens: 900, responseFormat: 'text' }
  );

  if (!content || !content.trim()) {
    throw new Error('AI returned empty content');
  }

  const personalization = scorePersonalization({ userProfile, pastWins, content });
  const metadata = {
    template_used: `${type}-v3`,
    personalization_score: personalization,
    past_wins_used: pastWins.map((w) => w.id),
    profile_hash: userProfile ? profileHash(userProfile) : null,
    colaberry_positioning: true,
    generated_at: new Date().toISOString(),
  };

  const row = await OpportunityOutput.create({
    opportunityId,
    type,
    content: content.trim(),
    status: 'draft',
    generatedBy,
    aiModel: 'gpt-4o-mini',
    metadata,
  });

  logger.info('OIED: action generated', {
    opportunityId,
    type,
    outputId: row.id,
    contentLength: content.length,
    personalizationScore: personalization,
    pastWinsUsed: pastWins.length,
  });

  // v5: record billable usage (best-effort, never throws to caller).
  // Resolve org from the user; fall back silently when caller didn't pass one.
  if (type === 'proposal') {
    const orgId = await profileSvc.resolveOrgId(effectiveUserId).catch(() => null);
    await billing.recordUsage({
      organizationId: orgId,
      metric: 'proposals_generated',
      metadata: { outputId: row.id, opportunityId, type },
    }).catch(() => null);
  }

  return row.toJSON();
}

// Read APIs for the controller.
async function listOutputs({ status, type, opportunityId, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (opportunityId) where.opportunityId = opportunityId;
  const { rows, count } = await OpportunityOutput.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
    offset: Number(offset) || 0,
  });
  return { rows, total: count };
}

async function getOutput(id) {
  return OpportunityOutput.findByPk(id);
}

async function updateOutputStatus(id, { status, content, reviewerId, reviewNotes }) {
  if (status && !['draft', 'approved', 'rejected'].includes(status)) {
    throw new Error(`Unknown status: ${status}`);
  }
  const row = await OpportunityOutput.findByPk(id);
  if (!row) return null;
  if (status) row.status = status;
  if (typeof content === 'string' && content.trim()) row.content = content;
  if (reviewerId != null) row.reviewerId = reviewerId;
  if (reviewNotes != null) row.reviewNotes = reviewNotes;
  if (status === 'approved' || status === 'rejected') row.reviewedAt = new Date();
  await row.save();
  return row.toJSON();
}

module.exports = {
  generateOutput,
  listOutputs,
  getOutput,
  updateOutputStatus,
  scorePersonalization,
  buildUserPrompt,
  COLABERRY_POSITIONING,
  ALLOWED_TYPES,
};
