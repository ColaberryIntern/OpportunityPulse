// OIED daily digest — top-5 opportunities by fit_score, emailed once a day.
//
// Default OFF (env-gated). To enable in prod set OIED_DIGEST_ENABLED=true and
// OIED_DIGEST_TO=ali@colaberry.com (or wherever).

const logger = require('../logging/logger');
const { sendEmail } = require('../utils/email');
const { topByFitScore } = require('./myOpportunities.service');

function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function buildHtml(rows, frontendUrl) {
  const items = rows.map((r) => `
    <tr>
      <td style="padding:12px 8px; border-bottom:1px solid #eee; font-size:14px;">
        <strong style="color:#1a1a1a;">${escapeHtml(r.title || '')}</strong><br>
        <span style="color:#666; font-size:12px;">
          ${escapeHtml(r.location || '')} · ${escapeHtml(r.category || r.type || '')}
        </span>
      </td>
      <td align="right" style="padding:12px 8px; border-bottom:1px solid #eee; font-size:14px;">
        <span style="display:inline-block; background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:8px; font-weight:600;">
          ${r.fitScore != null ? r.fitScore : '—'}
        </span><br>
        <span style="color:#666; font-size:12px;">${fmtUSD(r.value)}</span>
      </td>
      <td style="padding:12px 8px; border-bottom:1px solid #eee; font-size:13px; color:#374151;">
        ${escapeHtml(buildWhyItMatches(r))}
      </td>
      <td align="right" style="padding:12px 8px; border-bottom:1px solid #eee;">
        <a href="${frontendUrl}/admin/opportunities/my?focus=${r.id}"
           style="background:#2563eb;color:#fff;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:13px;">
          Take action →
        </a>
      </td>
    </tr>
  `).join('');

  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 720px; margin: 0 auto;">
      <h1 style="font-size:22px; color:#0f172a;">🔥 Top Opportunities for Today</h1>
      <p style="color:#475569; font-size:14px;">
        Curated by the OIED scoring system from ${rows.length} qualifying opportunities (≥ $1,000, active).
      </p>
      <table cellspacing="0" cellpadding="0" style="width:100%; border-collapse: collapse; margin-top: 16px;">
        ${items}
      </table>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">
        OIED daily digest · ${new Date().toLocaleDateString()}
      </p>
    </div>
  `;
}

function buildText(rows) {
  return [
    '🔥 Top Opportunities for Today',
    '',
    ...rows.map((r, i) => [
      `${i + 1}. ${r.title}`,
      `   Score: ${r.fitScore} · Value: ${fmtUSD(r.value)} · ${r.location || ''}`,
      `   Why it matches: ${buildWhyItMatches(r)}`,
      '',
    ].join('\n')),
  ].join('\n');
}

function buildWhyItMatches(r) {
  const b = r.fitBreakdown || {};
  const parts = [];
  if (b.service_match >= 15) parts.push('strong service match');
  if (b.revenue_weight >= 16) parts.push('high revenue tier');
  if (b.automation_score >= 11) parts.push('automatable');
  if (b.repeatability_score >= 11) parts.push('repeatable');
  if (b.strategic_alignment >= 10) parts.push('aligned with TX/AI focus');
  return parts.length ? parts.join(', ') : 'meets value threshold';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function runDigest({ to, frontendUrl, n = 5 } = {}) {
  const rcpt = to || process.env.OIED_DIGEST_TO || process.env.GMAIL_USER;
  if (!rcpt) {
    logger.warn('OIED digest skipped: no recipient configured');
    return { sent: false, reason: 'no_recipient' };
  }
  const top = await topByFitScore({ n });
  if (!top || top.length === 0) {
    logger.info('OIED digest skipped: no qualifying opportunities');
    return { sent: false, reason: 'empty', count: 0 };
  }
  const subject = '🔥 Top Opportunities for Today';
  const html = buildHtml(top, frontendUrl || process.env.FRONTEND_URL || '');
  const text = buildText(top);
  await sendEmail({ to: rcpt, subject, html, text });
  logger.info('OIED digest sent', { to: rcpt, count: top.length });
  return { sent: true, to: rcpt, count: top.length };
}

module.exports = { runDigest, buildHtml, buildText };
