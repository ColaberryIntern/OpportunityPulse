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

// Default column ordering on the standard DHA-style portal. Some agencies
// (e.g. metra) inject an extra column (Department) — buildColumnMap() resolves
// the actual indices from the <thead> text so we don't mis-extract close_date
// when columns shift.
const COL = {
  status:    0,
  refNumber: 1,
  project:   2,
  closeDate: 3,
  daysLeft:  4,
  action:    5,
};

// Map header text -> our canonical key.
const HEADER_PATTERNS = [
  { key: 'status',    re: /^status$/i },
  { key: 'refNumber', re: /\bref\.?\s*#?$/i },
  { key: 'project',   re: /\bproject\b/i },
  { key: 'closeDate', re: /\bclose\b/i },
  { key: 'daysLeft',  re: /\bdays?\s*left\b/i },
  { key: 'action',    re: /\baction\b/i },
];

function buildColumnMap(headerCells) {
  const map = {};
  headerCells.forEach((text, idx) => {
    const t = String(text).trim();
    for (const { key, re } of HEADER_PATTERNS) {
      if (re.test(t) && map[key] == null) map[key] = idx;
    }
  });
  return map;
}

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
    // Build a per-table column map from <thead>. Falls back to the canonical
    // DHA layout when a header doesn't match anything.
    const headerCells = $tbl.find('thead th').map((__, h) => $(h).text().trim()).get();
    const headersLower = headerCells.map((h) => h.toLowerCase());
    const looksRight = headersLower.some((h) => h.includes('ref')) && headersLower.some((h) => h.includes('project'));
    if (!looksRight) return;

    const colMap = buildColumnMap(headerCells);
    const get = (key) => (colMap[key] != null ? colMap[key] : COL[key]);

    $tbl.find('tbody tr').each((__, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      if (cells.length < 5) return;

      const ref = $(cells[get('refNumber')]).text().trim();
      const project = $(cells[get('project')]).text().trim();
      if (!ref || !project || seen.has(ref)) return;

      const status = $(cells[get('status')]).text().trim();
      const closeRaw = $(cells[get('closeDate')]).text().trim();
      const daysLeft = tryParseInt($(cells[get('daysLeft')]).text());
      const actionAnchor = $(cells[get('action')]).find('a[href]').first().attr('href') || null;

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
