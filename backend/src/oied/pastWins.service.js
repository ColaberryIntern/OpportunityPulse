// Past Wins — last N approved outputs of a given type, hydrated with the
// opportunity title/category/value so the action generator can reference
// "your last 5 wins in staffing" by domain. Two queries (no association
// set up between OpportunityOutput and Opportunity); fine at small N.

const { Opportunity, OpportunityOutput } = require('../models');

async function getRecentApproved({ type, limit = 5, generatedBy = null } = {}) {
  const where = { status: 'approved' };
  if (type) where.type = type;
  if (generatedBy != null) where.generatedBy = generatedBy;

  const outputs = await OpportunityOutput.findAll({
    where,
    order: [['reviewedAt', 'DESC']],
    limit: Math.min(Number(limit) || 5, 25),
  });
  if (outputs.length === 0) return [];

  // Hydrate opportunities (title/category/value) for prompt context.
  const oppIds = outputs.map((o) => o.opportunityId);
  const opps = await Opportunity.findAll({
    where: { id: oppIds },
    attributes: ['id', 'title', 'category', 'value'],
  });
  const oppMap = new Map();
  for (const o of opps) oppMap.set(o.id, o.toJSON());

  return outputs.map((o) => {
    const opp = oppMap.get(o.opportunityId) || {};
    return {
      id: o.id,
      type: o.type,
      content: o.content,
      reviewedAt: o.reviewedAt,
      opportunity: {
        id: o.opportunityId,
        title: opp.title || null,
        category: opp.category || null,
        value: opp.value || null,
      },
    };
  });
}

module.exports = { getRecentApproved };
