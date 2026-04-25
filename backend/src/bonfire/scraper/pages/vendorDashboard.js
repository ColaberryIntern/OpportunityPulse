// Parses https://vendor.bonfirehub.com/ — dashboard count tiles.
//
// Live HTML inspection (April 2026) shows Bonfire ships explicit data-testid
// attributes for each metric tile:
//   dashboard-overview-invitations-count
//   dashboard-overview-wip-count
//   dashboard-overview-submitted-count
//   dashboard-overview-awarded-count
//   dashboard-overview-contracts-count
//
// AI-recommended cards are NOT on this page — they live behind a button that
// links to /opportunities/recommended. We expose `aiRecommendedHref` so the
// runner can decide whether to follow it.

const cheerio = require('cheerio');

const COUNT_TILES = [
  { key: 'invitations',     testId: 'dashboard-overview-invitations-count' },
  { key: 'workInProgress',  testId: 'dashboard-overview-wip-count' },
  { key: 'submitted',       testId: 'dashboard-overview-submitted-count' },
  { key: 'awarded',         testId: 'dashboard-overview-awarded-count' },
  { key: 'contracts',       testId: 'dashboard-overview-contracts-count' },
];

function parseHtml(html) {
  const $ = cheerio.load(html);
  const counts = {};
  for (const tile of COUNT_TILES) {
    const el = $(`[data-testid="${tile.testId}"]`).first();
    if (!el.length) continue;
    const txt = el.text().trim().replace(/[^\d-]/g, '');
    const n = parseInt(txt, 10);
    if (Number.isFinite(n)) counts[tile.key] = n;
  }

  // Older selector-fallback path: keep the previous container-based card lookup
  // so a future Bonfire change that re-introduces inline cards still works.
  const aiRecommended = [];
  $('[data-testid="ai-recommended-card"], .ai-recommended-card').each((_, el) => {
    const $el = $(el);
    const title = $el.find('[data-testid="card-title"], h3, h4').first().text().trim();
    const agency = $el.find('[data-testid="card-agency"], .card-agency').first().text().trim();
    const description = $el.find('[data-testid="card-description"], p').first().text().trim();
    const href = $el.find('a[href]').first().attr('href') || null;
    if (title) aiRecommended.push({ title, agency, description, url: href });
  });

  // Find the link to the dedicated AI-recommended page if it exists. The runner
  // can decide whether to follow it (separate request, separate parser).
  const aiRecommendedHref =
    $('a[href="/opportunities/recommended"], a[href$="/opportunities/recommended"]').first().attr('href')
    || null;

  return { counts, aiRecommended, aiRecommendedHref };
}

async function parse(page) {
  const html = await page.content();
  return parseHtml(html);
}

module.exports = { parse, parseHtml, COUNT_TILES };
