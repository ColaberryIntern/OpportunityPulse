// Deep Research Phase 2 — briefing subscription management.
//
// DB-driven config for the daily executive briefing: each row is a
// recurring scan topic with a frequency, recipient list, and on/off flag.
// The daily scheduler reads enabled rows and runs the ones that are due;
// this service is the CRUD + preview surface behind the briefing center UI.

const { BriefingSubscription, DeepResearchReport, DailyResearchScan } = require('../models');
const emailBriefing = require('./emailBriefing.service');

const FREQUENCIES = ['daily', 'weekly'];
// A subscription is "due" once this many hours have elapsed since its last
// scan. Weekly = 7×.
const FREQUENCY_HOURS = { daily: 24, weekly: 24 * 7 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate + normalize a recipients input into a clean string array.
function normalizeRecipients(input) {
  let list = input;
  if (typeof input === 'string') {
    list = input.split(',');
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => String(s || '').trim())
    .filter((s) => EMAIL_RE.test(s))
    .slice(0, 20);
}

async function listSubscriptions() {
  const rows = await BriefingSubscription.findAll({ order: [['created_at', 'DESC']] });
  return rows.map((r) => r.toJSON());
}

async function createSubscription({
  scanTopic, frequency = 'daily', recipients = [], createdBy = null,
} = {}) {
  const topic = String(scanTopic || '').trim();
  if (!topic) {
    const err = new Error('scanTopic is required');
    err.code = 'BAD_INPUT';
    throw err;
  }
  const freq = FREQUENCIES.includes(frequency) ? frequency : 'daily';
  const row = await BriefingSubscription.create({
    scanTopic: topic.slice(0, 200),
    frequency: freq,
    recipients: normalizeRecipients(recipients),
    enabled: true,
    createdBy,
  });
  return row.toJSON();
}

async function updateSubscription(id, patch = {}) {
  const row = await BriefingSubscription.findByPk(id);
  if (!row) {
    const err = new Error(`Briefing subscription ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const update = {};
  if (patch.scanTopic !== undefined) {
    const topic = String(patch.scanTopic || '').trim();
    if (!topic) {
      const err = new Error('scanTopic cannot be empty');
      err.code = 'BAD_INPUT';
      throw err;
    }
    update.scanTopic = topic.slice(0, 200);
  }
  if (patch.frequency !== undefined && FREQUENCIES.includes(patch.frequency)) {
    update.frequency = patch.frequency;
  }
  if (patch.recipients !== undefined) {
    update.recipients = normalizeRecipients(patch.recipients);
  }
  if (patch.enabled !== undefined) {
    update.enabled = patch.enabled === true || patch.enabled === 'true';
  }
  await row.update(update);
  return row.toJSON();
}

async function deleteSubscription(id) {
  const row = await BriefingSubscription.findByPk(id);
  if (!row) {
    const err = new Error(`Briefing subscription ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  await row.destroy();
  return { id: Number(id), deleted: true };
}

// Is a subscription due to run, given its frequency + last scan time?
function isDue(subscription, now = Date.now()) {
  if (!subscription.enabled) return false;
  if (!subscription.lastScanAt) return true;
  const hours = FREQUENCY_HOURS[subscription.frequency] || 24;
  const elapsedHours = (now - new Date(subscription.lastScanAt).getTime()) / (1000 * 60 * 60);
  return elapsedHours >= hours;
}

// Render a preview of the briefing email — uses the most recent reports as
// the stand-in content so the user can see the format before enabling.
async function previewBriefing() {
  const reports = await DeepResearchReport.findAll({
    where: { isArchived: false },
    order: [['created_at', 'DESC']],
    limit: 5,
    include: [{ association: 'ventureIdeas' }],
  });
  const html = emailBriefing.buildBriefingHtml(reports.map((r) => r.toJSON()));
  return { html, reportCount: reports.length };
}

// Previous briefings — the daily_research_scans log, most recent first,
// grouped lightly so the UI can show "what ran when".
async function listPreviousBriefings({ limit = 50 } = {}) {
  const scans = await DailyResearchScan.findAll({
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(limit) || 50, 200),
  });
  return scans.map((s) => ({
    id: s.id,
    scan_topic: s.scanTopic,
    report_id: s.reportId,
    status: s.status,
    error: s.error,
    started_at: s.startedAt,
    completed_at: s.completedAt,
    created_at: s.createdAt,
  }));
}

module.exports = {
  FREQUENCIES,
  FREQUENCY_HOURS,
  normalizeRecipients,
  listSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  isDue,
  previewBriefing,
  listPreviousBriefings,
};
