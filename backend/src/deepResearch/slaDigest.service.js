// Deep Research Phase 12 — SLA escalation email pipeline.
//
// Composes per-tenant SLA digest emails from slaEscalation.generateDigest
// and ships them via the existing email plumbing. Soft-fails on every
// step so a missing mail config can't break the platform. Logs every
// attempt to sla_email_events for full audit.

const { SlaEmailEvent, TenantSettings, User } = require('../models');
const { Op } = require('sequelize');
const slaEscalation = require('./slaEscalation.service');
const auditTrail = require('./auditTrail.service');
const logger = require('../logging/logger');

const DEFAULT_RECIPIENTS_ENV = 'DEEP_RESEARCH_SLA_DIGEST_RECIPIENTS';
const SUBJECT_PREFIX = '[Opportunity Pulse] Capture SLA Digest';

function defaultRecipients() {
  const v = process.env[DEFAULT_RECIPIENTS_ENV];
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

async function recipientsForOrg(orgId) {
  // Prefer explicit env override.
  const env = defaultRecipients();
  if (env.length) return env;
  // Else look up org admins.
  try {
    const users = await User.findAll({
      where: { organizationId: Number(orgId) },
      limit: 50,
    });
    return users.map((u) => u.email).filter(Boolean);
  } catch (e) {
    logger.warn('slaDigest: recipientsForOrg lookup failed', { error: e.message });
    return [];
  }
}

function formatBody(digest) {
  const lines = [];
  lines.push(`Generated at: ${digest.generated_at}`);
  lines.push(`Organization: ${digest.organization_id || 'platform'}`);
  lines.push('');
  lines.push('Counts:');
  lines.push(`  Open: ${digest.counts.open}`);
  lines.push(`  Acknowledged: ${digest.counts.acknowledged}`);
  lines.push(`  Resolved (last 24h): ${digest.counts.resolved_last_24h}`);
  lines.push('');
  if (digest.critical_open && digest.critical_open.length) {
    lines.push('Critical open events (severity ≥ 80):');
    for (const e of digest.critical_open) {
      lines.push(`  [#${e.id} sev ${e.severity}] ${e.slaKind} — ${e.scopeKind}#${e.scopeId} (age ${e.ageDays || '—'}d)`);
      if (e.escalation) lines.push(`    ${e.escalation}`);
    }
  } else {
    lines.push('No critical open events.');
  }
  lines.push('');
  lines.push(digest.recommendation || '');
  lines.push('');
  lines.push('— Opportunity Pulse Governance');
  return lines.join('\n');
}

// Generate the digest for one org + record (and optionally ship) the email.
async function sendForOrg(orgId, {
  recipients = null, digestKind = 'daily', severityFilter = null,
  dryRun = true,
} = {}) {
  const digest = await slaEscalation.generateDigest({ organizationId: orgId });
  const finalRecipients = recipients && recipients.length
    ? recipients : await recipientsForOrg(orgId);
  const subject = `${SUBJECT_PREFIX} — ${digest.counts.open} open / ${digest.counts.acknowledged} ack'd`;
  const body = formatBody(digest);
  const row = await SlaEmailEvent.create({
    organizationId: orgId == null ? null : Number(orgId),
    recipientEmail: finalRecipients.join(','),
    digestKind, severityFilter,
    eventsIncluded: digest.counts.open + digest.counts.acknowledged,
    status: dryRun ? 'dry_run' : 'queued',
    subject,
    bodyPreview: body.slice(0, 4000),
    metadata: { digest_counts: digest.counts, dry_run: dryRun },
  });

  if (!dryRun) {
    // Plug into the existing Source Health Agent email plumbing. The send
    // is best-effort — failures are logged on the email_events row but do
    // not throw.
    try {
      // eslint-disable-next-line global-require
      const mailer = require('../utils/email');
      if (mailer && typeof mailer.sendEmail === 'function') {
        for (const recipient of finalRecipients) {
          // eslint-disable-next-line no-await-in-loop
          await mailer.sendEmail({ to: recipient, subject, text: body });
        }
        row.status = 'sent';
        row.sentAt = new Date();
        await row.save();
      } else {
        row.status = 'no_mailer';
        row.errorMessage = 'mailer not configured';
        await row.save();
      }
    } catch (e) {
      row.status = 'failed';
      row.errorMessage = e.message;
      await row.save();
    }
  }

  await auditTrail.record({
    organizationId: orgId,
    actionKind: 'sla', actionVerb: dryRun ? 'digest.preview' : 'digest.send',
    subjectKind: 'sla_email_event', subjectId: String(row.id),
    payload: { recipients: finalRecipients, counts: digest.counts },
  });
  return { event: row.toJSON(), digest, body };
}

async function listRecentEmails({ organizationId = null, limit = 25 } = {}) {
  const where = {};
  if (organizationId != null) where.organizationId = Number(organizationId);
  const rows = await SlaEmailEvent.findAll({
    where, order: [['created_at', 'DESC']],
    limit: Math.min(200, Number(limit) || 25),
  });
  return rows.map((r) => r.toJSON());
}

async function summarize({ organizationId = null, sinceDays = 7 } = {}) {
  const where = {
    createdAt: { [Op.gte]: new Date(Date.now() - Number(sinceDays) * 86400_000) },
  };
  if (organizationId != null) where.organizationId = Number(organizationId);
  const total = await SlaEmailEvent.count({ where });
  const sent = await SlaEmailEvent.count({ where: { ...where, status: 'sent' } });
  const failed = await SlaEmailEvent.count({ where: { ...where, status: 'failed' } });
  const dryRun = await SlaEmailEvent.count({ where: { ...where, status: 'dry_run' } });
  return {
    window_days: Number(sinceDays),
    total, sent, failed, dry_run: dryRun,
    send_rate: total > 0 ? Math.round((sent / total) * 100) : 0,
  };
}

module.exports = {
  SUBJECT_PREFIX, DEFAULT_RECIPIENTS_ENV,
  defaultRecipients, recipientsForOrg,
  formatBody, sendForOrg, listRecentEmails, summarize,
};
