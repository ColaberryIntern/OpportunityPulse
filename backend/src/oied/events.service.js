// Event tracker for OIED. Append-only — once written, events don't mutate.
//
// v3: extends VALID_TYPES with conversion outcomes (submitted /
// response_received / won / lost) so we can compute win rate per
// category and feed the recommendation engine.

const { Op } = require('sequelize');
const { OpportunityEvent } = require('../models');

const VALID_TYPES = new Set([
  'viewed', 'clicked', 'generated', 'approved', 'rejected', 'edited',
  // v3: conversion tracking
  'submitted', 'response_received', 'won', 'lost',
]);

const CONVERSION_TYPES = new Set(['submitted', 'response_received', 'won', 'lost']);

// `mark-result` accepts a friendly alias 'responded' that we map to
// 'response_received' for storage.
const RESULT_ALIASES = {
  responded: 'response_received',
  response: 'response_received',
};

function normalizeResultStatus(status) {
  const lower = String(status || '').toLowerCase().trim();
  return RESULT_ALIASES[lower] || lower;
}

// v7.1: lifecycle ordering. Thrown by requireSubmitted / requireResponded
// when the prerequisite event hasn't been logged. Controller maps to 400.
class LifecycleViolationError extends Error {
  constructor(message, requires) {
    super(message);
    this.name = 'LifecycleViolationError';
    this.statusCode = 400;
    this.requires = requires;
  }
}

async function hasEventOfType({ opportunityId, eventType }) {
  if (!opportunityId || !eventType) return false;
  const row = await OpportunityEvent.findOne({
    where: { opportunityId, eventType },
    attributes: ['id'],
  });
  return !!row;
}

// Strict lifecycle ordering: responded requires submitted; won/lost
// require responded. Pure: throws on miss; returns void on hit.
async function requireSubmitted(opportunityId) {
  if (!(await hasEventOfType({ opportunityId, eventType: 'submitted' }))) {
    throw new LifecycleViolationError(
      'Cannot mark responded before submission',
      'submitted',
    );
  }
}
async function requireResponded(opportunityId) {
  if (!(await hasEventOfType({ opportunityId, eventType: 'response_received' }))) {
    throw new LifecycleViolationError(
      'Cannot mark won/lost before responded',
      'response_received',
    );
  }
}

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

// Used by the recommendation engine. Returns conversion counts +
// derived rates over a recent window. With zero data we return safe
// defaults so the recommender still ranks rather than throwing.
async function getConversionStats({ since = null } = {}) {
  const where = {};
  if (since) where.createdAt = { [Op.gte]: since };
  const rows = await OpportunityEvent.findAll({
    where,
    attributes: ['eventType', [OpportunityEvent.sequelize.fn('COUNT', '*'), 'count']],
    group: ['event_type'],
  });
  const counts = {};
  for (const r of rows) counts[r.eventType] = Number(r.get('count'));
  const generated = counts.generated || 0;
  const submitted = counts.submitted || 0;
  const responded = counts.response_received || 0;
  const won = counts.won || 0;
  const lost = counts.lost || 0;

  const winLossDenom = won + lost;
  return {
    generated,
    submitted,
    response_received: responded,
    won,
    lost,
    submit_rate: generated > 0 ? submitted / generated : 0,
    response_rate: submitted > 0 ? responded / submitted : 0,
    win_rate: winLossDenom > 0 ? won / winLossDenom : null, // null = not enough data
  };
}

// Top categories among won events. Used by win-probability heuristic.
async function topWonCategories({ limit = 3 } = {}) {
  const wonEvents = await OpportunityEvent.findAll({
    where: { eventType: 'won' },
    order: [['createdAt', 'DESC']],
    limit: 200,
  });
  if (wonEvents.length === 0) return [];
  // Each won event carries the opportunity it referred to. We need the
  // category from the opportunities table — load them in one query.
  const { Opportunity } = require('../models');
  const oppIds = [...new Set(wonEvents.map((e) => e.opportunityId))];
  const opps = await Opportunity.findAll({
    where: { id: oppIds },
    attributes: ['id', 'category'],
  });
  const oppMap = new Map();
  for (const o of opps) oppMap.set(o.id, o.category);
  const tally = new Map();
  for (const e of wonEvents) {
    const cat = oppMap.get(e.opportunityId);
    if (!cat) continue;
    tally.set(cat, (tally.get(cat) || 0) + 1);
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([cat]) => cat);
}

module.exports = {
  recordEvent,
  listEvents,
  countByType,
  getConversionStats,
  topWonCategories,
  normalizeResultStatus,
  // v7.1
  hasEventOfType,
  requireSubmitted,
  requireResponded,
  LifecycleViolationError,
  VALID_TYPES,
  CONVERSION_TYPES,
};
