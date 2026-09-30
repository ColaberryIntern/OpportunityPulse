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
const { parseDeadline } = require('../deadlineParser');

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

/**
 * Parse a portal close-date cell.
 *
 * Delegates to deadlineParser, which keeps the timezone instead of stripping
 * it and never depends on the process TZ. See that module for why the previous
 * implementation produced instants up to 7 hours early.
 *
 * Returns the full structured result so callers can persist the original text
 * and the offset alongside the instant. `.utc` is null whenever the timezone
 * was missing or ambiguous — callers must treat that as "unknown deadline",
 * NOT as "no deadline".
 */
function tryParseDate(s) {
  return parseDeadline(s);
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
      // `closeDate` stays an ISO string (or null) so existing consumers are
      // unchanged. The structured provenance rides alongside it so the original
      // text and offset survive — previously both were discarded at parse time.
      // NOTE: closeDate is null when the timezone was missing or ambiguous.
      // That means "deadline unknown", not "no deadline"; see closeDateUncertainty.
      const deadline = tryParseDate(closeRaw);
      records.push({
        refNumber: ref,
        projectName: project,
        status: status || null,
        closeDate: deadline.utc,
        closeDateRaw: deadline.originalText,
        closeDateWallClock: deadline.wallClock,
        closeDateTimezone: deadline.timezoneLabel,
        closeDateTimezoneSource: deadline.timezoneSource,
        closeDateOffsetMinutes: deadline.offsetMinutes,
        closeDateConfidence: deadline.confidence,
        closeDateUncertainty: deadline.uncertainty,
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
