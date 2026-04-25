// Parses {subdomain}.bonfirehub.com/portal/?tab=openOpportunities — the
// "My Opportunities" tab on an agency portal.
//
// Live HTML inspection (April 2026) shows the portal uses jQuery DataTables
// (NOT a React SPA), with this column layout:
//   [Status, Ref. #, Project, Close Date, Days Left, Action]
//
// Multiple <table class="dataTable"> elements exist on the page (one per tab,
// hidden via display:none or DataTables_Table_N). We collect rows from ALL of
// them and dedupe by ref#. This is robust against tab reordering.

const cheerio = require('cheerio');

const COL = {
  status:    0,
  refNumber: 1,
  project:   2,
  closeDate: 3,
  daysLeft:  4,
  action:    5,
};

function tryParseDate(s) {
  if (!s) return null;
  // Bonfire format: "Apr 27th 2026, 2:00 PM CDT"  — strip ordinals + tz.
  const cleaned = String(s)
    .replace(/(\d+)(st|nd|rd|th)/g, '$1') // "27th" -> "27"
    .replace(/\s+(CST|CDT|EST|EDT|PST|PDT|MST|MDT|UTC|GMT)\b.*/i, '')
    .trim();
  const d = new Date(cleaned);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return cleaned || null;
}

function tryParseInt(s) {
  if (!s) return null;
  const m = String(s).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function parseHtml(html) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const records = [];

  $('table.dataTable').each((_, tbl) => {
    const $tbl = $(tbl);
    // Sanity-check the headers — if they don't include "Ref" we're looking at
    // the wrong DataTable (Bonfire ships several with different schemas).
    const headers = $tbl.find('thead th').map((__, h) => $(h).text().trim().toLowerCase()).get();
    const looksRight = headers.some((h) => h.includes('ref')) && headers.some((h) => h.includes('project'));
    if (!looksRight) return;

    $tbl.find('tbody tr').each((__, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      if (cells.length < 5) return;

      const ref = $(cells[COL.refNumber]).text().trim();
      const project = $(cells[COL.project]).text().trim();
      if (!ref || !project || seen.has(ref)) return;

      const status = $(cells[COL.status]).text().trim();
      const closeRaw = $(cells[COL.closeDate]).text().trim();
      const daysLeft = tryParseInt($(cells[COL.daysLeft]).text());
      const actionAnchor = $(cells[COL.action]).find('a[href]').first().attr('href') || null;

      seen.add(ref);
      records.push({
        refNumber: ref,
        projectName: project,
        status: status || null,
        closeDate: tryParseDate(closeRaw),
        daysLeft,
        portalUrl: actionAnchor,
      });
    });
  });

  return records;
}

async function parse(page) {
  const html = await page.content();
  const records = parseHtml(html);
  return { records, blocked: false };
}

module.exports = { parse, parseHtml, COL };
