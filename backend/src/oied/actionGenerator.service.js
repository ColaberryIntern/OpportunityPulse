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
const events = require('./events.service');
const groundingSvc = require('./grounding.service');
const approvedAssetsSvc = require('./approvedAssets.service');
const documentService = require('../documents/document.service');

// v0.6 Phase 6: when the proposal generator runs, pull the org's vault
// docs of these types and inject excerpts into the prompt under an
// "Approved Source Material" block. Caps fit a typical context window
// (~10 KB of vault content, 2 KB per doc).
const VAULT_TYPES_FOR_PROPOSAL = [
  'capability_statement',
  'past_performance',
  'references',
];
const VAULT_TYPES_FOR_OFFER = ['capability_statement', 'references'];
const VAULT_TYPES_FOR_RESUME = ['capability_statement', 'past_performance'];
const VAULT_CAP_PER_DOC = 2000;
const VAULT_CAP_TOTAL = 10000;

// v8: thrown when proposal generation can't proceed because required
// procurement context (agency_name / solicitation_id / scope_summary)
// isn't derivable from the opportunity row.
class MissingGroundingError extends Error {
  constructor(missing_fields) {
    super(`Cannot generate proposal — missing context: ${missing_fields.join(', ')}`);
    this.name = 'MissingGroundingError';
    this.statusCode = 422;
    this.missing_fields = missing_fields;
  }
}

// v8: hard rules appended to the proposal system prompt. Bracketed
// {{BANNED_TERMS}} substituted at runtime.
const HARD_RULES = `

CRITICAL RULES (violation = unusable proposal):
1. DO NOT invent product names. Use ONLY the services and tools listed
   under "Approved Services" / "Approved Tools" in the user message.
2. DO NOT reference unknown systems, frameworks, or products from
   outside that approved list.
3. DO NOT assume a "pilot → paid engagement" structure unless the
   opportunity description explicitly references a pilot, demo, or
   phased rollout.
4. MUST include the exact agency name and solicitation ID in the
   "## Executive Summary" section, by name (not a placeholder).
5. MUST cover each item listed under "Required Sections" with its own
   "## " heading. If no required sections were detected, default to
   ## Executive Summary | ## Approach | ## Team & Tools | ## Timeline | ## Pricing.

Banned terms (any occurrence is auto-flagged in metadata): {{BANNED_TERMS}}.
`;

const ALLOWED_TYPES = ['proposal', 'offer', 'analysis', 'resume'];

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
  resume:
    'You write tailored resumes for AI/data/engineering job postings. The '
    + 'job description is the input. Output a resume in plain markdown that '
    + 'maximizes signal for THIS role: ## Summary (3 sentences, mirror the '
    + 'job title and 2-3 must-have skills) | ## Skills (bulleted, prioritized '
    + 'by job relevance) | ## Experience (3-5 bullets per role, action+metric '
    + 'verbs, lead with the most-relevant role) | ## Education / Certifications. '
    + 'Use the Our Profile section for the candidate\'s services, tools, and past '
    + 'wins as the source of skills and experience. Never invent credentials. '
    + 'If the profile is sparse, return what you can and flag gaps in a final '
    + '## Gaps to Address section. Under 500 words.',
};

// v0.6: append vault doc excerpts to a prompt. Mutates by appending.
function appendVaultBlock(lines, vaultExcerpts) {
  if (!Array.isArray(vaultExcerpts) || vaultExcerpts.length === 0) return;
  lines.push('', '=== Approved Source Material (verbatim from your vault — cite, don\'t paraphrase) ===');
  for (const ex of vaultExcerpts) {
    lines.push('', `--- ${ex.type === 'capability_statement' ? 'Capability Statement' : ex.type === 'past_performance' ? 'Past Performance' : 'References'} (${ex.scope === 'bid' ? 'this bid' : 'global vault'}: ${ex.name}) ---`);
    lines.push(ex.text);
  }
}

function buildUserPrompt(opp, userProfile, pastWins, { vaultExcerpts = [] } = {}) {
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

  appendVaultBlock(lines, vaultExcerpts);

  return lines.join('\n');
}

