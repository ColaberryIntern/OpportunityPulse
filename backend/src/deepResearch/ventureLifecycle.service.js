// Deep Research Phase 3 — venture lifecycle management.
//
// A venture idea moves through an explicit lifecycle. This service owns the
// state machine: the allowed transitions, transition validation, the audit
// trail (venture_lifecycle_events), and keeping the denormalized
// venture_ideas.lifecycle_state + execution_queue_items.lifecycle_state in
// sync. It is deterministic and fully auditable — every state change is a
// row with from/to/actor/note/timestamp.

const { VentureIdea, VentureLifecycleEvent, ExecutionQueueItem } = require('../models');
const logger = require('../logging/logger');

// The lifecycle states, in canonical order.
const STATES = [
  'discovered',
  'researching',
  'evaluating',
  'approved',
  'generating_requirements',
  'planning_mvp',
  'building',
  'validating',
  'launching',
  'monitoring',
  'archived',
];

// The transition graph. Every state can go to 'archived' (shelve it) and
// 'archived' can go back to 'discovered' (revive it). The forward path is
// the happy path; a few back-edges allow re-evaluation.
const TRANSITIONS = {
  discovered: ['researching', 'evaluating', 'archived'],
  researching: ['evaluating', 'discovered', 'archived'],
  evaluating: ['approved', 'monitoring', 'researching', 'archived'],
  approved: ['generating_requirements', 'evaluating', 'archived'],
  generating_requirements: ['planning_mvp', 'approved', 'archived'],
  planning_mvp: ['building', 'generating_requirements', 'archived'],
  building: ['validating', 'planning_mvp', 'archived'],
  validating: ['launching', 'building', 'archived'],
  launching: ['monitoring', 'validating', 'archived'],
  monitoring: ['evaluating', 'archived'],
  archived: ['discovered'],
};

// Is a transition from → to allowed?
function canTransition(fromState, toState) {
  if (!STATES.includes(toState)) return false;
  const allowed = TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
}

// Transition a venture idea to a new lifecycle state. Validates the
// transition, writes the audit event, updates the denormalized state on the
// venture idea and (if present) its execution queue item. Returns the
// updated lifecycle view.
async function transition(ventureIdeaId, toState, { actor = null, note = null } = {}) {
  const id = Number(ventureIdeaId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('A valid ventureIdeaId is required');
    err.code = 'BAD_INPUT';
    throw err;
  }
  if (!STATES.includes(toState)) {
    const err = new Error(`Unknown lifecycle state: ${toState}`);
    err.code = 'BAD_INPUT';
    throw err;
  }
  const ventureIdea = await VentureIdea.findByPk(id);
  if (!ventureIdea) {
    const err = new Error(`Venture idea ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const fromState = ventureIdea.lifecycleState || 'discovered';
  if (fromState === toState) {
    const err = new Error(`Venture idea is already in state "${toState}"`);
    err.code = 'BAD_INPUT';
    throw err;
  }
  if (!canTransition(fromState, toState)) {
    const err = new Error(`Invalid lifecycle transition: ${fromState} → ${toState}`);
    err.code = 'BAD_INPUT';
    throw err;
  }

  await VentureLifecycleEvent.create({
    ventureIdeaId: id,
    fromState,
    toState,
    actor,
    note: note ? String(note).slice(0, 1000) : null,
  });
  await ventureIdea.update({ lifecycleState: toState });
  // Keep the execution queue item's snapshot in sync if one exists.
  await ExecutionQueueItem.update(
    { lifecycleState: toState },
    { where: { ventureIdeaId: id } },
  );

  logger.info('ventureLifecycle: transition', {
    ventureIdeaId: id, fromState, toState, actor,
  });
  return getLifecycle(id);
}

// The full lifecycle view for a venture idea: current state, allowed next
// states, and the ordered event history.
async function getLifecycle(ventureIdeaId) {
  const id = Number(ventureIdeaId);
  const ventureIdea = await VentureIdea.findByPk(id);
  if (!ventureIdea) {
    const err = new Error(`Venture idea ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const events = await VentureLifecycleEvent.findAll({
    where: { ventureIdeaId: id },
    order: [['id', 'ASC']],
  });
  const currentState = ventureIdea.lifecycleState || 'discovered';
  return {
    venture_idea_id: id,
    current_state: currentState,
    owner: ventureIdea.lifecycleOwner || null,
    allowed_transitions: TRANSITIONS[currentState] || [],
    events: events.map((e) => ({
      from_state: e.fromState,
      to_state: e.toState,
      actor: e.actor,
      note: e.note,
      created_at: e.createdAt,
    })),
  };
}

// Set the owner of a venture idea (lightweight — not a lifecycle transition).
async function setOwner(ventureIdeaId, owner) {
  const ventureIdea = await VentureIdea.findByPk(Number(ventureIdeaId));
  if (!ventureIdea) {
    const err = new Error(`Venture idea ${ventureIdeaId} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  await ventureIdea.update({ lifecycleOwner: owner ? String(owner).slice(0, 120) : null });
  await ExecutionQueueItem.update(
    { owner: ventureIdea.lifecycleOwner },
    { where: { ventureIdeaId: ventureIdea.id } },
  );
  return { venture_idea_id: ventureIdea.id, owner: ventureIdea.lifecycleOwner };
}

module.exports = {
  STATES,
  TRANSITIONS,
  canTransition,
  transition,
  getLifecycle,
  setOwner,
};
