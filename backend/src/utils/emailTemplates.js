function verificationEmailTemplate({ name, verificationUrl }) {
  const subject = 'Verify your Opportunity Pulse account';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5;">
    <h1 style="color: #4F46E5; margin: 0; font-size: 24px;">Opportunity Pulse</h1>
  </div>
  <div style="padding: 30px 0;">
    <h2 style="font-size: 20px;">Verify your email address</h2>
    <p>Thanks for signing up${name ? `, ${name}` : ''}! Please verify your email address to get started.</p>
    <div style="text-align: center; padding: 20px 0;">
      <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email</a>
    </div>
    <p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="font-size: 14px; word-break: break-all; color: #4F46E5;">${verificationUrl}</p>
  </div>
  <div style="border-top: 1px solid #eee; padding-top: 15px; font-size: 12px; color: #999; text-align: center;">
    <p>This email was sent by Opportunity Pulse. If you didn't create an account, you can ignore this email.</p>
  </div>
</body>
</html>`;

  const text = `Verify your Opportunity Pulse account\n\nThanks for signing up${name ? `, ${name}` : ''}! Please verify your email by visiting:\n${verificationUrl}\n\nIf you didn't create an account, you can ignore this email.`;

  return { subject, html, text };
}

function resetPasswordEmailTemplate({ resetUrl }) {
  const subject = 'Reset your Opportunity Pulse password';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5;">
    <h1 style="color: #4F46E5; margin: 0; font-size: 24px;">Opportunity Pulse</h1>
  </div>
  <div style="padding: 30px 0;">
    <h2 style="font-size: 20px;">Reset your password</h2>
    <p>We received a request to reset your password. Click the button below to choose a new password.</p>
    <div style="text-align: center; padding: 20px 0;">
      <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
    </div>
    <p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="font-size: 14px; word-break: break-all; color: #4F46E5;">${resetUrl}</p>
    <p style="font-size: 14px; color: #666;">This link will expire in 1 hour.</p>
  </div>
  <div style="border-top: 1px solid #eee; padding-top: 15px; font-size: 12px; color: #999; text-align: center;">
    <p>This email was sent by Opportunity Pulse. If you didn't request a password reset, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

  const text = `Reset your Opportunity Pulse password\n\nWe received a request to reset your password. Visit the link below to choose a new password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.`;

  return { subject, html, text };
}

