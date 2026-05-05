// Daily AI Briefing — composes the day's structured payload:
//   - top_actions       : top 3 from recommendation.getTopActions
//   - bundle_opportunity: best bundle (highest revenue with strategy
//                         present, else highest total value)
//   - ignore_warning    : a low-fit, far-from-close row to skip
//   - totals            : revenue_potential_usd, effort_hours_today,
//                         bundle_revenue_usd
//
// Surfaces:
//   - GET  /api/v1/oied/briefing            (returns the payload)
//   - POST /api/v1/oied/briefing/send       (renders HTML, emails)
// Cron lives in briefing.scheduler.js (default OFF).

const logger = require('../logging/logger');
const { Bundle } = require('../models');
const { sendEmail } = require('../utils/email');
const myOppsSvc = require('./myOpportunities.service');
const recommendations = require('./recommendation.service');
const profileSvc = require('./profile.service');
const billing = require('./billing.service');

function fmtUSD(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ------ Composition logic (pure-ish — only model calls, no AI) -------

async function pickBundleOpportunity(orgId) {
  const bundles = await Bundle.findAll({
    where: { organizationId: orgId },
    order: [['estimatedTotalValue', 'DESC']],
    limit: 50,
  });
  if (bundles.length === 0) return null;
  // Prefer a bundle that already has a strategy populated.
  const withStrategy = bundles.find((b) => b.strategy && b.strategy.what_to_build);
  const choice = withStrategy || bundles[0];
  return choice.toJSON ? choice.toJSON() : choice;
}

// "Ignore this" — surface a row in the user's feed that's high-noise:
// low fit, ≥3 days from close (so it's not act_now), and not already
// in the top actions. Returns null if everything is too good to skip.
function pickIgnoreWarning(rows, topIds, now = new Date()) {
  const exclude = new Set(topIds);
  const candidates = rows
    .filter((r) => !exclude.has(r.id))
    .filter((r) => (r.fitScore || 0) < 30)
    .filter((r) => {
      if (!r.expiresAt) return true;
      const days = Math.ceil((new Date(r.expiresAt).getTime() - now.getTime()) / 86400000);
      return days > 2; // not closing in <=2 days
    });
  if (candidates.length === 0) return null;
  // Pick the one with the *lowest* priority — most clearly skippable.
  candidates.sort((a, b) => (a.priorityScore || 0) - (b.priorityScore || 0));
  const c = candidates[0];
  const reasons = [];
  if ((c.fitScore || 0) < 20) reasons.push('very low profile fit');
  else reasons.push('low profile fit');
  if (Number(c.value || 0) < 5000) reasons.push('below your minimum deal size');
  if (c.bucket === 'standard') reasons.push('no urgency signal');
  return {
    opportunity_id: c.id,
    title: c.title,
    category: c.category,
    fit_score: c.fitScore || 0,
    priority_score: c.priorityScore || 0,
    value: Number(c.value) || 0,
    reason: reasons.join(' · '),
  };
}

async function buildBriefing({
  organizationId,
  userId = null,
  now = new Date(),
} = {}) {
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));

  // 1. Top 3 (don't persist a fresh history snapshot just for the
  //    briefing — caller already gets their own snapshot when they hit
  //    /recommendations directly).
  const topActions = await recommendations.getTopActions(userId, {
    organizationId: orgId, limit: 3, persistHistory: false, now,
  });

  // 2. Bundle of the day.
  const bundleOpp = await pickBundleOpportunity(orgId);

  // 3. Ignore warning — needs a wider sample than top 3.
  const { rows } = await myOppsSvc.listMyOpportunities({
    userId, organizationId: orgId, limit: 50, offset: 0,
  });
  const topIds = topActions.map((t) => t.opportunity_id);
  const ignoreWarning = pickIgnoreWarning(rows, topIds, now);

  // 4. Totals.
  const revenuePotential = topActions.reduce((s, a) => s + (a.expected_value || 0), 0);
  const effortHours      = topActions.reduce((s, a) => s + (a.effort_estimate?.proposal_hours || 0), 0);
  const bundleRevenue    = bundleOpp && bundleOpp.strategy
    ? Number(bundleOpp.strategy.revenue_potential_usd) || 0
    : 0;

  return {
    date: now.toISOString().slice(0, 10),
    organization_id: orgId,
    top_actions: topActions,
    bundle_opportunity: bundleOpp ? {
      id: bundleOpp.id,
      theme: bundleOpp.theme,
      opportunity_count: bundleOpp.opportunityCount || bundleOpp.opportunity_count,
      estimated_total_value: Number(bundleOpp.estimatedTotalValue || bundleOpp.estimated_total_value || 0),
      strategy: bundleOpp.strategy || null,
      blueprint: bundleOpp.blueprint || null,
    } : null,
    ignore_warning: ignoreWarning,
    totals: {
      revenue_potential_usd: revenuePotential,
      effort_hours_today: effortHours,
      bundle_revenue_usd: bundleRevenue,
    },
    generated_at: new Date().toISOString(),
  };
}

