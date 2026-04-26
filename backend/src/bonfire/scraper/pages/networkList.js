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

// Pull subdomain + name from a single API record. The shape that Bonfire
// actually returns from /v1.0/vendors/me/agencies?region=us|ca|eu is:
//   { id, region, contactOrganizationName, ..., isActive,
//     organization: { id, name, domain: "utdallas.bonfirehub.com", ... } }
// Older shapes (subdomain, shortName) are kept as fallbacks for resilience.
function recordFromApi(rec) {
  if (!rec || typeof rec !== 'object') return null;
  // Skip inactive registrations — they wouldn't have biddable opportunities.
  if (rec.isActive === false) return null;

  const subdomain =
    (rec.organization && rec.organization.domain && extractSubdomain(`https://${rec.organization.domain}`))
    || rec.subdomain
    || (rec.shortName && String(rec.shortName).toLowerCase())
    || (rec.url && extractSubdomain(rec.url))
    || (rec.portalUrl && extractSubdomain(rec.portalUrl))
    || (rec.hostname && extractSubdomain(`https://${rec.hostname}`));
  if (!subdomain) return null;

  const name =
    (rec.organization && rec.organization.name)
    || rec.name
    || rec.agencyName
    || rec.organizationName
    || rec.displayName
    || subdomain;
  const status = rec.status || rec.registrationStatus || rec.state || (rec.isActive ? 'Active' : null);
  const registeredAt = rec.dateJoinedOrganization || rec.createdAt || rec.registeredAt || rec.dateCreated || null;
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

// Live-page parser. The Bonfire UI only fires the agencies XHR for the user's
// home region — to get the full set we explicitly fetch all 3 regions
// (us, ca, eu) via in-page fetch (so cookies + auth headers are inherited).
// DOM scraping kept as last-resort fallback.
const AGENCY_REGIONS = ['us', 'ca', 'eu'];
const AGENCY_API_BASE =
  'https://common-production-api-global.bonfirehub.com/v1.0/vendors/me/agencies';

async function parse(context, url, { navTimeoutMs = 30000, postNavWaitMs = 8000 } = {}) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });
    await page.waitForTimeout(postNavWaitMs);

    // Pull all 3 regions in one in-page evaluate.
    const apiAll = await page.evaluate(async ({ base, regions }) => {
      const out = [];
      for (const region of regions) {
        try {
          const r = await fetch(`${base}?region=${region}`, { credentials: 'include' });
          if (r.ok) {
            const arr = await r.json();
            if (Array.isArray(arr)) for (const a of arr) out.push(a);
          }
        } catch { /* ignore one region failing */ }
      }
      return out;
    }, { base: AGENCY_API_BASE, regions: AGENCY_REGIONS });

    if (Array.isArray(apiAll) && apiAll.length) {
      const out = apiAll.map(recordFromApi).filter(Boolean);
      const seen = new Set();
      const dedup = [];
      for (const r of out) {
        if (!seen.has(r.subdomain)) { seen.add(r.subdomain); dedup.push(r); }
      }
      if (dedup.length) return dedup;
    }

    // Fallback: DOM scrape if the API path didn't yield anything.
    const html = await page.content();
    return parseHtml(html);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { parse, parseHtml, extractSubdomain, recordFromApi, findAgenciesArray };
