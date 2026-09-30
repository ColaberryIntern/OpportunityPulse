#!/usr/bin/env node
/**
 * READ-ONLY impact report for the Bonfire deadline timezone defect.
 *
 * Context
 * -------
 * scraper/pages/agencyOpportunities.tryParseDate used to strip the timezone
 * token and parse the remainder with `new Date()`, which in a TZ=UTC container
 * reinterprets a local wall clock as a UTC instant. Stored close_date values
 * from that path are early by the source portal's UTC offset (4-7 hours for US
 * portals). deadlineParser.js fixes this going forward.
 *
 * This script answers "what does that mean for rows already in the database?"
 * It performs SELECTs only. It NEVER writes, backfills, rescopes or rescores.
 * Run it, read it, decide separately.
 *
 * Categories reported
 *   recomputable_from_stored_evidence - the original deadline text is stored,
 *       so a correct instant can be derived without touching the portal.
 *   requires_portal_refetch          - parsed by the buggy path and the
 *       original text was discarded; only the portal can settle it.
 *   other_parse_path                 - ingested by a different code path
 *       (manual CSV/JSON upload, vendor-recommendation card) whose date
 *       handling differs and must be assessed on its own.
 *   unknown_provenance               - cannot attribute to a path.
 *
 * Usage:
 *   node src/scripts/deadlineImpactReport.js            # summary
 *   node src/scripts/deadlineImpactReport.js --sample 8 # + representative rows
 *   node src/scripts/deadlineImpactReport.js --json     # machine-readable
 */

const { sequelize } = require('../models');

// US state/territory -> IANA zone for the agency subdomains we ingest. Used
// ONLY to show what a corrected value would plausibly look like in the sample.
// This is an INFERENCE for review, never an authorization to write.
const SUBDOMAIN_ZONE_HINTS = {
  utah: 'America/Denver',
  slco: 'America/Denver',
  dallascityhall: 'America/Chicago',
  harriscountytx: 'America/Chicago',
  fortworthtexas: 'America/Chicago',
  'twc-texas-gov': 'America/Chicago',
  wfsdallas: 'America/Chicago',
  burleson: 'America/Chicago',
  metra: 'America/Chicago',
  detroit: 'America/New_York',
};

function classifyExternalId(externalId) {
  const id = String(externalId || '');
  if (id.startsWith('bonfire:agency:')) return 'requires_portal_refetch';
  if (id.startsWith('bonfire:vendor-rec:')) return 'other_parse_path';
  if (id === '' || id === 'null') return 'unknown_provenance';
  return 'other_parse_path';
}

function subdomainOf(externalId) {
  const m = String(externalId || '').match(/^bonfire:agency:([^:]+):/);
  return m ? m[1] : null;
}

