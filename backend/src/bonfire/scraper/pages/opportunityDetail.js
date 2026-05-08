// Bonfire opp detail-page parser. Captures the Documents-tab table from
// a single opp's detail URL — name + download URL + size hint per row.
//
// Two parse paths so unit tests can use captured fixture HTML without
// launching a browser:
//   parse(page)        — Playwright path (used at scrape time)
//   parseHtml(html)    — cheerio path (unit tests; fast)
//
// Selectors are best-effort against the public Bonfire portal HTML; if
// Bonfire restructures the DOM, fixtures-driven tests will fail loudly
// and a one-line selector update fixes it.

const cheerio = require('cheerio');

// Common selectors we look for in the Documents tab. Bonfire renders a
// table-style list with download anchors; the link's href points either
// at a /portal/... path on the same subdomain, or at an S3 URL.
const ANCHOR_SELECTORS = [
  'a[href*="/file/"]',
  'a[href*="/document/"]',
  'a[href*="/download"]',
  'a[href*=".pdf"]',
  'a[href*=".docx"]',
  'a[href*=".xlsx"]',
];

const SIZE_RE = /(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i;

function normaliseUrl(href, baseUrl) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseHtml(html, { baseUrl = 'https://bonfirehub.com' } = {}) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const seen = new Set();
  const out = [];
  for (const sel of ANCHOR_SELECTORS) {
    $(sel).each((_, el) => {
      const $a = $(el);
      const href = ($a.attr('href') || '').trim();
      if (!href) return;
      const abs = normaliseUrl(href, baseUrl);
      if (!abs || seen.has(abs)) return;
      seen.add(abs);
      const text = $a.text().replace(/\s+/g, ' ').trim();
      // Sometimes the row has size like "Document.pdf (2.3 MB)" inside a
      // sibling cell. Look at the closest <tr> for a hint.
      let sizeHint = null;
      const rowText = $a.closest('tr').text();
      const m = rowText && rowText.match(SIZE_RE);
      if (m) sizeHint = m[0];
      // Attempt to derive a clean filename: prefer link text if it looks
      // file-y; else fall back to the URL's last path segment.
      let name = text;
      if (!/\.\w{2,5}$/i.test(name)) {
        const seg = abs.split('?')[0].split('/').pop();
        if (seg && /\.\w{2,5}$/i.test(seg)) name = seg;
      }
      out.push({ url: abs, name: name || abs, size_hint: sizeHint });
    });
  }
  return out;
}

// Playwright path. Navigates to the opp detail URL (assumes it includes
// the right subdomain + auth state), waits for the Documents area to
// render, and returns the same shape as parseHtml.
async function parse(page, { detailUrl }) {
  if (!detailUrl) throw new Error('detailUrl is required');
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Bonfire renders the Documents tab inside the SPA; give it a generous
  // settle window since networkidle is unsafe per the access guide.
  await page.waitForTimeout(4000);
  const html = await page.content();
  return parseHtml(html, { baseUrl: page.url() });
}

module.exports = {
  parse,
  parseHtml,
  ANCHOR_SELECTORS,
};
