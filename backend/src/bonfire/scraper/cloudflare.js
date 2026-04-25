// Cloudflare challenge detection. Per the Bonfire access guide: never retry on
// detection — retries make the fingerprint worse. The runner just records the
// agency as blocked and moves on.

const CHALLENGE_TITLE_MARKERS = [
  'just a moment',
  'attention required',
  'cloudflare',
];

const CHALLENGE_BODY_MARKERS = [
  'cf-challenge',
  'cf-browser-verification',
  'cf-chl',
  '__cf_chl_',
  'performing security verification',
  'checking your browser',
  '/cdn-cgi/challenge-platform',
];

function isChallengeHtml(html, title) {
  if (!html && !title) return false;
  const lowerTitle = String(title || '').toLowerCase();
  if (CHALLENGE_TITLE_MARKERS.some((m) => lowerTitle.includes(m))) return true;
  const lowerBody = String(html || '').toLowerCase();
  return CHALLENGE_BODY_MARKERS.some((m) => lowerBody.includes(m));
}

async function isChallengePage(page) {
  try {
    const [title, html] = await Promise.all([page.title(), page.content()]);
    return isChallengeHtml(html, title);
  } catch {
    // If we can't even read the page, treat as blocked — safer.
    return true;
  }
}

module.exports = { isChallengePage, isChallengeHtml };
