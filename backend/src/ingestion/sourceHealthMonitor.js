const { DataSource, IngestionLog } = require('../models');
const { INGESTION_STATUS } = require('../config/constants');
const logger = require('../logging/logger');
const { sendEmail } = require('../utils/email');

/**
 * Consecutive-failure monitor for ingestion sources.
 *
 * Why this exists: on 2026-08-01 the SAM.gov API key expired. The keyed `sam_gov`
 * source returned 401 on every run for 12 days and nothing said so, because the
 * keyless `sam_gov_scraper` source kept succeeding alongside it and the dashboard
 * still looked populated. A dead credential should surface the same day, not when
 * someone notices a flat line.
 *
 * Failure model:
 * - What fails: the alert email (SMTP down, bad credentials).
 * - Retry: none in-process. The alert marker is written ONLY after a successful
 *   send, so an unsent alert is naturally retried on the next monitor pass.
 * - Recovery if never sendable: the streak stays unmarked and every pass logs an
 *   error with error_class, so the failure is visible in the log stream.
 * - Not handled: partial/degraded runs (status 'partial' breaks a streak by design,
 *   since the source is still returning data).
 */

const DEFAULT_THRESHOLD = 3;
const ALERT_MARKER = 'failureAlertSentAt';
const DEFAULT_RECIPIENTS = 'ali@colaberry.com';

function alertRecipients() {
  return (process.env.INGESTION_ALERT_RECIPIENTS || DEFAULT_RECIPIENTS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Pull the first error string off a log row, if the adapter recorded one. */
function firstError(log) {
  const errs = log && log.errors;
  if (!Array.isArray(errs) || !errs.length) return null;
  const e = errs[0];
  return typeof e === 'string' ? e : e && (e.message || e.error || JSON.stringify(e));
}

function buildAlert({ source, logs, threshold }) {
  const since = logs[logs.length - 1].startedAt || logs[logs.length - 1].started_at;
  const reason = logs.map(firstError).find(Boolean) || 'no error detail recorded';

  const html = `
<div style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6;">
<p><strong>Ingestion source "${source.name}" has failed ${threshold} runs in a row.</strong></p>
<p>First failure in this streak: ${new Date(since).toISOString()}</p>
<p>Reported error: ${reason}</p>
<p>Most common cause on keyed sources is an expired or revoked API credential. Check the credential before assuming an upstream outage, since an expired key and a dead upstream both surface as a failed run.</p>
<p>This alert fires once per streak. It will fire again only if the source recovers and then fails ${threshold} more times.</p>
</div>`.trim();

  const text = [
    `Ingestion source "${source.name}" has failed ${threshold} runs in a row.`,
    `First failure in this streak: ${new Date(since).toISOString()}`,
    `Reported error: ${reason}`,
    '',
    'Most common cause on keyed sources is an expired or revoked API credential.',
    `This alert fires once per streak. It will fire again only if the source recovers and then fails ${threshold} more times.`,
  ].join('\n');

  return {
    subject: `[Opportunity Pulse] ${source.name} has failed ${threshold} runs in a row`,
    html,
    text,
  };
}

/**
 * Check every enabled data source for a consecutive-failure streak and alert once per streak.
 *
 * Idempotent: the alert is recorded on the newest failing log row's metadata, so
 * re-running without a new ingestion run sends nothing.
 *
 * @param {object}   [opts]
 * @param {number}   [opts.threshold=3]  Consecutive failures required to alert.
 * @param {Function} [opts.send]         Injectable sender (defaults to utils/email sendEmail).
 * @returns {Promise<{checked: number, alerted: string[], suppressed: string[]}>}
 */
async function checkSourceHealth({ threshold = DEFAULT_THRESHOLD, send = sendEmail } = {}) {
  const sources = await DataSource.findAll({ where: { enabled: true } });
  const alerted = [];
  const suppressed = [];

  for (const source of sources) {
    const logs = await IngestionLog.findAll({
      where: { dataSourceId: source.id },
      order: [['startedAt', 'DESC']],
      limit: threshold,
    });

    const streak =
      logs.length === threshold && logs.every((l) => l.status === INGESTION_STATUS.FAILED);
    if (!streak) continue;

    const newest = logs[0];
    const metadata = newest.metadata || {};
    if (metadata[ALERT_MARKER]) {
      suppressed.push(source.name);
      continue;
    }

    const { subject, html, text } = buildAlert({ source, logs, threshold });

    try {
      await send({ to: alertRecipients(), subject, html, text });
    } catch (error) {
      // Leave the marker unwritten so the next pass retries this alert.
      logger.error('Ingestion failure alert could not be sent.', {
        event: 'ingestion_alert_send_failed',
        source: source.name,
        error_class: error.name || 'Error',
        error: error.message,
      });
      continue;
    }

    await newest.update({ metadata: { ...metadata, [ALERT_MARKER]: new Date().toISOString() } });

    logger.warn('Ingestion source failing consecutively; alert sent.', {
      event: 'ingestion_failure_streak',
      source: source.name,
      consecutive_failures: threshold,
      recipients: alertRecipients().length,
    });
    alerted.push(source.name);
  }

  return { checked: sources.length, alerted, suppressed };
}

module.exports = { checkSourceHealth, ALERT_MARKER, DEFAULT_THRESHOLD };
