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

module.exports = { verificationEmailTemplate, resetPasswordEmailTemplate, digestEmailTemplate };
