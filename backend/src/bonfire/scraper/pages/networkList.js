// Parses the My Network page on the vendor hub. The page is a React SPA whose
// initial HTML is just a shell — the agency list is hydrated via XHR. Two
// strategies are tried:
//   1. Listen for the agencies API response while we navigate (most reliable).
//   2. Fall back to DOM scraping after a longer wait, for resilience if the
//      API path changes.
//
// Output: [{ subdomain, name, status, registeredAt }, ...]

const cheerio = require('cheerio');

// Patterns we've observed Bonfire use for the agencies endpoint. Add more here
// as the API shifts; the matcher is permissive on intent (any GET that returns
// an array of agency-like objects).
const API_URL_HINT_RE = /\/api\/[^?]*(network|agencies|connections)/i;

function extractSubdomain(href) {
  if (!href) return null;
  const m = String(href).match(/^https?:\/\/([a-z0-9-]+)\.bonfirehub\.com/i);
  if (!m) return null;
  const sub = m[1].toLowerCase();
  if (['vendor', 'account', 'www', 'app', 'api'].includes(sub)) return null;
  return sub;
}

// Pull subdomain + name from a single API record. We've seen multiple shapes —
// be permissive about field names.
function recordFromApi(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const subdomain =
    rec.subdomain
    || (rec.shortName && String(rec.shortName).toLowerCase())
    || (rec.url && extractSubdomain(rec.url))
    || (rec.portalUrl && extractSubdomain(rec.portalUrl))
    || (rec.hostname && extractSubdomain(`https://${rec.hostname}`));
  if (!subdomain) return null;
  const name = rec.name || rec.agencyName || rec.organizationName || rec.displayName || subdomain;
  const status = rec.status || rec.registrationStatus || rec.state || null;
  const registeredAt = rec.createdAt || rec.registeredAt || rec.dateCreated || null;
  return { subdomain, name: String(name).trim(), status, registeredAt };
}

// Walk an arbitrary JSON shape and return the first array we find that looks
// like agency records (length > 0 and at least one element resolves a subdomain).
function findAgenciesArray(payload) {
  const seen = new WeakSet();
  function visit(node) {
    if (!node || typeof node !== 'object') return null;
    if (seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      const sample = node.slice(0, 5).map(recordFromApi).filter(Boolean);
      if (sample.length > 0) return node;
    }
    for (const v of Object.values(node)) {
      const found = visit(v);
      if (found) return found;
    }
    return null;
  }
  return visit(payload);
}

function parseHtml(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const agencies = [];

  $('a[href*=".bonfirehub.com"]').each((_, a) => {
    const subdomain = extractSubdomain($(a).attr('href'));
    if (subdomain && !seen.has(subdomain)) {
      seen.add(subdomain);
      agencies.push({
        subdomain,
        name: $(a).text().trim() || subdomain,
        status: null,
        registeredAt: null,
      });
    }
  });

  return agencies;
}

// Live-page parser: opens its OWN page so it can attach the response listener
// before navigation (the agency XHR fires during hydration — too late if we
// listen post-goto). Falls back to DOM scrape if the API call doesn't surface.
async function parse(context, url, { navTimeoutMs = 30000, postNavWaitMs = 8000 } = {}) {
  const page = await context.newPage();
  const apiResponses = [];
  const handler = async (response) => {
    try {
      const respUrl = response.url();
      if (!API_URL_HINT_RE.test(respUrl)) return;
      const ct = String(response.headers()['content-type'] || '');
      if (!ct.includes('json')) return;
      const body = await response.json().catch(() => null);
      if (body) apiResponses.push({ url: respUrl, body });
    } catch {
      // ignore — interception is best-effort
    }
  };
  page.on('response', handler);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
    await page.waitForTimeout(postNavWaitMs);

    // Try API path first.
    for (const { body } of apiResponses) {
      const arr = findAgenciesArray(body);
      if (arr) {
        const out = arr.map(recordFromApi).filter(Boolean);
        const seen = new Set();
        const dedup = [];
        for (const r of out) {
          if (!seen.has(r.subdomain)) { seen.add(r.subdomain); dedup.push(r); }
        }
        if (dedup.length) return dedup;
      }
    }

    // Fallback: parse whatever DOM we got.
    const html = await page.content();
    return parseHtml(html);
  } finally {
    page.off('response', handler);
    await page.close().catch(() => {});
  }
}

module.exports = { parse, parseHtml, extractSubdomain, recordFromApi, findAgenciesArray };