/** Offset (minutes) a zone was at a given instant. Intl only; no TZ reliance. */
function zoneOffsetMinutesAt(zone, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) === 24 ? 0 : Number(p.hour);
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  return Math.round((asIfUtc - utcMs) / 60000);
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const sampleIdx = args.indexOf('--sample');
  const sampleSize = sampleIdx >= 0 ? Math.min(Number(args[sampleIdx + 1]) || 5, 25) : 0;

  const q = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });

  const rows = await q(`
    SELECT id, external_id, title, agency, close_date, created_at
    FROM bonfire_opportunities
  `);

  // Does a column preserving the original text exist yet? Until the Phase 2
  // migration lands it does not, which is precisely why so little is
  // recomputable without the portal.
  const cols = await q(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'bonfire_opportunities' AND column_name LIKE 'close_date%'
  `);
  const hasRawColumn = cols.some((c) => c.column_name === 'close_date_raw');

  const buckets = {
    recomputable_from_stored_evidence: [],
    requires_portal_refetch: [],
    other_parse_path: [],
    unknown_provenance: [],
  };

  for (const r of rows) {
    let bucket = classifyExternalId(r.external_id);
    // A row is only recomputable without the portal if the original text was
    // preserved. Today that column does not exist, so this stays empty.
    if (hasRawColumn && r.close_date_raw) bucket = 'recomputable_from_stored_evidence';
    buckets[bucket].push(r);
  }

  const withDate = (arr) => arr.filter((r) => r.close_date != null).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    originalTextColumnPresent: hasRawColumn,
    totals: {
      rows: rows.length,
      rowsWithCloseDate: withDate(rows),
    },
    categories: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, { rows: v.length, withCloseDate: withDate(v) }]),
    ),
    affectedBySubdomain: {},
  };

  for (const r of buckets.requires_portal_refetch) {
    const sd = subdomainOf(r.external_id) || '(unknown)';
    if (!summary.affectedBySubdomain[sd]) {
      summary.affectedBySubdomain[sd] = { rows: 0, withCloseDate: 0, zoneHint: SUBDOMAIN_ZONE_HINTS[sd] || null };
    }
    summary.affectedBySubdomain[sd].rows += 1;
    if (r.close_date != null) summary.affectedBySubdomain[sd].withCloseDate += 1;
  }

  // Representative sample: stored value vs what the value WOULD be if the
  // portal had rendered the agency's local time. Strictly illustrative.
  const sample = [];
  if (sampleSize > 0) {
    const candidates = buckets.requires_portal_refetch
      .filter((r) => r.close_date != null && SUBDOMAIN_ZONE_HINTS[subdomainOf(r.external_id)])
      .sort((a, b) => new Date(b.close_date) - new Date(a.close_date))
      .slice(0, sampleSize);

    for (const r of candidates) {
      const sd = subdomainOf(r.external_id);
      const zone = SUBDOMAIN_ZONE_HINTS[sd];
      const storedMs = new Date(r.close_date).getTime();
      // The stored instant equals the portal's wall clock misread as UTC, so
      // the wall clock IS the stored instant's UTC face. Re-anchor it in the
      // agency's zone to show the likely true instant.
      const offset = zoneOffsetMinutesAt(zone, storedMs);
      sample.push({
        id: r.id,
        subdomain: sd,
        title: String(r.title).slice(0, 70),
        storedCloseDateUtc: new Date(storedMs).toISOString(),
        inferredPortalWallClock: new Date(storedMs).toISOString().replace('Z', ''),
        zoneHint: zone,
        inferredOffsetMinutes: offset,
        inferredTrueUtc: new Date(storedMs - offset * 60000).toISOString(),
        deltaHours: -offset / 60,
        evidence: 'INFERRED from subdomain zone hint - NOT source-verified. Portal re-fetch required before any correction.',
      });
    }
  }

  const out = { summary, sample };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  console.log('Bonfire deadline timezone defect - READ-ONLY impact report');
  console.log('Generated:', summary.generatedAt);
  console.log('Original-text column present:', hasRawColumn ? 'yes' : 'NO (Phase 2 migration required)');
  console.log('');
  console.log(`Total bonfire rows: ${summary.totals.rows}  (with a close_date: ${summary.totals.rowsWithCloseDate})`);
  console.log('');
  console.log('By category:');
  for (const [k, v] of Object.entries(summary.categories)) {
    console.log(`  ${k.padEnd(36)} rows=${String(v.rows).padStart(6)}  withCloseDate=${String(v.withCloseDate).padStart(6)}`);
  }
  console.log('');
  console.log('Affected agency portals (requires_portal_refetch):');
  const bySd = Object.entries(summary.affectedBySubdomain).sort((a, b) => b[1].rows - a[1].rows);
  for (const [sd, v] of bySd.slice(0, 20)) {
    console.log(`  ${sd.padEnd(22)} rows=${String(v.rows).padStart(5)}  zoneHint=${v.zoneHint || '(none)'}`);
  }
  if (sample.length) {
    console.log('');
    console.log('Representative sample (ILLUSTRATIVE - not a proposed write):');
    for (const s of sample) {
      console.log(`  ${s.id}`);
      console.log(`    ${s.title}`);
      console.log(`    stored : ${s.storedCloseDateUtc}`);
      console.log(`    likely : ${s.inferredTrueUtc}   (+${s.deltaHours}h, zone hint ${s.zoneHint})`);
      console.log(`    ${s.evidence}`);
    }
  }
  console.log('');
  console.log('NO WRITES PERFORMED. No backfill, no rescore, no status change.');
  return out;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => { console.error('impact report failed:', e.message); process.exit(1); });
}

module.exports = { main, classifyExternalId, subdomainOf, zoneOffsetMinutesAt, SUBDOMAIN_ZONE_HINTS };
