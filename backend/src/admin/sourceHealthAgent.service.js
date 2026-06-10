// OIED v9.10 — Source Health Auto-Triage Agent.
//
// Runs after the daily ingest, scans Data Source Health for failing /
// zero_yield rows, retries each one once (transient timeouts and 5xx
// often clear on retry), classifies remaining failures into actionable
// categories, and emails the operator a summary — but only when there
// is something worth reading. No email on clean days.
//
// Conservative on auto-fix surface — never edits credentials, schema,
// feed URLs, or config. The agent's job is to TRIAGE: retry the cheap
// stuff and tell a human what's still broken with a clear next step.

const logger = require('../logging/logger');
const ingestionSvc = require('../ingestion/ingestion.service');
const { sendEmail } = require('../utils/email');
const dataSourceHealth = require('./dataSourceHealth.controller');
// v0.7 (Phase 5 polish): include vault doc expiry alerts in the daily
// Source Health email. Loaded lazily so this module loads cleanly when
// the documents subsystem isn't initialized (tests, partial smoke, etc.).
const documentService = require('../documents/document.service');
const documentTypes = require('../documents/documentTypes');
// v9.11: channel-level freshness. Per-source health can't see a whole surface
// going stale while its individual sources still look "fine" (the capital
// channel outage hid here for 4 months). This adds the surface-level signal.
const { checkChannelFreshness } = require('./channelFreshness.service');