// v8: grounded user prompt. Structures the input around real
// procurement metadata + approved assets so the model has concrete
// anchors instead of inferring everything from a free-form description.
function buildGroundedUserPrompt(opp, userProfile, pastWins, grounding, assets, { vaultExcerpts = [] } = {}) {
  const reqs = grounding.submission_requirements || {};
  const lines = [
    `Agency: ${grounding.agency_name}`,
    `Solicitation ID: ${grounding.solicitation_id}`,
    `Opportunity Title: ${grounding.opportunity_title || opp.title || ''}`,
    `Estimated Value (USD): ${opp.value != null ? opp.value : 'unknown'}`,
    `Close / expires: ${opp.expiresAt ? new Date(opp.expiresAt).toISOString().slice(0, 10) : 'unknown'}`,
    `Source: ${opp.source || ''}  (${grounding.source_url || opp.sourceUrl || 'no link'})`,
    '',
    'Scope (from RFP):',
    grounding.scope_summary || '(none provided)',
    '',
    `Required Sections: ${(reqs.required_sections && reqs.required_sections.length)
      ? reqs.required_sections.join(', ')
      : '(none detected — use ## Executive Summary | ## Approach | ## Team & Tools | ## Timeline | ## Pricing)'}`,
    `Page Limit: ${reqs.page_limit || 'unspecified'}`,
    `Format: ${reqs.format || 'unspecified'}`,
    '',
    `Approved Services (use ONLY these): ${(assets.services || []).join(', ') || '(none configured)'}`,
    `Approved Tools / Allowed Terms: ${(assets.allowed_terms || []).join(', ') || '(none)'}`,
    `Banned Terms (DO NOT use): ${(assets.banned_terms || []).join(', ')}`,
  ];
  if (Array.isArray(assets.case_studies) && assets.case_studies.length > 0) {
    lines.push('', 'Past wins to reference for credibility:');
    for (const cs of assets.case_studies) lines.push(`  - ${cs}`);
  }
  if (Array.isArray(pastWins) && pastWins.length > 0) {
    lines.push('', `Last ${pastWins.length} approved proposal(s) — match the tone, structure, and concreteness:`);
    for (const w of pastWins) {
      const t = (w.opportunity && w.opportunity.title) || '(untitled)';
      const cat = (w.opportunity && w.opportunity.category) || 'n/a';
      const snippet = String(w.content || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      lines.push(`  • [${cat}] ${t} → "${snippet}…"`);
    }
  }
  appendVaultBlock(lines, vaultExcerpts);
  return lines.join('\n');
}

// Personalization score (0-100, deterministic): how many tokens from
// userProfile.services / industries / tools / pastWins appear in the
// generated content. Token = lowercased word ≥4 chars. Saturating —
// after 25 unique hits the base score maxes out.
//
// v8 additions:
//   +5 when content references the agency_name (case-insensitive)
//   +5 when content references the solicitation_id (case-insensitive)
//   −10 per banned term hit (capped at −30 total)
function scorePersonalization({ userProfile, pastWins, content, grounding = null, banned = [] }) {
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
  let score = Math.min(100, Math.round((hits / 25) * 100));

  // v8 grounding bonuses: reward proposals that reference the actual
  // agency + solicitation (the model often forgets when the prompt
  // doesn't surface them).
  if (grounding && grounding.agency_name
      && corpus.includes(String(grounding.agency_name).toLowerCase())) {
    score = Math.min(100, score + 5);
  }
  if (grounding && grounding.solicitation_id
      && corpus.includes(String(grounding.solicitation_id).toLowerCase())) {
    score = Math.min(100, score + 5);
  }

  // v8 banned-term penalty: −10 per hit, capped at −30 total.
  if (Array.isArray(banned) && banned.length > 0) {
    score = Math.max(0, score - Math.min(30, banned.length * 10));
  }
  return score;
}

// Public: generate ONE output for an opportunity. Persists as draft.
async function generateOutput({
  opportunityId, type, generatedBy = null, userId = null,
  // Phase 12: optional pursuit-context prompt injection. When pursuitId is
  // present, a deterministic, audit-hashed context block is composed via
  // promptProvenance.buildAndPersist() and prepended to the user prompt.
  // The OpportunityOutput is linked back to the provenance row.
  pursuitId = null,
} = {}) {
  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error(`Unknown output type: ${type}`);
  }
  const opp = await Opportunity.findByPk(opportunityId);
  if (!opp) throw new Error(`opportunity ${opportunityId} not found`);

  // userId defaults to generatedBy — both are the calling admin in practice.
  const effectiveUserId = userId != null ? userId : generatedBy;
  const userProfile = await profileSvc.getOrDefault(effectiveUserId);

  // v8: lifecycle + grounding gates fire BEFORE the AI call (proposal only).
  let groundingPayload = null;
  let approvedAssets = null;
  if (type === 'proposal') {
    groundingPayload = await groundingSvc.getOpportunityGrounding(opportunityId);
    if (groundingPayload.status === 'not_found') {
      throw new Error(groundingPayload.message);
    }
    if (groundingPayload.status === 'invalid_stage') {
      // Reuse v7.1 LifecycleViolationError so the controller can map to 400.
      throw new events.LifecycleViolationError(
        groundingPayload.message,
        groundingPayload.event_type || 'submitted',
      );
    }
    const missing = groundingSvc.missingGroundingFields(groundingPayload);
    if (missing.length > 0) {
      throw new MissingGroundingError(missing);
    }
    approvedAssets = await approvedAssetsSvc.getApprovedAssets({
      organizationId: await profileSvc.resolveOrgId(effectiveUserId),
      userId: effectiveUserId,
    });
  }

  // v6: enforce plan limit BEFORE the AI call. enforceOrThrow is a no-op
  // when OIED_BILLING_ENFORCE=false; throws PlanLimitExceededError when
  // enforce=true AND the org is at/over its monthly cap. proposal-only —
  // 'offer' / 'analysis' types ride free for now.
  if (type === 'proposal') {
    const orgId = await profileSvc.resolveOrgId(effectiveUserId);
    await billing.enforceOrThrow({
      organizationId: orgId,
      metric: 'proposals_generated',
    });
  }

  const pastWins = await pastWinsSvc.getRecentApproved({
    type, limit: 5, generatedBy: effectiveUserId,
  }).catch((e) => {
    logger.warn('OIED: pastWins lookup failed (continuing without)', { error: e.message });
    return [];
  });

  // v0.6 Phase 6: pull vault excerpts (capability statement / past
  // performance / references) so the model has real org material to cite.
  const vaultTypeMap = {
    proposal: VAULT_TYPES_FOR_PROPOSAL,
    offer:    VAULT_TYPES_FOR_OFFER,
    resume:   VAULT_TYPES_FOR_RESUME,
    analysis: [],
  };
  const vaultTypes = vaultTypeMap[type] || [];
  let vaultExcerpts = [];
  if (vaultTypes.length > 0) {
    const orgId = await profileSvc.resolveOrgId(effectiveUserId);
    vaultExcerpts = await documentService.loadVaultExcerpts({
      organizationId: orgId,
      types: vaultTypes,
      capPerDoc: VAULT_CAP_PER_DOC,
      capTotal: VAULT_CAP_TOTAL,
    }).catch((e) => {
      logger.warn('OIED: vault excerpt load failed (continuing without)', { error: e.message });
      return [];
    });
  }

  const aiClient = getAIClient();

  // v8: grounded prompt path for proposals; legacy path for offer/analysis.
  let systemPrompt;
  let userPromptText;
  if (type === 'proposal' && groundingPayload && approvedAssets) {
    const bannedList = (approvedAssets.banned_terms || []).join(', ');
    systemPrompt = SYSTEM_PROMPTS.proposal
      + COLABERRY_POSITIONING
      + HARD_RULES.replace('{{BANNED_TERMS}}', bannedList);
    userPromptText = buildGroundedUserPrompt(
      opp, userProfile, pastWins, groundingPayload, approvedAssets,
      { vaultExcerpts },
    );
  } else {
    systemPrompt = SYSTEM_PROMPTS[type] + COLABERRY_POSITIONING;
    userPromptText = buildUserPrompt(opp, userProfile, pastWins, { vaultExcerpts });
  }

  // Phase 12: pursuit-context prompt provenance. Soft-fails so an unavailable
  // pursuit-context never blocks a draft. The block is prepended to the user
  // prompt and the resulting OpportunityOutput row links back via audit hash.
  let promptProvenanceRow = null;
  let promptAuditHash = null;
  if (pursuitId != null) {
    try {
      // eslint-disable-next-line global-require
      const promptProvenance = require('../deepResearch/promptProvenance.service');
      const orgId = await profileSvc.resolveOrgId(effectiveUserId).catch(() => null);
      const composed = await promptProvenance.buildAndPersist(Number(pursuitId), {
        organizationId: orgId, opportunityId, outputType: type,
        generatedBy: generatedBy ? String(generatedBy) : null,
      });
      if (composed && composed.block) {
        userPromptText = `${composed.block}\n\n---\n\n${userPromptText}`;
        promptAuditHash = composed.audit_hash;
        promptProvenanceRow = composed.provenance_id;
      }
    } catch (e) {
      logger.warn('OIED: pursuit-context provenance failed (continuing without)', {
        error: e.message,
      });
    }
  }

  const { content } = await aiClient.chat(
    systemPrompt,
    userPromptText,
    // responseFormat:'text' → emits markdown, not JSON.
    { temperature: 0.4, maxTokens: 900, responseFormat: 'text' },
  );

  if (!content || !content.trim()) {
    throw new Error('AI returned empty content');
  }

  // v8: post-generation banned-term scan (proposal only).
  const bannedHits = type === 'proposal'
    ? approvedAssetsSvc.findBannedTerms(content)
    : [];

  const personalization = scorePersonalization({
    userProfile, pastWins, content,
    grounding: groundingPayload, banned: bannedHits,
  });
  const metadata = {
    template_used: type === 'proposal' && groundingPayload ? 'proposal-v8' : `${type}-v3`,
    personalization_score: personalization,
    past_wins_used: pastWins.map((w) => w.id),
    profile_hash: userProfile ? profileHash(userProfile) : null,
    colaberry_positioning: true,
    grounding: type === 'proposal' && groundingPayload ? {
      agency_name: groundingPayload.agency_name,
      solicitation_id: groundingPayload.solicitation_id,
      required_sections: groundingPayload.submission_requirements.required_sections,
      page_limit: groundingPayload.submission_requirements.page_limit,
      format: groundingPayload.submission_requirements.format,
    } : null,
    banned_terms_detected: bannedHits,
    // v0.6 Phase 6: which vault docs informed this generation. Audit trail.
    evergreen_docs_used: vaultExcerpts.map((ex) => ({
      id: ex.id, type: ex.type, name: ex.name, scope: ex.scope, chars: ex.text.length,
    })),
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
    // Phase 12: link to the deterministic prompt-context provenance row
    // when one was composed for this draft.
    promptProvenanceId: promptProvenanceRow,
    promptAuditHash,
  });

  // Phase 12: link the provenance row back to the output (closes the loop
  // for the "what context produced this output?" query).
  if (promptProvenanceRow && row && row.id) {
    try {
      // eslint-disable-next-line global-require
      const promptProvenance = require('../deepResearch/promptProvenance.service');
      await promptProvenance.linkOutput(row.id, {
        provenanceId: promptProvenanceRow, auditHash: promptAuditHash,
      });
    } catch (e) { /* swallow */ }
  }

  // Phase 12: publish draft.complete to the SSE bus (tenant-aware).
  try {
    // eslint-disable-next-line global-require
    const sseHotPaths = require('../deepResearch/sseHotPaths.service');
    const orgId = await profileSvc.resolveOrgId(effectiveUserId).catch(() => null);
    sseHotPaths.publish.draftComplete({
      output_id: row.id, opportunity_id: opportunityId, type, pursuit_id: pursuitId,
      audit_hash: promptAuditHash,
    }, { organizationId: orgId });
  } catch (e) { /* swallow */ }

  // Phase 14: emit cross-provenance + operational-lineage edge so the
  // draft becomes a first-class node in the lineage graph. Soft-fails.
  try {
    // eslint-disable-next-line global-require
    const lineageEdgeWriter = require('../deepResearch/lineageEdgeWriter.service');
    const orgIdForLineage = await profileSvc.resolveOrgId(effectiveUserId).catch(() => null);
    lineageEdgeWriter.helpers.draftGenerated({
      pursuitId, opportunityId, outputId: row.id,
      organizationId: orgIdForLineage,
      actorEmail: generatedBy ? String(generatedBy) : null,
      auditHash: promptAuditHash,
    });
  } catch (e) { /* swallow */ }

  // Phase 15: automated quality pipeline. Runs the 4 scorers in
  // background then evaluates alerts. Soft-fails so a quality run never
  // breaks draft generation. Skipped when DEEP_RESEARCH_QUALITY_AUTO=false.
  try {
    if (process.env.DEEP_RESEARCH_QUALITY_AUTO !== 'false') {
      // eslint-disable-next-line global-require
      const qualityAutomation = require('../deepResearch/qualityAutomation.service');
      // eslint-disable-next-line global-require
      const qualityAlert = require('../deepResearch/qualityAlert.service');
      const orgIdForQuality = await profileSvc.resolveOrgId(effectiveUserId).catch(() => null);
      // Fire-and-forget; do not block the response.
      setImmediate(async () => {
        try {
          await qualityAutomation.runForOutput(row.id, {
            organizationId: orgIdForQuality,
            trigger: pursuitId ? 'on_pursuit_draft' : 'on_output_create',
            actor: generatedBy ? String(generatedBy) : null,
          });
          await qualityAlert.evaluateOutput(row.id, { organizationId: orgIdForQuality });
        } catch (e) { logger.warn('OIED: post-generation quality run failed', { error: e.message }); }
      });
    }
  } catch (e) { /* swallow */ }

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
  // v8
  buildGroundedUserPrompt,
  MissingGroundingError,
  HARD_RULES,
  COLABERRY_POSITIONING,
  ALLOWED_TYPES,
};
