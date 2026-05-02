// Action Generator: takes an opportunity and produces a proposal / offer /
// analysis via gpt-4o-mini. Stored in opportunity_outputs as a draft for
// admin review.

const logger = require('../logging/logger');
const { Opportunity, OpportunityOutput } = require('../models');
const { getAIClient } = require('../analysis/ai.client');

const ALLOWED_TYPES = ['proposal', 'offer', 'analysis'];

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

function buildUserPrompt(opp) {
  const ai = opp.aiAnalysis || {};
  return [
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
  ].join('\n');
}

// Public: generate ONE output for an opportunity. Persists as draft.
async function generateOutput({ opportunityId, type, generatedBy = null }) {
  if (!ALLOWED_TYPES.includes(type)) {
    throw new Error(`Unknown output type: ${type}`);
  }
  const opp = await Opportunity.findByPk(opportunityId);
  if (!opp) throw new Error(`opportunity ${opportunityId} not found`);

  const aiClient = getAIClient();
  const { content } = await aiClient.chat(
    SYSTEM_PROMPTS[type],
    buildUserPrompt(opp),
    { temperature: 0.4, maxTokens: 900 }
  );

  if (!content || !content.trim()) {
    throw new Error('AI returned empty content');
  }

  const row = await OpportunityOutput.create({
    opportunityId,
    type,
    content: content.trim(),
    status: 'draft',
    generatedBy,
    aiModel: 'gpt-4o-mini',
  });

  logger.info('OIED: action generated', {
    opportunityId, type, outputId: row.id, contentLength: content.length,
  });
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
  ALLOWED_TYPES,
};
