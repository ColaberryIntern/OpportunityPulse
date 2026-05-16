// Deep Research Phase 9 — proposal readiness timeline.
//
// Append-only event log per pursuit. Tracks: milestones, draft progress,
// compliance completion, artifact readiness, staffing completion, blocker
// aging, submission milestones. Builds an overview that the Capture Ops
// dashboard + pursuit page render.

const { Op } = require('sequelize');
const { ProposalTimelineEvent, PursuitWorkspace } = require('../models');

const VALID_EVENT_KINDS = [
  'milestone', 'draft', 'compliance', 'artifact',
  'staffing', 'blocker', 'submission', 'note',
];
const VALID_STATUSES = ['pending', 'in_progress', 'done', 'overdue', 'blocked'];
const VALID_SEVERITIES = ['normal', 'high', 'critical'];

function assertValidKind(k) {
  if (!VALID_EVENT_KINDS.includes(k)) {
    const err = new Error(`Invalid event_kind: ${k}`); err.code = 'BAD_INPUT'; throw err;
  }
}

async function addEvent({
  pursuitId, eventKind, label, detail = null, status = 'pending',
  dueAt = null, severity = 'normal', metadata = {},
} = {}) {
  assertValidKind(eventKind);
  if (!label) { const err = new Error('label is required'); err.code = 'BAD_INPUT'; throw err; }
  const row = await ProposalTimelineEvent.create({
    pursuitId, eventKind, label, detail, status,
    dueAt, severity, metadata,
  });
  return row.toJSON();
}

async function updateEvent(id, updates = {}) {
  const row = await ProposalTimelineEvent.findByPk(id);
  if (!row) { const err = new Error(`Event ${id} not found`); err.code = 'NOT_FOUND'; throw err; }
  const patch = {};
  for (const k of ['label', 'detail', 'dueAt', 'severity', 'metadata']) {
    if (updates[k] !== undefined) patch[k] = updates[k];
  }
  if (updates.status) {
    if (!VALID_STATUSES.includes(updates.status)) {
      const err = new Error(`Invalid status: ${updates.status}`); err.code = 'BAD_INPUT'; throw err;
    }
    patch.status = updates.status;
    if (updates.status === 'done') patch.completedAt = new Date();
  }
  await row.update(patch);
  return row.toJSON();
}

async function listForPursuit(pursuitId) {
  const rows = await ProposalTimelineEvent.findAll({
    where: { pursuitId: Number(pursuitId) },
    order: [['due_at', 'ASC NULLS LAST'], ['created_at', 'ASC']],
    limit: 200,
  });
  return rows.map((r) => r.toJSON());
}

// Seed a default timeline for a fresh pursuit. Idempotent: a pursuit with
// at least one event is left untouched.
async function seedDefaultTimeline(pursuitId, { dueAt = null } = {}) {
  const existing = await ProposalTimelineEvent.count({ where: { pursuitId: Number(pursuitId) } });
  if (existing > 0) return { pursuit_id: Number(pursuitId), created: 0, skipped: true };
  const now = Date.now();
  const days = (n) => (dueAt ? new Date(new Date(dueAt).getTime() - n * 86400_000) : new Date(now + n * 86400_000));
  const defaults = [
    { eventKind: 'milestone', label: 'Pursuit activated', status: 'done' },
    { eventKind: 'compliance', label: 'Compliance matrix built', status: 'pending', dueAt: days(7) },
    { eventKind: 'artifact', label: 'Capability statement attached', status: 'pending', dueAt: days(5) },
    { eventKind: 'artifact', label: 'Past performance attached', status: 'pending', dueAt: days(5) },
    { eventKind: 'staffing', label: 'Key personnel resumes ready', status: 'pending', dueAt: days(3) },
    { eventKind: 'draft', label: 'Proposal draft generated', status: 'pending', dueAt: days(2) },
    { eventKind: 'milestone', label: 'Internal red-team review', status: 'pending', dueAt: days(1) },
    { eventKind: 'submission', label: 'Submission deadline', status: 'pending', dueAt: days(0), severity: 'critical' },
  ];
  const created = [];
  for (const d of defaults) {
    // eslint-disable-next-line no-await-in-loop
    const row = await ProposalTimelineEvent.create({ pursuitId: Number(pursuitId), ...d });
    created.push(row.toJSON());
  }
  return { pursuit_id: Number(pursuitId), created: created.length, events: created };
}

// Build a summary of a pursuit's timeline. Used by Capture Ops dashboard.
async function summarizeForPursuit(pursuitId) {
  const events = await listForPursuit(pursuitId);
  const now = Date.now();
  let pending = 0; let inProgress = 0; let done = 0; let blocked = 0; let overdue = 0;
  let earliestDue = null;
  for (const e of events) {
    if (e.status === 'pending') pending += 1;
    if (e.status === 'in_progress') inProgress += 1;
    if (e.status === 'done') done += 1;
    if (e.status === 'blocked') blocked += 1;
    if (e.dueAt && new Date(e.dueAt).getTime() < now && e.status !== 'done') overdue += 1;
    if (e.dueAt && e.status !== 'done') {
      const due = new Date(e.dueAt).getTime();
      if (earliestDue == null || due < earliestDue) earliestDue = due;
    }
  }
  return {
    pursuit_id: Number(pursuitId),
    total: events.length,
    pending, in_progress: inProgress, done, blocked, overdue,
    earliest_due: earliestDue ? new Date(earliestDue).toISOString() : null,
    completion_pct: events.length > 0 ? Math.round((done / events.length) * 100) : 0,
  };
}

// Auto-detect overdue events and flip their status. Idempotent — safe to
// call on every dashboard read.
async function refreshOverdueStatuses(pursuitId = null) {
  const where = {
    status: { [Op.in]: ['pending', 'in_progress'] },
    dueAt: { [Op.lt]: new Date() },
  };
  if (pursuitId != null) where.pursuitId = Number(pursuitId);
  const rows = await ProposalTimelineEvent.findAll({ where });
  let flipped = 0;
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    await r.update({ status: 'overdue' });
    flipped += 1;
  }
  return { flipped };
}

module.exports = {
  VALID_EVENT_KINDS, VALID_STATUSES, VALID_SEVERITIES,
  addEvent, updateEvent, listForPursuit,
  seedDefaultTimeline, summarizeForPursuit, refreshOverdueStatuses,
};