function digestEmailTemplate({ name, frequency, aiSummary, topMatches, typeCounts, totalNew, since, briefHighlights = [] }) {
  const frequencyLabel = {
    daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-Weekly', monthly: 'Monthly',
  }[frequency] || 'Weekly';

  const typeLabels = {
    gov_contract: 'Gov Contracts', ai_job: 'AI Jobs', investment: 'Investments',
    grant: 'Grants', ai_news: 'AI News',
  };

  const sinceDate = new Date(since).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const subject = `${frequencyLabel} Opportunity Pulse: ${totalNew} new opportunities for you`;

  const matchRows = topMatches.map((m) => {
    const opp = m.opportunity;
    const typeBadge = typeLabels[opp.type] || opp.type;
    const scoreColor = m.relevanceScore >= 70 ? '#059669' : m.relevanceScore >= 50 ? '#D97706' : '#6B7280';
    return `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
          <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">
            ${opp.sourceUrl ? `<a href="${opp.sourceUrl}" style="color: #4F46E5; text-decoration: none;">${escapeHtml(opp.title)}</a>` : escapeHtml(opp.title)}
          </div>
          <div style="font-size: 12px; color: #6B7280;">
            <span style="background: #EEF2FF; color: #4F46E5; padding: 2px 8px; border-radius: 4px; font-weight: 500;">${typeBadge}</span>
            ${opp.location ? `<span style="margin-left: 8px;">${escapeHtml(opp.location)}</span>` : ''}
            <span style="margin-left: 8px; color: ${scoreColor}; font-weight: 600;">${m.relevanceScore}% match</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  const typeSummaryParts = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${typeLabels[type] || type}`)
    .join(' | ');

  const highlightItems = (aiSummary.keyHighlights || [])
    .map(h => `<li style="margin-bottom: 4px; color: #374151;">${escapeHtml(h)}</li>`)
    .join('');

  const actionTypeColors = {
    BUILD: '#4F46E5', BID: '#2563EB', APPLY: '#059669',
    PARTNER: '#7C3AED', INVEST: '#D97706', TEACH: '#E11D48',
  };

  const briefHighlightRows = briefHighlights.map((opp) => {
    const badgeColor = actionTypeColors[opp.actionType] || '#6B7280';
    const valueStr = opp.value ? ` | $${parseFloat(opp.value).toLocaleString()}` : '';
    return `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #FEF3C7;">
          <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">
            ${opp.sourceUrl ? `<a href="${opp.sourceUrl}" style="color: #92400E; text-decoration: none;">${escapeHtml(opp.title)}</a>` : escapeHtml(opp.title)}
          </div>
          <div style="font-size: 12px; color: #6B7280;">
            <span style="background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;">${opp.actionType}</span>
            <span style="margin-left: 8px; font-weight: 600; color: #4F46E5;">${opp.aiScore}/100</span>${valueStr}
          </div>
        </td>
      </tr>`;
  }).join('');

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background-color: #f9fafb;">
  <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: #4F46E5; padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 22px;">Opportunity Pulse</h1>
      <p style="color: #C7D2FE; margin: 4px 0 0; font-size: 13px;">${frequencyLabel} Digest | Since ${sinceDate}</p>
    </div>

    <div style="padding: 24px;">
      <!-- Greeting -->
      <p style="font-size: 15px; color: #374151;">Hi${name ? ` ${escapeHtml(name)}` : ''},</p>

      <!-- AI Summary Card -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <div style="font-size: 12px; font-weight: 600; color: #4F46E5; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">AI Summary</div>
        <p style="font-size: 14px; color: #374151; margin: 0 0 12px;">${escapeHtml(aiSummary.summary)}</p>
        ${highlightItems ? `<ul style="margin: 8px 0; padding-left: 20px; font-size: 13px;">${highlightItems}</ul>` : ''}
        ${aiSummary.actionItem ? `<p style="font-size: 13px; color: #4F46E5; font-weight: 500; margin: 8px 0 0;">&rarr; ${escapeHtml(aiSummary.actionItem)}</p>` : ''}
      </div>

      <!-- Stats Bar -->
      <div style="background: #EEF2FF; border-radius: 6px; padding: 12px 16px; margin: 16px 0; text-align: center;">
        <span style="font-size: 24px; font-weight: 700; color: #4F46E5;">${totalNew}</span>
        <span style="font-size: 13px; color: #6B7280; margin-left: 4px;">new opportunities</span>
        <div style="font-size: 11px; color: #9CA3AF; margin-top: 4px;">${typeSummaryParts}</div>
      </div>

      ${briefHighlightRows ? `
      <!-- Executive Brief Highlights -->
      <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <div style="font-size: 12px; font-weight: 600; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Executive Brief Highlights</div>
        <table style="width: 100%; border-collapse: collapse;">
          ${briefHighlightRows}
        </table>
        <div style="text-align: center; margin-top: 12px;">
          <a href="${frontendUrl}/executive-brief" style="font-size: 12px; color: #92400E; font-weight: 600; text-decoration: none;">View Full Executive Brief &rarr;</a>
        </div>
      </div>
      ` : ''}

      <!-- Top Matches -->
      <h2 style="font-size: 16px; color: #111827; margin: 24px 0 12px;">Top Matches For You</h2>
      <table style="width: 100%; border-collapse: collapse;">
        ${matchRows}
      </table>

      <!-- CTA Button -->
      <div style="text-align: center; padding: 24px 0 8px;">
        <a href="${frontendUrl}/opportunities"
           style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          View All Opportunities
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="border-top: 1px solid #eee; padding: 16px 24px; font-size: 12px; color: #9CA3AF; text-align: center; background: #F9FAFB;">
      <p style="margin: 0 0 8px;">You're receiving this because you enabled email digests in your
        <a href="${frontendUrl}/alerts" style="color: #4F46E5;">alert preferences</a>.
      </p>
      <p style="margin: 0;">To stop receiving these emails, disable email notifications in your alert settings.</p>
    </div>
  </div>
</body>
</html>`;

  const briefHighlightText = briefHighlights.length > 0
    ? `\nExecutive Brief Highlights:\n${briefHighlights.map((opp, i) => `${i + 1}. [${opp.actionType}] ${opp.title} (Score: ${opp.aiScore}) ${opp.sourceUrl || ''}`).join('\n')}\n`
    : '';

  const text = `${frequencyLabel} Opportunity Pulse Digest | Since ${sinceDate}

Hi${name ? ` ${name}` : ''},

${aiSummary.summary}

${aiSummary.keyHighlights ? 'Key highlights:\n' + aiSummary.keyHighlights.map(h => `- ${h}`).join('\n') : ''}

${aiSummary.actionItem ? `Recommended: ${aiSummary.actionItem}` : ''}

${totalNew} new opportunities (${typeSummaryParts})
${briefHighlightText}
Top Matches:
${topMatches.map((m, i) => `${i + 1}. ${m.opportunity.title} (${m.relevanceScore}% match) ${m.opportunity.sourceUrl || ''}`).join('\n')}

View all: ${frontendUrl}/opportunities

---
To stop receiving these emails, update your alert preferences at ${frontendUrl}/alerts`;

  return { subject, html, text };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =====================================================================
// Rich daily digest — aggregates every opportunity surface in the app
// into one visually-appealing email with emojis + per-section deep links.
// All dates display in America/Chicago (Central time) regardless of where
// the server runs. Each opportunity row offers TWO clearly-labeled links:
//   🔗 source  — the external link (bonfirehub.com, sam.gov, the article)
//   📊 in app  — the Opportunity Pulse internal page for that item
// so the operator can pick whichever destination fits the type.
// =====================================================================
const DIGEST_TZ = 'America/Chicago';
const ACTION_COLORS = {
  BUILD: '#4F46E5', BID: '#2563EB', APPLY: '#059669',
  PARTNER: '#7C3AED', INVEST: '#D97706', TEACH: '#E11D48',
  IGNORE: '#9CA3AF',
};

function richDigestEmailTemplate({ name, data, frontendUrl }) {
  const url = (frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const {
    bonfireContracts = [], strategicClusters = [], govContracts = [],
    aiNews = [], freelance = [], aiJobs = [], investments = [], grants = [],
    research = [], aiTools = [], deepResearchReports = [],
    todayCounts = { byType: {}, total: 0 },
    summaryText = '',
    bonfireMinCloseDays = 5,
  } = data || {};

  const totalAddedToday = todayCounts.total || 0;
  const subject = `🌅 Your Opportunity Pulse — ${totalAddedToday} new today across ${visibleSectionCount(data)} surfaces`;

  // ----- Helpers (inline so the template is one-stop) -----
  const fmtUSD = (cents) => {
    if (cents == null || cents === 0) return null;
    const usd = Number(cents) / 100;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
    if (usd >= 1_000) return `$${Math.round(usd / 1_000)}k`;
    return `$${Math.round(usd)}`;
  };
  const fmtUSDPlain = (v) => {
    if (v == null || v === 0) return null;
    const n = Number(v);
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
    return `$${Math.round(n)}`;
  };
  // All dates render in America/Chicago, with DST handled by Intl. Format is
  // "Jun 12" — short, scannable. Long header date uses weekday + year.
  const fmtDate = (d) => {
    if (!d) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: DIGEST_TZ, month: 'short', day: 'numeric',
    }).format(new Date(d));
  };
  const fmtFullDate = (d) => new Intl.DateTimeFormat('en-US', {
    timeZone: DIGEST_TZ, weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  }).format(d);
  // Days remaining until a close date — used to add "X days" hint and the
  // "closes soon" red flag for bids near the floor of the close-window
  // filter. Returns null when there's no close date.
  const daysUntil = (d) => {
    if (!d) return null;
    const ms = new Date(d).getTime() - Date.now();
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  };
  // Render the dual-link pair (source + in-app). Both visible; the operator
  // picks the destination per opportunity type. Internal link is omitted
  // when there's no resolvable per-item Opp Pulse URL.
  const dualLinks = ({ sourceUrl, appHref, appLabel = 'In Opp Pulse' }) => {
    const parts = [];
    if (sourceUrl) {
      parts.push(`<a href="${escapeHtml(sourceUrl)}" style="color:#2563EB;text-decoration:none;font-weight:600;margin-right:10px;">🔗 Source</a>`);
    }
    if (appHref) {
      parts.push(`<a href="${url}${appHref}" style="color:#7C3AED;text-decoration:none;font-weight:600;">📊 ${appLabel}</a>`);
    }
    if (!parts.length) return '';
    return `<div style="margin-top:4px;font-size:11px;">${parts.join('')}</div>`;
  };

  // Each section block (header + section nav link + list of items).
  const section = ({ emoji, title, navHref, navLabel, accentColor, items, renderItem, emptyText }) => {
    if (!items || items.length === 0) return '';
    const rows = items.map(renderItem).join('');
    return `
      <div style="margin: 20px 0; padding: 16px; background: #ffffff; border: 1px solid #E5E7EB; border-left: 4px solid ${accentColor}; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
          <h2 style="font-size: 16px; margin: 0; color: #111827; font-weight: 700;">
            ${emoji} ${title}
            <span style="font-size: 12px; color: #6B7280; font-weight: 500;">· ${items.length}</span>
          </h2>
          <a href="${url}${navHref}" style="font-size: 12px; color: ${accentColor}; text-decoration: none; font-weight: 600;">${navLabel} →</a>
        </div>
        <div style="font-size: 13px;">
          ${rows || `<div style="color: #9CA3AF; font-style: italic;">${emptyText || 'Nothing fresh in this section yet.'}</div>`}
        </div>
      </div>`;
  };

  // ----- Per-item renderers (one row per call). Earlier version pre-joined
  // these into a single string and then passed `() => preJoined` to the
  // section helper, which renders the full string ONCE PER ITEM — N×N output.
  // Each renderer below now returns ONE row; the section helper handles the
  // join correctly. -----
  const bonfireRow = (o) => {
    const close = o.closeDate ? fmtDate(o.closeDate) : null;
    const dToClose = daysUntil(o.closeDate);
    const dueChip = dToClose != null
      ? (dToClose <= 14
        ? `<span style="background:#FEE2E2;color:#991B1B;padding:1px 6px;border-radius:3px;font-weight:700;">⏰ ${dToClose}d left</span>`
        : `<span style="background:#DBEAFE;color:#1E40AF;padding:1px 6px;border-radius:3px;font-weight:700;">${dToClose}d</span>`)
      : '';
    const val = fmtUSD(o.estimatedValue);
    const pri = o.priorityScore != null ? Math.round(Number(o.priorityScore)) : null;
    const fit = o.fitScore != null ? Math.round(Number(o.fitScore)) : null;
    const pursuit = o.pursuitStatus && o.pursuitStatus !== 'none'
      ? `<span style="background:#DCFCE7;color:#14532D;padding:1px 6px;border-radius:3px;font-weight:700;">▶ ${escapeHtml(o.pursuitStatus)}</span> `
      : '';
    const cat = o.aiCategory ? ` · ${escapeHtml(o.aiCategory)}` : '';
    // Match/fit chip at the END of the row so it's always scannable even when
    // the rest of the metadata line is long. Same chip style as the count strip.
    const scoreChip = (pri != null || fit != null)
      ? `<div style="margin-top:4px;">
           ${pri != null ? `<span style="display:inline-block;background:#EEF2FF;color:#3730A3;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;margin-right:4px;">🎯 priority ${pri}</span>` : ''}
           ${fit != null ? `<span style="display:inline-block;background:#ECFDF5;color:#065F46;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;">🤝 fit ${fit}</span>` : ''}
         </div>`
      : '';
    return `
      <div style="padding: 12px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="font-weight: 700; color: #111827; margin-bottom: 4px; font-size: 13px; line-height: 1.4;">
          ${escapeHtml(o.title)}
        </div>
        <div style="color: #1F2937; font-size: 11px; margin-bottom: 4px;">
          ${pursuit}${escapeHtml(o.agency || '')}${cat}${val ? ` · 💵 ${val}` : ''}${close ? ` · 📅 ${close}` : ''} ${dueChip}
        </div>
        ${scoreChip}
        ${dualLinks({
          sourceUrl: o.sourceUrl,
          appHref: `/admin/bonfire/${encodeURIComponent(o.id)}/submission-readiness`,
          appLabel: 'Open in Opp Pulse',
        })}
      </div>`;
  };

  const strategicRow = (s) => {
    const money = s.money || {};
    const roi = s.roi || {};
    const ai = s.aiSystem || {};
    const biz = s.businessViability || {};
    const sourceCount = (s.sourceOpportunityIds || []).length;
    const initialBid = fmtUSDPlain(money.initial_bid_value_usd);
    const clusterTotal = fmtUSDPlain(money.cluster_total_usd);
    const market = fmtUSDPlain(money.addressable_market_usd);
    const payback = roi.payback_months ? `${roi.payback_months}mo payback` : null;
    const margin = roi.margin_pct ? `${roi.margin_pct}% margin` : null;
    const buyer = biz.primary_buyer ? `🎯 ${escapeHtml(biz.primary_buyer)}` : '';
    const what = ai.what_to_build ? String(ai.what_to_build).slice(0, 180) : '';
    const score = s.strategicScore || 0;
    return `
      <div style="padding: 14px; background: #FAF5FF; border: 1px solid #E9D5FF; border-radius: 8px; margin-bottom: 10px;">
        <div style="font-weight: 700; color: #4C1D95; font-size: 15px; margin-bottom: 6px;">
          ${escapeHtml(s.title)}
          <span style="display:inline-block;background:#7C3AED;color:white;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;margin-left:6px;vertical-align:middle;">⭐ ${score}</span>
        </div>
        ${what ? `<div style="color: #111827; font-size: 12px; margin-bottom: 8px; line-height: 1.5;">${escapeHtml(what)}${ai.what_to_build && String(ai.what_to_build).length > 180 ? '…' : ''}</div>` : ''}
        <div style="font-size: 11px; color: #1F2937; margin-bottom: 6px;">
          📦 <strong>${sourceCount}</strong> source bids${initialBid ? ` · 💰 ${initialBid} initial` : ''}${clusterTotal ? ` · 📊 ${clusterTotal} cluster total` : ''}${market ? ` · 🌐 ${market} market` : ''}
        </div>
        ${(payback || margin || buyer) ? `<div style="font-size: 11px; color: #1F2937; margin-bottom: 8px;">${[buyer, payback, margin].filter(Boolean).join(' · ')}</div>` : ''}
        <div style="margin-top: 8px;">
          <a href="${url}/bonfire?fromCluster=${encodeURIComponent(s.id)}" style="display: inline-block; padding: 6px 12px; background: #7C3AED; color: white; border-radius: 4px; text-decoration: none; font-size: 11px; font-weight: 700; margin-right: 6px;">🔍 See all bids that fit →</a>
          <a href="${url}/bonfire/strategic" style="display: inline-block; padding: 6px 12px; background: transparent; color: #6B21A8; border: 1px solid #C4B5FD; border-radius: 4px; text-decoration: none; font-size: 11px; font-weight: 700;">📊 Open in Opp Pulse</a>
        </div>
      </div>`;
  };

  // ----- Generic unified-opportunity row renderer (gov/jobs/freelance/news/research/grants/investments) -----
  // Surfaces more pre-computed signal: actionType, saturationIndex, tags,
  // location, value, date — all already in the row, no extra fetch.
  const oppRow = (emoji, accent, opts = {}) => (o) => {
    const val = o.value ? fmtUSDPlain(o.value) : null;
    const date = fmtDate(o.publishedAt || o.createdAt);
    const score = o.aiScore != null ? Math.round(Number(o.aiScore)) : null;
    const loc = o.location ? ` · 📍 ${escapeHtml(o.location)}` : '';
    const cat = o.category ? ` · ${escapeHtml(o.category)}` : '';
    const action = o.actionType
      ? `<span style="background:${ACTION_COLORS[o.actionType] || '#6B7280'};color:white;padding:1px 6px;border-radius:3px;font-weight:600;font-size:10px;margin-right:4px;">${o.actionType}</span> `
      : '';
    const tags = Array.isArray(o.tags) && o.tags.length
      ? `<div style="margin-top:3px;color:#6B7280;font-size:10px;">${o.tags.slice(0, 4).map((t) => `#${escapeHtml(t)}`).join(' ')}</div>`
      : '';
    return `
      <div style="padding: 10px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 3px; font-size: 13px; line-height: 1.4;">
          ${emoji} ${escapeHtml(o.title)}
        </div>
        <div style="color: #374151; font-size: 11px;">
          ${action}${escapeHtml(o.source || '')}${cat}${val ? ` · ${val}` : ''}${date ? ` · ${date}` : ''}${score != null ? ` · ⭐ <strong>${score}</strong>` : ''}${loc}
        </div>
        ${tags}
        ${dualLinks({
          sourceUrl: o.sourceUrl,
          appHref: `/opportunities/${o.id}`,
          appLabel: opts.appLabel || 'In Opp Pulse',
        })}
      </div>`;
  };

  // ----- AI Tools row (separate model — its own slug-based detail page) -----
  const aiToolRow = (t) => {
    const dir = t.trendDirection;
    const arrow = dir === 'up' ? '📈' : dir === 'down' ? '📉' : '➡️';
    const mom = t.momentumScore != null ? Math.round(Number(t.momentumScore)) : null;
    const slug = t.slug || String(t.id);
    return `
      <div style="padding: 10px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 3px; font-size: 13px;">
          ${arrow} ${escapeHtml(t.name)}
        </div>
        <div style="color: #374151; font-size: 11px;">
          ${escapeHtml(t.category || '')}${t.industry ? ` · ${escapeHtml(t.industry)}` : ''}${mom != null ? ` · ⚡ momentum <strong>${mom}</strong>` : ''}
        </div>
        ${dualLinks({
          sourceUrl: t.websiteUrl || t.homepageUrl || t.url,
          appHref: `/ai-tools/${encodeURIComponent(slug)}`,
          appLabel: 'Open in Opp Pulse',
        })}
      </div>`;
  };

  // ----- Deep Research row — link to the full report inside Opp Pulse -----
  const deepResearchRow = (r) => {
    const conf = r.confidenceScore != null ? Math.round(Number(r.confidenceScore) * 100) : null;
    const comm = r.commercializationScore != null ? Math.round(Number(r.commercializationScore)) : null;
    const stage = r.marketStage ? escapeHtml(r.marketStage) : '';
    const summary = r.executiveSummary
      ? String(r.executiveSummary).replace(/\s+/g, ' ').slice(0, 200)
      : '';
    const fav = r.isFavorite ? '⭐ ' : '';
    return `
      <div style="padding: 10px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 13px;">
          ${fav}<a href="${url}/admin/deep-research/${encodeURIComponent(r.id)}" style="color:#0F766E;text-decoration:none;">📑 ${escapeHtml(r.searchTerm)}</a>
        </div>
        ${summary ? `<div style="color:#374151;font-size:11px;margin-bottom:4px;line-height:1.45;">${escapeHtml(summary)}${r.executiveSummary && String(r.executiveSummary).length > 200 ? '…' : ''}</div>` : ''}
        <div style="color: #374151; font-size: 11px;">
          ${stage ? `${stage} · ` : ''}${conf != null ? `🎯 confidence <strong>${conf}%</strong>` : ''}${comm != null ? ` · 💼 commercial <strong>${comm}</strong>` : ''}${r.sourceCount ? ` · 📚 ${r.sourceCount} sources` : ''}
        </div>
        <div style="margin-top:4px;font-size:11px;">
          <a href="${url}/admin/deep-research/${encodeURIComponent(r.id)}" style="color:#0F766E;text-decoration:none;font-weight:600;">📊 Open full report →</a>
        </div>
      </div>`;
  };

  // ----- "Added today" strip -----
  const typeLabel = {
    gov_contract: '🏛️ Gov contracts', ai_job: '💼 Jobs', investment: '💰 Investments',
    grant: '🎓 Grants', ai_news: '📰 News', freelance: '🧑‍💻 Freelance',
    bonfire: '🔥 Bonfire bids', bonfire_strategic: '🎯 Strategic', research: '🔬 Research',
  };
  const countChips = Object.entries(todayCounts.byType || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `
      <span style="display: inline-block; padding: 4px 10px; background: white; border: 1px solid #E5E7EB; border-radius: 999px; font-size: 12px; color: #374151; font-weight: 600; margin: 2px;">
        ${typeLabel[t] || t} <span style="color: #4F46E5;">${n}</span>
      </span>`).join('');

  // ----- HTML body -----
  // Outlook (Word rendering engine) strips CSS `background: linear-gradient(...)`,
  // collapsing the header to a white background and making white text invisible.
  // Use a solid bgcolor on a <table> with the bgcolor= attribute (which all
  // email clients honor) — and keep the inline CSS as a belt-and-suspenders
  // fallback for non-Word clients.
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Aptos, sans-serif; max-width: 680px; margin: 0 auto; padding: 16px; color: #111827; background-color: #F9FAFB;">
  <div style="background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header — Outlook-safe solid background via <table bgcolor> -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#4F46E5" style="background-color:#4F46E5;">
      <tr>
        <td bgcolor="#4F46E5" style="background-color:#4F46E5;padding:24px;text-align:center;">
          <h1 style="color:#FFFFFF;margin:0;font-size:24px;font-weight:700;line-height:1.2;">🌅 Opportunity Pulse</h1>
          <p style="color:#FFFFFF;margin:6px 0 0;font-size:13px;font-weight:500;">Daily Brief · ${escapeHtml(fmtFullDate(new Date()))} · 6 AM CT</p>
        </td>
      </tr>
    </table>

    <div style="padding: 22px; color: #111827;">
      <p style="font-size: 15px; color: #111827; margin: 0 0 14px; font-weight: 600;">Hi ${name ? escapeHtml(name) : 'there'} 👋</p>

      <!-- Today's brief — dark background, light text, high-contrast.
           Deterministic summary built from the data we already have
           (no extra LLM call). -->
      <div style="background: #111827; border-radius: 10px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #7C3AED;">
        <div style="font-size: 11px; font-weight: 700; color: #C4B5FD; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px;">
          📌 Today's Brief
        </div>
        <div style="font-size: 14px; color: #F9FAFB; line-height: 1.55;">
          ${summaryText ? escapeHtml(summaryText) : 'No fresh items yet — sources refresh on cron.'}
        </div>
      </div>

      <!-- Added today strip -->
      <div style="background: #F3F4F6; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: 700; color: #4338CA; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
          ✨ Added in the last 24h${totalAddedToday > 0 ? ` · ${totalAddedToday} new items` : ''}
        </div>
        <div>
          ${countChips || '<span style="color: #4B5563; font-size: 12px; font-style: italic;">Nothing new ingested today (yet — sources refresh on cron).</span>'}
        </div>
      </div>

      <!-- Section: Best-fit Strategic clusters (top 2) -->
      ${section({
        emoji: '🎯', title: 'Top 2 Strategic Builds', accentColor: '#7C3AED',
        navHref: '/bonfire/strategic', navLabel: 'See all clusters',
        items: strategicClusters, renderItem: strategicRow,
        emptyText: 'No new strategic recommendations yet.',
      })}

      <!-- Section: Bonfire contracts to bid -->
      ${section({
        emoji: '🔥', title: `Top ${bonfireContracts.length} Bonfire Contracts to Bid`, accentColor: '#DC2626',
        navHref: '/bonfire', navLabel: 'Go to Bonfire',
        items: bonfireContracts, renderItem: bonfireRow,
        emptyText: `No Bonfire bids with ≥${bonfireMinCloseDays} days to close right now.`,
      })}

      <!-- Section: Deep Research — 3 best reports with direct links -->
      ${section({
        emoji: '📑', title: 'Top 3 Deep Research Reports', accentColor: '#0F766E',
        navHref: '/admin/deep-research', navLabel: 'See all reports',
        items: deepResearchReports, renderItem: deepResearchRow,
        emptyText: 'No completed Deep Research reports yet.',
      })}

      <!-- Section: Gov contracts (SAM.gov etc) -->
      ${section({
        emoji: '🏛️', title: 'Top 3 Gov Contracts', accentColor: '#2563EB',
        navHref: '/opportunities?type=gov_contract', navLabel: 'See all gov contracts',
        items: govContracts, renderItem: oppRow('📜', '#2563EB'),
        emptyText: 'No new gov contracts ingested.',
      })}

      <!-- Section: Grants -->
      ${section({
        emoji: '🎓', title: 'Top 3 Grants', accentColor: '#059669',
        navHref: '/opportunities?type=grant', navLabel: 'See all grants',
        items: grants, renderItem: oppRow('🎯', '#059669'),
        emptyText: 'No fresh grants today.',
      })}

      <!-- Section: AI Jobs -->
      ${section({
        emoji: '💼', title: 'Top 5 AI Jobs', accentColor: '#0EA5E9',
        navHref: '/opportunities?type=ai_job', navLabel: 'See all jobs',
        items: aiJobs, renderItem: oppRow('🧠', '#0EA5E9'),
        emptyText: 'No new AI jobs surfaced today.',
      })}

      <!-- Section: Freelance -->
      ${section({
        emoji: '🧑‍💻', title: 'Top 3 Freelance Gigs', accentColor: '#EC4899',
        navHref: '/opportunities?type=freelance', navLabel: 'See all freelance',
        items: freelance, renderItem: oppRow('⚡', '#EC4899'),
        emptyText: 'No new freelance gigs.',
      })}

      <!-- Section: Investments -->
      ${section({
        emoji: '💰', title: 'Top 3 Capital Deployments', accentColor: '#D97706',
        navHref: '/opportunities?type=investment', navLabel: 'See all capital',
        items: investments, renderItem: oppRow('💵', '#D97706'),
        emptyText: 'No new capital news today.',
      })}

      <!-- Section: AI News -->
      ${section({
        emoji: '📰', title: 'Top 5 AI News', accentColor: '#6366F1',
        navHref: '/opportunities?type=ai_news', navLabel: 'See all news',
        items: aiNews, renderItem: oppRow('🗞️', '#6366F1'),
        emptyText: 'No new AI news today.',
      })}

      <!-- Section: Research -->
      ${section({
        emoji: '🔬', title: 'Top 3 Research Papers', accentColor: '#0F766E',
        navHref: '/opportunities?type=research', navLabel: 'See all research',
        items: research, renderItem: oppRow('📚', '#0F766E'),
        emptyText: 'No new research papers today.',
      })}

      <!-- Section: AI Tools -->
      ${section({
        emoji: '🛠️', title: 'Top 5 Trending AI Tools', accentColor: '#2563EB',
        navHref: '/ai-tools', navLabel: 'See all tools',
        items: aiTools, renderItem: aiToolRow,
        emptyText: 'No trending AI tools today.',
      })}

      <!-- Quick links footer -->
      <div style="margin-top: 24px; padding: 14px; background: #EEF2FF; border-radius: 8px; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #4F46E5; text-transform: uppercase; margin-bottom: 8px;">⚡ Jump in</div>
        <div style="font-size: 13px; line-height: 1.9;">
          <a href="${url}/bonfire/strategic" style="color: #4F46E5; text-decoration: none; font-weight: 600; margin: 0 6px;">🎯 Strategic</a> ·
          <a href="${url}/bonfire" style="color: #DC2626; text-decoration: none; font-weight: 600; margin: 0 6px;">🔥 Bonfire</a> ·
          <a href="${url}/opportunities" style="color: #2563EB; text-decoration: none; font-weight: 600; margin: 0 6px;">📋 All opportunities</a> ·
          <a href="${url}/ai-tools" style="color: #7C3AED; text-decoration: none; font-weight: 600; margin: 0 6px;">🛠️ AI Tools</a> ·
          <a href="${url}/admin/oied" style="color: #059669; text-decoration: none; font-weight: 600; margin: 0 6px;">🧭 Mission Control</a>
        </div>
      </div>

      <p style="font-size: 11px; color: #9CA3AF; text-align: center; margin: 18px 0 0;">
        You're receiving this because daily digests are enabled. Manage at
        <a href="${url}/alerts" style="color: #6B7280;">Alert Preferences</a>.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = buildPlainText({ name, data, url });
  return { subject, html, text };
}

function visibleSectionCount(data) {
  if (!data) return 0;
  return [
    data.bonfireContracts, data.strategicClusters, data.govContracts, data.aiNews,
    data.freelance, data.aiJobs, data.investments, data.grants, data.research, data.aiTools,
  ].filter((a) => Array.isArray(a) && a.length > 0).length;
}

function buildPlainText({ name, data, url }) {
  const lines = [];
  lines.push(`Hi ${name || 'there'},`);
  lines.push('');
  lines.push(`Daily Opportunity Pulse — ${new Date().toLocaleDateString()}`);
  lines.push('');
  if (data.todayCounts && data.todayCounts.total > 0) {
    lines.push(`Added in the last 24h: ${data.todayCounts.total} items`);
    lines.push('');
  }
  const dumpList = (label, items, renderLine, navPath) => {
    if (!items || !items.length) return;
    lines.push(`-- ${label} --`);
    items.forEach((i) => lines.push(renderLine(i)));
    if (navPath) lines.push(`See more: ${url}${navPath}`);
    lines.push('');
  };
  dumpList('STRATEGIC BUILD', data.strategicClusters, (s) => `* ${s.title} — score ${s.strategicScore} — ${url}/bonfire?fromCluster=${s.id}`, '/bonfire/strategic');
  dumpList('BONFIRE TO BID', data.bonfireContracts, (o) => `* ${o.title} (${o.agency || ''}) — priority ${o.priorityScore || 0} — ${o.sourceUrl || ''}`, '/bonfire');
  dumpList('GOV CONTRACTS', data.govContracts, (o) => `* ${o.title} — score ${o.aiScore || 0} — ${o.sourceUrl || ''}`, '/opportunities?type=gov_contract');
  dumpList('GRANTS', data.grants, (o) => `* ${o.title} — ${o.sourceUrl || ''}`, '/opportunities?type=grant');
  dumpList('AI JOBS', data.aiJobs, (o) => `* ${o.title} — ${o.sourceUrl || ''}`, '/opportunities?type=ai_job');
  dumpList('FREELANCE', data.freelance, (o) => `* ${o.title} — ${o.sourceUrl || ''}`, '/opportunities?type=freelance');
  dumpList('INVESTMENTS', data.investments, (o) => `* ${o.title} — ${o.sourceUrl || ''}`, '/opportunities?type=investment');
  dumpList('AI NEWS', data.aiNews, (o) => `* ${o.title} — ${o.sourceUrl || ''}`, '/opportunities?type=ai_news');
  dumpList('RESEARCH', data.research, (o) => `* ${o.title} — ${o.sourceUrl || ''}`, '/opportunities?type=research');
  dumpList('AI TOOLS', data.aiTools, (t) => `* ${t.name} (${t.category || ''})`, '/ai-tools');
  lines.push('---');
  lines.push(`Manage at ${url}/alerts`);
  return lines.join('\n');
}

module.exports = {
  verificationEmailTemplate,
  resetPasswordEmailTemplate,
  digestEmailTemplate,
  richDigestEmailTemplate,
};
