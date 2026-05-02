// Event tracker for OIED. Append-only — once written, events don't mutate.

const { OpportunityEvent } = require('../models');

const VALID_TYPES = new Set(['viewed', 'clicked', 'generated', 'approved', 'rejected', 'edited']);

async function recordEvent({ opportunityId, eventType, userId = null, payload = {} }) {
  if (!opportunityId) throw new Error('opportunityId required');
  if (!VALID_TYPES.has(eventType)) throw new Error(`Invalid event_type: ${eventType}`);
  return OpportunityEvent.create({
    opportunityId,
    eventType,
    userId,
    payload,
  });
}

async function listEvents({ opportunityId, eventType, limit = 100, offset = 0 } = {}) {
  const where = {};
  if (opportunityId) where.opportunityId = opportunityId;
  if (eventType) where.eventType = eventType;
  const { rows, count } = await OpportunityEvent.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(limit) || 100, 500),
    offset: Number(offset) || 0,
  });
  return { rows, total: count };
}

async function countByType({ opportunityId } = {}) {
  const where = {};
  if (opportunityId) where.opportunityId = opportunityId;
  const rows = await OpportunityEvent.findAll({
    where,
    attributes: ['eventType', [OpportunityEvent.sequelize.fn('COUNT', '*'), 'count']],
    group: ['event_type'],
  });
  const out = {};
  for (const r of rows) out[r.eventType] = Number(r.get('count'));
  return out;
}

module.exports = { recordEvent, listEvents, countByType, VALID_TYPES };
