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
// =====================================================================
function richDigestEmailTemplate({ name, data, frontendUrl }) {
  const url = frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
  const {
    bonfireContracts = [], strategicClusters = [], govContracts = [],
    aiNews = [], freelance = [], aiJobs = [], investments = [], grants = [],
    research = [], aiTools = [], todayCounts = { byType: {}, total: 0 },
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
  const fmtDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  // ----- Section: Bonfire — top 5 contracts to bid on -----
  const bonfireRows = bonfireContracts.map((o) => {
    const close = o.closeDate ? fmtDate(o.closeDate) : null;
    const val = fmtUSD(o.estimatedValue);
    const pri = o.priorityScore != null ? Math.round(Number(o.priorityScore)) : null;
    const fit = o.fitScore != null ? Math.round(Number(o.fitScore)) : null;
    return `
      <div style="padding: 10px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 4px; font-size: 13px;">
          ${o.sourceUrl ? `<a href="${o.sourceUrl}" style="color: #DC2626; text-decoration: none;">${escapeHtml(o.title)}</a>` : escapeHtml(o.title)}
        </div>
        <div style="color: #6B7280; font-size: 11px;">
          ${escapeHtml(o.agency || '')}${val ? ` · ${val}` : ''}${close ? ` · 📅 ${close}` : ''}${pri != null ? ` · 🎯 priority ${pri}` : ''}${fit != null ? ` · 🤝 fit ${fit}` : ''}
        </div>
      </div>`;
  }).join('');

  // ----- Section: Strategic — the #1 cluster to build -----
  const strategicRows = strategicClusters.map((s) => {
    const money = s.money || {};
    const ai = s.aiSystem || {};
    const sourceCount = (s.sourceOpportunityIds || []).length;
    const initialBid = fmtUSDPlain(money.initial_bid_value_usd);
    const market = fmtUSDPlain(money.addressable_market_usd);
    const what = ai.what_to_build ? String(ai.what_to_build).slice(0, 180) : '';
    return `
      <div style="padding: 12px; background: #FAF5FF; border: 1px solid #E9D5FF; border-radius: 6px;">
        <div style="font-weight: 700; color: #6B21A8; font-size: 14px; margin-bottom: 6px;">
          <a href="${url}/bonfire/strategic" style="color: #6B21A8; text-decoration: none;">${escapeHtml(s.title)}</a>
        </div>
        ${what ? `<div style="color: #4B5563; font-size: 12px; margin-bottom: 8px;">${escapeHtml(what)}${ai.what_to_build && String(ai.what_to_build).length > 180 ? '…' : ''}</div>` : ''}
        <div style="font-size: 12px; color: #4B5563; margin-bottom: 8px;">
          📦 <strong>${sourceCount}</strong> bids inspired this · 🎯 strategic score <strong>${s.strategicScore || 0}</strong>${initialBid ? ` · 💰 initial bid ${initialBid}` : ''}${market ? ` · 🌐 market ${market}` : ''}
        </div>
        <a href="${url}/bonfire?fromCluster=${encodeURIComponent(s.id)}" style="display: inline-block; padding: 6px 12px; background: #7C3AED; color: white; border-radius: 4px; text-decoration: none; font-size: 11px; font-weight: 600;">🔍 See all bids that fit this product →</a>
      </div>`;
  }).join('');

  // ----- Generic unified-opportunity row renderer -----
  const oppRow = (emoji, accent) => (o) => {
    const val = o.value ? fmtUSDPlain(o.value) : null;
    const date = fmtDate(o.publishedAt || o.createdAt);
    const score = o.aiScore != null ? Math.round(Number(o.aiScore)) : null;
    const loc = o.location ? ` · 📍 ${escapeHtml(o.location)}` : '';
    return `
      <div style="padding: 8px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 3px; font-size: 13px;">
          ${o.sourceUrl ? `<a href="${escapeHtml(o.sourceUrl)}" style="color: ${accent}; text-decoration: none;">${emoji} ${escapeHtml(o.title)}</a>` : `${emoji} ${escapeHtml(o.title)}`}
        </div>
        <div style="color: #6B7280; font-size: 11px;">
          ${escapeHtml(o.source || '')}${val ? ` · ${val}` : ''}${date ? ` · ${date}` : ''}${score != null ? ` · ⭐ ${score}` : ''}${loc}
        </div>
      </div>`;
  };

  // ----- AI Tools row (separate model) -----
  const aiToolRow = (t) => {
    const dir = t.trendDirection;
    const arrow = dir === 'up' ? '📈' : dir === 'down' ? '📉' : '➡️';
    const mom = t.momentumScore != null ? Math.round(Number(t.momentumScore)) : null;
    return `
      <div style="padding: 8px 0; border-bottom: 1px solid #F3F4F6;">
        <div style="font-weight: 600; color: #111827; margin-bottom: 3px; font-size: 13px;">
          <a href="${url}/ai-tools/${escapeHtml(t.slug || String(t.id))}" style="color: #2563EB; text-decoration: none;">${arrow} ${escapeHtml(t.name)}</a>
        </div>
        <div style="color: #6B7280; font-size: 11px;">
          ${escapeHtml(t.category || '')}${t.industry ? ` · ${escapeHtml(t.industry)}` : ''}${mom != null ? ` · ⚡ momentum ${mom}` : ''}
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
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Aptos, sans-serif; max-width: 680px; margin: 0 auto; padding: 16px; color: #1F2937; background-color: #F9FAFB;">
  <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 24px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">🌅 Opportunity Pulse</h1>
      <p style="color: #DDD6FE; margin: 6px 0 0; font-size: 13px;">Daily Brief · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</p>
    </div>

    <div style="padding: 22px;">
      <p style="font-size: 15px; color: #111827; margin: 0 0 16px;">Hi ${name ? escapeHtml(name) : 'there'} 👋</p>

      <!-- Added today strip -->
      <div style="background: #F3F4F6; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: 700; color: #4F46E5; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
          ✨ Added in the last 24h${totalAddedToday > 0 ? ` · ${totalAddedToday} new items` : ''}
        </div>
        <div>
          ${countChips || '<span style="color: #6B7280; font-size: 12px; font-style: italic;">Nothing new ingested today (yet — sources refresh on cron).</span>'}
        </div>
      </div>

      <!-- Section: Best-fit Strategic cluster -->
      ${section({
        emoji: '🎯', title: 'Best-Fit Strategic Build', accentColor: '#7C3AED',
        navHref: '/bonfire/strategic', navLabel: 'See all clusters',
        items: strategicClusters, renderItem: () => strategicRows,
        emptyText: 'No new strategic recommendations yet.',
      })}

      <!-- Section: Bonfire contracts to bid -->
      ${section({
        emoji: '🔥', title: 'Top 5 Bonfire Contracts to Bid', accentColor: '#DC2626',
        navHref: '/bonfire', navLabel: 'Go to Bonfire',
        items: bonfireContracts, renderItem: () => bonfireRows,
        emptyText: 'No active Bonfire bids matched your filters today.',
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
