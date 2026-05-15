// Deep Research Phase 6 — dependency review workflow.
//
// Wraps actions a human takes against the Phase 5 directional dependency
// edges (dependency_edges). Each action writes an append-only row into
// dependency_reviews AND updates the edge's status / metadata. No edges
// auto-resolve.
//
// Actions:
//   approve       — edge becomes 'confirmed'
//   reject        — edge becomes 'dismissed'
//   annotate      — edge metadata gains a free-text note; status unchanged
//   assign_owner  — edge metadata.owner set; status unchanged
//   resolve       — edge becomes 'resolved' (blocker satisfied)

const { DependencyEdge, DependencyReview, VentureIdea } = require('../models');

const VALID_ACTIONS = ['approve', 'reject', 'annotate', 'assign_owner', 'resolve'];

function statusForAction(action) {
  switch (action) {
    case 'approve': return 'confirmed';
    case 'reject': return 'dismissed';
    case 'resolve': return 'resolved';
    default: return null; // annotate / assign_owner — status unchanged
  }
}

async function recordAction(dependencyEdgeId, { action, owner = null, note = null, actor = null }) {
  if (!VALID_ACTIONS.includes(action)) {
    const err = new Error(`Invalid action ${action}`); err.code = 'BAD_INPUT'; throw err;
  }
  const edge = await DependencyEdge.findByPk(dependencyEdgeId);
  if (!edge) {
    const err = new Error(`Dependency edge ${dependencyEdgeId} not found`);
    err.code = 'NOT_FOUND'; throw err;
  }
  const newStatus = statusForAction(action);
  const updates = { metadata: { ...(edge.metadata || {}) } };
  if (newStatus) updates.status = newStatus;
  if (owner) updates.metadata.owner = owner;
  if (note) {
    if (!Array.isArray(updates.metadata.notes)) updates.metadata.notes = [];
    updates.metadata.notes.push({
      note, actor, action, at: new Date().toISOString(),
    });
  }
  updates.metadata.last_action = action;
  updates.metadata.last_actor = actor || null;
  updates.metadata.last_action_at = new Date().toISOString();
  await edge.update(updates);

  const review = await DependencyReview.create({
    dependencyEdgeId, action, owner, note, actor,
  });
  return { edge: edge.toJSON(), review: review.toJSON() };
}

async function getReviewsForEdge(dependencyEdgeId) {
  const rows = await DependencyReview.findAll({
    where: { dependencyEdgeId }, order: [['created_at', 'ASC']],
  });
  return rows.map((r) => r.toJSON());
}

async function listOpenForReview({ limit = 100 } = {}) {
  const edges = await DependencyEdge.findAll({
    where: { status: 'proposed' },
    order: [['cascade_risk', 'DESC'], ['created_at', 'DESC']],
    limit,
  });
  const ventureIds = new Set();
  for (const e of edges) {
    ventureIds.add(e.blockerVentureId); ventureIds.add(e.blockedVentureId);
  }
  const ventures = ventureIds.size > 0
    ? await VentureIdea.findAll({ where: { id: [...ventureIds] } })
    : [];
  const titleMap = new Map(ventures.map((v) => [v.id, v.title]));
  return edges.map((e) => {
    const j = e.toJSON();
    return {
      ...j,
      blocker_title: titleMap.get(j.blockerVentureId) || null,
      blocked_title: titleMap.get(j.blockedVentureId) || null,
    };
  });
}

async function listRecentActions({ limit = 50 } = {}) {
  const rows = await DependencyReview.findAll({
    order: [['created_at', 'DESC']], limit,
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  VALID_ACTIONS, statusForAction,
  recordAction, getReviewsForEdge, listOpenForReview, listRecentActions,
};