// ------ HTML rendering for email body ------------------------------

function buildBriefingHtml(briefing) {
  const top = (briefing.top_actions || []).map((a, i) => `
    <tr>
      <td style="padding:12px 8px; border-bottom:1px solid #eee; font-size:14px;">
        <strong>#${i + 1}. ${escapeHtml(a.title)}</strong><br>
        <span style="color:#666; font-size:12px;">${escapeHtml(a.reason)}</span>
      </td>
      <td align="right" style="padding:12px 8px; border-bottom:1px solid #eee; font-size:13px;">
        <span style="background:#dbeafe; color:#1e40af; padding:2px 8px; border-radius:8px; font-weight:600;">
          ${escapeHtml(fmtUSD(a.expected_value))}
        </span><br>
        <span style="color:#666; font-size:12px;">
          win ${Math.round((a.win_probability || 0) * 100)}% ·
          ${a.effort_estimate?.proposal_hours || '?'}h
        </span>
      </td>
    </tr>
  `).join('');

  const bundleHtml = briefing.bundle_opportunity
    ? `<div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:12px; margin:16px 0;">
         <div style="font-weight:600; color:#5b21b6; margin-bottom:6px;">🧩 Bundle of the Day</div>
         <div style="font-size:14px;">${escapeHtml(briefing.bundle_opportunity.theme)}</div>
         <div style="color:#6b7280; font-size:12px;">
           ${briefing.bundle_opportunity.opportunity_count || '?'} opportunities ·
           ${escapeHtml(fmtUSD(briefing.bundle_opportunity.estimated_total_value))} total
         </div>
         ${briefing.bundle_opportunity.strategy && briefing.bundle_opportunity.strategy.what_to_build
           ? `<div style="margin-top:6px; font-size:13px;">
                <strong>Build:</strong> ${escapeHtml(briefing.bundle_opportunity.strategy.what_to_build)}
              </div>`
           : ''}
       </div>`
    : '';

  const ignoreHtml = briefing.ignore_warning
    ? `<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; margin:16px 0;">
         <div style="font-weight:600; color:#991b1b; margin-bottom:6px;">⚠️  Skip This</div>
         <div style="font-size:14px;">${escapeHtml(briefing.ignore_warning.title)}</div>
         <div style="color:#7f1d1d; font-size:12px;">${escapeHtml(briefing.ignore_warning.reason)}</div>
       </div>`
    : '';

  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 720px; margin: 0 auto;">
      <h1 style="font-size:22px; color:#0f172a;">📨 Today's Briefing — ${briefing.date}</h1>
      <p style="color:#475569; font-size:14px;">
        Top 3 actions ranked by priority × win probability ÷ effort.
      </p>
      <table cellspacing="0" cellpadding="0" style="width:100%; border-collapse: collapse; margin-top: 8px;">
        ${top}
      </table>
      ${bundleHtml}
      ${ignoreHtml}
      <div style="background:#f8fafc; border-radius:8px; padding:12px; margin-top:16px; font-size:13px; color:#0f172a;">
        <strong>Today's potential:</strong>
        ${escapeHtml(fmtUSD(briefing.totals.revenue_potential_usd))} revenue ·
        ${briefing.totals.effort_hours_today}h effort
        ${briefing.totals.bundle_revenue_usd > 0
          ? ` · bundle play ${escapeHtml(fmtUSD(briefing.totals.bundle_revenue_usd))}`
          : ''}
      </div>
      <p style="color:#94a3b8; font-size:12px; margin-top:24px;">
        OIED v4 · briefing for org ${briefing.organization_id}
      </p>
    </div>
  `;
}

// ------ Delivery ---------------------------------------------------

async function deliverBriefing({
  organizationId,
  userId = null,
  to = process.env.OIED_BRIEFING_TO,
  now = new Date(),
} = {}) {
  if (!to) {
    return { sent: false, reason: 'OIED_BRIEFING_TO not configured' };
  }
  // v6: enforce plan limit BEFORE composing — saves the work on over-limit.
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  await billing.enforceOrThrow({ organizationId: orgId, metric: 'briefings_sent' });

  const briefing = await buildBriefing({ organizationId: orgId, userId, now });
  const html = buildBriefingHtml(briefing);
  const result = await sendEmail({
    to,
    subject: `📨 OIED Briefing — ${briefing.date}`,
    html,
    text: `Top actions for ${briefing.date}: ${briefing.top_actions.map((a) => a.title).join(' | ')}`,
  });
  logger.info('OIED briefing: delivered', {
    to, sent: result.sent, top: briefing.top_actions.length,
  });

  // v5: record billable usage only when the email actually went out.
  if (result.sent) {
    await billing.recordUsage({
      organizationId: briefing.organization_id || null,
      metric: 'briefings_sent',
      metadata: { to, date: briefing.date, top: briefing.top_actions.length },
    }).catch(() => null);
  }

  return { sent: !!result.sent, briefing };
}

module.exports = {
  buildBriefing,
  buildBriefingHtml,
  deliverBriefing,
  pickIgnoreWarning,
};