// Classifier rules. Order matters — first match wins. Each rule returns
// a category + a one-liner human action. Patterns checked against the
// rendered last_run_error string from the health endpoint.
const CLASSIFY_RULES = [
  {
    pattern: /requires .*environment variable|API_KEY|APP_ID|APP_KEY/i,
    category: 'missing_credentials',
    action: 'Set the named environment variable in .env.prod and redeploy.',
  },
  {
    pattern: /value too long for type|character varying\(/i,
    category: 'schema_overflow',
    action: 'Database column is too small for the source data. Migration required.',
  },
  {
    pattern: /returned 4\d\d|invalid|validation|length of the|should be between/i,
    category: 'upstream_validation',
    action: 'Adapter sent input the upstream rejected. Review config (search terms, tags, params).',
  },
  {
    pattern: /timed? ?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|503|502|504|rate.?limit|429/i,
    category: 'upstream_unavailable',
    action: 'Upstream slow / rate-limited / unreachable. Often clears on its own; if persistent, check upstream status page.',
  },
  {
    pattern: /404|not found|moved permanently|301|410/i,
    category: 'feed_url_dead',
    action: 'Upstream URL is dead. Update config.feeds (and DEFAULT_FEEDS in the adapter) to a current URL.',
  },
];

function classifyError(errStr) {
  if (!errStr) return { category: 'unknown', action: 'Inspect ingestion_logs for the failing source.' };
  for (const rule of CLASSIFY_RULES) {
    if (rule.pattern.test(errStr)) {
      return { category: rule.category, action: rule.action };
    }
  }
  return { category: 'unknown', action: 'Open the source on the Source Health page and review the last error.' };
}

// Snapshot the health endpoint into a plain object. Reuses the same
// derivation the page does so we never drift.
async function snapshotHealth() {
  return new Promise((resolve, reject) => {
    const fakeRes = {
      status: () => fakeRes,
      json: (b) => {
        if (b.status === 'success') resolve(b.data);
        else reject(new Error(b.message || 'health snapshot failed'));
      },
    };
    dataSourceHealth.getDataSourcesHealth({}, fakeRes).catch(reject);
  });
}

async function attemptRecovery(name) {
  try {
    const result = await ingestionSvc.runIngestion(name);
    return {
      name,
      ok: result.status === 'success' || result.status === 'partial',
      status: result.status,
      created: result.recordsCreated || 0,
      updated: result.recordsUpdated || 0,
      errors: Array.isArray(result.errors) ? result.errors.length : 0,
    };
  } catch (e) {
    return { name, ok: false, status: 'error', error: e.message };
  }
}

// Build the report object — used for both the email and the API
// response. Has a `should_email` flag so the cron skips empty reports.
async function runAgent({ retry = true } = {}) {
  const startedAt = new Date();
  const before = await snapshotHealth();

  const failing = before.sources.filter((s) => s.status === 'failing');
  const zeroYield = before.sources.filter((s) => s.status === 'zero_yield');

  // Try a retry on every failing source. zero_yield sources don't get
  // retried — the issue is "cron ran fine but produced 0 rows," and a
  // second run won't change anything. Those are flagged for manual review.
  const retried = [];
  if (retry) {
    for (const s of failing) {
      // eslint-disable-next-line no-await-in-loop
      const out = await attemptRecovery(s.name);
      retried.push(out);
    }
  }

  // Re-snapshot to see who recovered.
  const after = retry ? await snapshotHealth() : before;
  const stillFailing = after.sources.filter((s) => s.status === 'failing');
  const stillZeroYield = after.sources.filter((s) => s.status === 'zero_yield');

  const recoveredNames = new Set(
    failing
      .map((s) => s.name)
      .filter((n) => !stillFailing.find((s) => s.name === n)),
  );

  // Classify what's still broken (using the AFTER snapshot — that's the
  // latest state).
  const failingClassified = stillFailing.map((s) => ({
    name: s.name,
    channel: (s.channel && s.channel.label) || s.channel?.key || 'unknown',
    error: s.last_run_error,
    last_run_at: s.last_run_at,
    rows_7d: s.rows_7d,
    ...classifyError(s.last_run_error),
  }));
  const zeroYieldClassified = stillZeroYield.map((s) => ({
    name: s.name,
    channel: (s.channel && s.channel.label) || s.channel?.key || 'unknown',
    last_run_at: s.last_run_at,
    rows_7d: s.rows_7d,
    consecutive_zero_runs: s.consecutive_zero_runs,
    category: 'source_dried_up',
    action: 'No errors but no fresh rows. Probe the upstream feed manually; consider adding a backup source.',
  }));

  // v0.7 (Phase 5 polish): vault doc expiry alerts. Pulls expiring +
  // expired docs from EVERY org (admin agent doesn't know its scope);
  // each row carries the org_id so the email can group by tenant.
  const expiringDocs = await loadExpiringDocs().catch((e) => {
    logger.warn('sourceHealthAgent: expiry scan failed (continuing without)', { error: e.message });
    return { expired: [], expiring_soon: [] };
  });

  // Surface-level freshness — independent of per-source status.
  const channelFreshness = await checkChannelFreshness().catch((e) => {
    logger.warn('sourceHealthAgent: channel freshness scan failed (continuing without)', { error: e.message });
    return { stale: [], fresh: [], stale_days: 14 };
  });

  const report = {
    started_at: startedAt.toISOString(),
    ended_at: new Date().toISOString(),
    summary_before: before.summary,
    summary_after: after.summary,
    retried,
    recovered: Array.from(recoveredNames),
    still_failing: failingClassified,
    zero_yield: zeroYieldClassified,
    expired_docs: expiringDocs.expired,
    expiring_docs: expiringDocs.expiring_soon,
    stale_channels: channelFreshness.stale,
    channel_stale_days: channelFreshness.stale_days,
    needs_human: failingClassified.length + zeroYieldClassified.length
      + expiringDocs.expired.length + expiringDocs.expiring_soon.length
      + channelFreshness.stale.length,
    should_email: failingClassified.length + zeroYieldClassified.length > 0
      || recoveredNames.size > 0
      || expiringDocs.expired.length > 0
      || expiringDocs.expiring_soon.length > 0
      || channelFreshness.stale.length > 0,
  };
  return report;
}

// v0.7: pull every active vault doc with an expiry that's already past
// or coming up in the next 30 days. Returns {expired, expiring_soon}
// where each item carries the doc + days math + org_id (for multi-org
// future).
async function loadExpiringDocs() {
  // listDocuments doesn't filter by 'expired' separately, so we ask for
  // everything expiring within 30 days then split.
  const expiringWithin30 = await documentService.listDocuments({
    expiringWithinDays: 30,
    // organizationId omitted → all orgs, since the agent runs at admin
    // scope. Future: split by org for multi-tenant emails.
    organizationId: 1,
  }).catch(() => []);
  const now = Date.now();
  const expired = [];
  const expiring = [];
  for (const d of expiringWithin30) {
    if (!d.expiresAt) continue;
    const days = Math.round((new Date(d.expiresAt).getTime() - now) / 86_400_000);
    const item = {
      id: d.id,
      type: d.type,
      type_label: documentTypes.labelFor(d.type),
      name: d.name,
      version: d.version,
      scope: d.scope,
      expires_at: d.expiresAt,
      days_until_expiry: days,
    };
    if (days < 0) expired.push(item);
    else expiring.push(item);
  }
  // Sort: most urgent first (most-expired, then closest-to-expiry).
  expired.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
  expiring.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
  return { expired, expiring_soon: expiring };
}

function fmtAgo(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function buildEmailHtml(report, dashboardUrl) {
  const { recovered, still_failing: stillFailing, zero_yield: zy, summary_after: summary } = report;
  const sect = (title, body) => `
    <h3 style="margin:18px 0 6px 0;font-family:system-ui,sans-serif;color:#1a365d">${title}</h3>
    ${body}`;
  const liStyle = 'margin:0 0 6px 0;font-family:system-ui,sans-serif;font-size:14px';
  const recoveredHtml = recovered.length === 0
    ? ''
    : sect(`✅ Auto-recovered after retry (${recovered.length})`,
      `<ul>${recovered.map((n) => `<li style="${liStyle}">${n}</li>`).join('')}</ul>`);

  const failingHtml = stillFailing.length === 0
    ? ''
    : sect(`❌ Still failing (${stillFailing.length})`,
      `<ul>${stillFailing.map((s) => `
        <li style="${liStyle}">
          <strong>${s.name}</strong> <span style="color:#888">(${s.channel}, last run ${fmtAgo(s.last_run_at)})</span><br/>
          <span style="color:#dc2626;font-size:13px">${(s.error || '(no error message)').slice(0, 320)}</span><br/>
          <span style="color:#444;font-size:13px"><em>Category: ${s.category}.</em> ${s.action}</span>
        </li>`).join('')}</ul>`);

  const zyHtml = zy.length === 0
    ? ''
    : sect(`⚠️ Zero yield — no fix attempted, manual review (${zy.length})`,
      `<ul>${zy.map((s) => `
        <li style="${liStyle}">
          <strong>${s.name}</strong> <span style="color:#888">(${s.channel}, ${s.consecutive_zero_runs} consecutive empty runs)</span><br/>
          <span style="color:#444;font-size:13px"><em>Category: ${s.category}.</em> ${s.action}</span>
        </li>`).join('')}</ul>`);

  // v0.7 (Phase 5 polish) — vault doc expiries.
  const expiredDocs = report.expired_docs || [];
  const expiringDocs = report.expiring_docs || [];
  const expiredHtml = expiredDocs.length === 0 ? '' :
    sect(`🚨 Expired vault documents (${expiredDocs.length})`,
      `<ul>${expiredDocs.map((d) => `
        <li style="${liStyle}">
          <strong>${d.type_label}</strong> — ${d.name} <span style="color:#888">(v${d.version}, ${d.scope})</span><br/>
          <span style="color:#dc2626;font-size:13px">Expired ${-d.days_until_expiry} day${-d.days_until_expiry === 1 ? '' : 's'} ago.</span> Renew + upload a new version.
        </li>`).join('')}</ul>`);
  const expiringHtml = expiringDocs.length === 0 ? '' :
    sect(`⏳ Vault documents expiring soon (${expiringDocs.length})`,
      `<ul>${expiringDocs.map((d) => `
        <li style="${liStyle}">
          <strong>${d.type_label}</strong> — ${d.name} <span style="color:#888">(v${d.version}, ${d.scope})</span><br/>
          <span style="color:#92400e;font-size:13px">Expires in ${d.days_until_expiry} day${d.days_until_expiry === 1 ? '' : 's'}.</span> Schedule renewal now.
        </li>`).join('')}</ul>`);

  // v9.11 — surface-level staleness (a whole channel with no fresh rows).
  const staleChannels = report.stale_channels || [];
  const staleChannelsHtml = staleChannels.length === 0 ? '' :
    sect(`🥶 Stale channels — no new rows in ${report.channel_stale_days || 14} days (${staleChannels.length})`,
      `<ul>${staleChannels.map((c) => `
        <li style="${liStyle}">
          <strong>${c.label}</strong> <span style="color:#888">(${c.age_days == null ? 'no rows ever' : `newest ${c.age_days}d old`})</span><br/>
          <span style="color:#444;font-size:13px">${c.action}</span>
        </li>`).join('')}</ul>`);

  const summaryLine = summary
    ? `<p style="margin:0;color:#444;font-family:system-ui,sans-serif;font-size:14px">
        Current state: ${summary.healthy} healthy · ${summary.stale || 0} stale · ${summary.zero_yield || 0} zero_yield · ${summary.failing || 0} failing · ${summary.disabled || 0} disabled.
       </p>`
    : '';

  return `<div style="font-family:system-ui,sans-serif;max-width:640px">
    <h2 style="margin:0 0 8px 0;color:#1a365d">Opportunity Pulse — Source Health Auto-Triage</h2>
    ${summaryLine}
    ${recoveredHtml}
    ${failingHtml}
    ${zyHtml}
    ${staleChannelsHtml}
    ${expiredHtml}
    ${expiringHtml}
    <p style="margin-top:18px;color:#666;font-size:12px">
      Source Health page: <a href="${dashboardUrl}">${dashboardUrl}</a>
    </p>
  </div>`;
}

function buildEmailText(report, dashboardUrl) {
  const lines = ['Opportunity Pulse — Source Health Auto-Triage', ''];
  if (report.recovered.length) {
    lines.push(`Auto-recovered: ${report.recovered.join(', ')}`);
  }
  if (report.still_failing.length) {
    lines.push('', 'Still failing:');
    for (const s of report.still_failing) {
      lines.push(`  - ${s.name} [${s.category}]: ${(s.error || '').slice(0, 200)}`);
      lines.push(`      → ${s.action}`);
    }
  }
  if (report.zero_yield.length) {
    lines.push('', 'Zero yield (no fix attempted):');
    for (const s of report.zero_yield) {
      lines.push(`  - ${s.name}: ${s.consecutive_zero_runs} empty runs in a row. ${s.action}`);
    }
  }
  if ((report.stale_channels || []).length > 0) {
    lines.push('', `Stale channels (no new rows in ${report.channel_stale_days || 14}d):`);
    for (const c of report.stale_channels) {
      lines.push(`  - ${c.label}: ${c.age_days == null ? 'no rows ever' : `newest ${c.age_days}d old`}. ${c.action}`);
    }
  }
  if ((report.expired_docs || []).length > 0) {
    lines.push('', 'EXPIRED vault docs:');
    for (const d of report.expired_docs) {
      lines.push(`  - ${d.type_label} "${d.name}" — expired ${-d.days_until_expiry}d ago`);
    }
  }
  if ((report.expiring_docs || []).length > 0) {
    lines.push('', 'Vault docs expiring within 30 days:');
    for (const d of report.expiring_docs) {
      lines.push(`  - ${d.type_label} "${d.name}" — expires in ${d.days_until_expiry}d`);
    }
  }
  lines.push('', `Page: ${dashboardUrl}`);
  return lines.join('\n');
}

async function emailReport(report, opts = {}) {
  const to = opts.to || process.env.OIED_SOURCE_HEALTH_AGENT_TO || process.env.OIED_BRIEFING_TO;
  if (!to) {
    logger.warn('sourceHealthAgent: no recipient configured (set OIED_SOURCE_HEALTH_AGENT_TO)');
    return { sent: false, reason: 'no_recipient' };
  }
  if (!report.should_email) {
    return { sent: false, reason: 'nothing_to_report' };
  }
  const dashboardUrl = (process.env.OIED_PUBLIC_URL || 'http://95.216.199.47') + '/admin/data-sources';
  const needsHuman = report.still_failing.length + report.zero_yield.length
    + (report.stale_channels || []).length;
  const recovered = report.recovered.length;
  const subject = needsHuman > 0
    ? `[Opportunity Pulse] ${needsHuman} source${needsHuman === 1 ? '' : 's'} need attention${recovered ? ` — ${recovered} auto-recovered` : ''}`
    : `[Opportunity Pulse] ${recovered} source${recovered === 1 ? '' : 's'} auto-recovered`;
  try {
    const result = await sendEmail({
      to,
      subject,
      html: buildEmailHtml(report, dashboardUrl),
      text: buildEmailText(report, dashboardUrl),
    });
    return { sent: !!(result && (result.success || result.messageId)), result };
  } catch (e) {
    logger.error('sourceHealthAgent: email send failed', { error: e.message });
    return { sent: false, reason: 'send_failed', error: e.message };
  }
}

async function runAndEmail(opts = {}) {
  const report = await runAgent(opts);
  const emailResult = await emailReport(report, opts);
  return { report, email: emailResult };
}

module.exports = {
  runAgent,
  runAndEmail,
  emailReport,
  classifyError,
  buildEmailHtml,
  buildEmailText,
};
