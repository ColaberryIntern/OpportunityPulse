// Submission Readiness Engine v0.8 — pursuit state machine.
//
// State transitions:
//   none      → pursuing  (admin clicks "Pursue this bid")
//   pursuing  → declined  (admin clicks "Cancel pursuit" before submitting)
//   pursuing  → submitted (admin marks the bid submitted — future, not in v0.8)
//
// Rationale: a generic 67% baseline against 6 standard docs is misleading
// without knowing what THIS bid actually requires. Until the user signals
// real intent (Pursue) and provides the RFP body (manual upload, since
// Cloudflare blocks ~80% of Bonfire portals), we don't compute readiness.

const { BonfireOpportunity } = require('../models');
const logger = require('../logging/logger');

const VALID_STATUSES = ['none', 'pursuing', 'declined', 'submitted'];

const ALLOWED_TRANSITIONS = {
  none: ['pursuing'],
  pursuing: ['declined', 'submitted', 'none'], // 'none' = un-pursue (clear pursuit)
  declined: ['pursuing'], // can re-pursue after declining
  submitted: [],          // terminal — no transitions out (audit trail)
};

class PursuitError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function getStatus(bonfireOpportunityId) {
  const opp = await BonfireOpportunity.findByPk(bonfireOpportunityId, {
    attributes: ['id', 'pursuitStatus', 'pursuedAt', 'pursuedBy'],
  });
  if (!opp) throw new PursuitError('Opportunity not found', 'NOT_FOUND');
  return {
    bonfire_opportunity_id: opp.id,
    pursuit_status: opp.pursuitStatus || 'none',
    pursued_at: opp.pursuedAt,
    pursued_by: opp.pursuedBy,
  };
}

async function transition(bonfireOpportunityId, { to, userId }) {
  if (!VALID_STATUSES.includes(to)) {
    throw new PursuitError(`Invalid target status: ${to}`, 'INVALID_STATUS');
  }
  const opp = await BonfireOpportunity.findByPk(bonfireOpportunityId);
  if (!opp) throw new PursuitError('Opportunity not found', 'NOT_FOUND');

  const from = opp.pursuitStatus || 'none';
  if (from === to) {
    // Idempotent — no-op, return current state.
    return {
      bonfire_opportunity_id: opp.id,
      pursuit_status: from,
      pursued_at: opp.pursuedAt,
      pursued_by: opp.pursuedBy,
      transitioned: false,
    };
  }
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new PursuitError(
      `Illegal transition: ${from} → ${to} (allowed from ${from}: ${allowed.join(', ') || 'none'})`,
      'ILLEGAL_TRANSITION',
    );
  }

  opp.pursuitStatus = to;
  if (to === 'pursuing') {
    opp.pursuedAt = new Date();
    if (userId) opp.pursuedBy = userId;
  } else if (to === 'none') {
    // Reset — clear audit fields so re-pursue starts fresh.
    opp.pursuedAt = null;
    opp.pursuedBy = null;
  }
  // 'declined' / 'submitted': keep pursued_at + pursued_by as historical record.
  await opp.save();

  logger.info('bonfire pursuit transition', {
    bonfireOpportunityId, from, to, userId: userId || null,
  });

  return {
    bonfire_opportunity_id: opp.id,
    pursuit_status: opp.pursuitStatus,
    pursued_at: opp.pursuedAt,
    pursued_by: opp.pursuedBy,
    transitioned: true,
    from,
  };
}

module.exports = {
  PursuitError,
  VALID_STATUSES,
  ALLOWED_TRANSITIONS,
  getStatus,
  transition,
};
