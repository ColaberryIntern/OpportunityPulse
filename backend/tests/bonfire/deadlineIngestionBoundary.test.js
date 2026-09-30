// Ingestion boundary for deadline data: parser -> normalize -> validateRow -> persistence.
//
// The PR for commit 071edb3 claimed "no downstream behaviour changes". That was
// WRONG in two ways and this suite pins both:
//
//   1. Corrected closeDate DOES reach persistence — closeDate is in the upsert's
//      updateOnDuplicate set, so a re-scrape rewrites existing rows. That is the
//      intended fix, but it is emphatically a downstream change.
//   2. An UNRESOLVED deadline (utc:null) would, without a guard, overwrite a
//      previously known close_date with NULL. A NULL close_date drops the row
//      out of /best-fit, which requires close_date >= cutoff. That is silent
//      data loss on re-scrape.
//
// It also pins exactly which provenance fields are dropped at validateRow, so
// the Phase 2 persistence requirement is evidence-backed rather than asserted.

jest.mock('../../src/models', () => ({
  BonfireOpportunity: { bulkCreate: jest.fn(async (rows) => rows) },
  BonfireOpportunityTag: {},
  BonfireStrategicOpportunity: {},
  sequelize: { literal: (s) => s },
}));

const { BonfireOpportunity } = require('../../src/models');
const svc = require('../../src/bonfire/bonfire.service');
const { validateRow } = require('../../src/bonfire/bonfire.util');
const { parseDeadline } = require('../../src/bonfire/scraper/deadlineParser');
const { fromAgencyOpportunity } = require('../../src/bonfire/scraper/normalize');
const { parseHtml } = require('../../src/bonfire/scraper/pages/agencyOpportunities');

beforeEach(() => BonfireOpportunity.bulkCreate.mockClear());

const calls = () => BonfireOpportunity.bulkCreate.mock.calls;

// ---------------------------------------------------------------------------
describe('boundary 1: parser -> scraper record', () => {
  const html = `
    <table class="dataTable">
      <thead><tr><th>Status</th><th>Ref. #</th><th>Project</th><th>Close Date</th><th>Days Left</th><th>Action</th></tr></thead>
      <tbody>
        <tr><td>Open</td><td>R-1</td><td>Known deadline</td><td>Oct 15th 2026, 2:00 PM MDT</td><td>17</td><td><a href="/opportunities/1">x</a></td></tr>
        <tr><td>Open</td><td>R-2</td><td>No timezone</td><td>Oct 15th 2026, 2:00 PM</td><td>17</td><td><a href="/opportunities/2">x</a></td></tr>
      </tbody>
    </table>`;

  it('carries the corrected instant and full provenance onto the record', () => {
    const [known, unknown] = parseHtml(html);
    expect(known.closeDate).toBe('2026-10-15T20:00:00.000Z');
    expect(known.closeDateRaw).toBe('Oct 15th 2026, 2:00 PM MDT');
    expect(known.closeDateTimezone).toBe('MDT');
    expect(known.closeDateOffsetMinutes).toBe(-360);
    expect(known.closeDateConfidence).toBe('high');

    expect(unknown.closeDate).toBeNull();
    expect(unknown.closeDateUncertainty).toBe('missing_timezone');
    expect(unknown.closeDateRaw).toBe('Oct 15th 2026, 2:00 PM');
  });
});

describe('boundary 2: scraper record -> normalized row', () => {
  const record = {
    refNumber: 'R-1', projectName: 'Example', status: 'Open',
    ...(() => {
      const d = parseDeadline('Oct 15th 2026, 2:00 PM MDT');
      return {
        closeDate: d.utc, closeDateRaw: d.originalText, closeDateTimezone: d.timezoneLabel,
        closeDateOffsetMinutes: d.offsetMinutes, closeDateConfidence: d.confidence,
        closeDateUncertainty: d.uncertainty,
      };
    })(),
  };

  it('normalize preserves close_date and the provenance fields', () => {
    const row = fromAgencyOpportunity(record, 'utah', { agencyName: 'Utah' });
    expect(row.close_date).toBe('2026-10-15T20:00:00.000Z');
    expect(row.close_date_raw).toBe('Oct 15th 2026, 2:00 PM MDT');
    expect(row.close_date_timezone).toBe('MDT');
    expect(row.close_date_offset_minutes).toBe(-360);
    expect(row.close_date_confidence).toBe('high');
  });
});

describe('boundary 3: validateRow — exactly which provenance is LOST', () => {
  const normalized = {
    title: 'Example', close_date: '2026-10-15T20:00:00.000Z',
    close_date_raw: 'Oct 15th 2026, 2:00 PM MDT',
    close_date_timezone: 'MDT',
    close_date_offset_minutes: -360,
    close_date_confidence: 'high',
    close_date_uncertainty: null,
    external_id: 'bonfire:agency:utah:R-1',
  };

  it('the corrected instant survives into the persisted row', () => {
    const { ok, row } = validateRow(normalized, 0);
    expect(ok).toBe(true);
    expect(row.closeDate).toBeInstanceOf(Date);
    expect(row.closeDate.toISOString()).toBe('2026-10-15T20:00:00.000Z');
  });

  it('ALL five provenance fields are dropped — this is the Phase 2 gap', () => {
    const { row } = validateRow(normalized, 0);
    for (const k of [
      'closeDateRaw', 'close_date_raw',
      'closeDateTimezone', 'close_date_timezone',
      'closeDateOffsetMinutes', 'close_date_offset_minutes',
      'closeDateConfidence', 'close_date_confidence',
      'closeDateUncertainty', 'close_date_uncertainty',
    ]) {
      expect(row[k]).toBeUndefined();
    }
    // validateRow copies an explicit allow-list, so anything not named is lost.
    expect(Object.keys(row).sort()).toEqual([
      'agency', 'categoryRaw', 'closeDate', 'description',
      'estimatedValue', 'externalId', 'rawText', 'sourceUrl', 'title',
    ]);
  });

  it('an unresolved deadline normalizes to null, not to a fabricated date', () => {
    const { row } = validateRow({ ...normalized, close_date: null }, 0);
    expect(row.closeDate).toBeNull();
  });
});

describe('boundary 4: persistence — null must NOT erase a known deadline', () => {
  const mkRow = (ref, closeDate) => ({
    title: `T-${ref}`, external_id: `bonfire:agency:utah:${ref}`, close_date: closeDate,
  });

  it('rows with a known deadline DO update closeDate (the intended fix)', async () => {
    await svc.upsertJsonArray([mkRow('A', '2026-10-15T20:00:00.000Z')]);
    const withClose = calls().find((c) => (c[1].updateOnDuplicate || []).includes('closeDate'));
    expect(withClose).toBeDefined();
    expect(withClose[0]).toHaveLength(1);
    expect(withClose[0][0].externalId).toBe('bonfire:agency:utah:A');
  });

  it('rows with an UNRESOLVED deadline are upserted WITHOUT closeDate', async () => {
    await svc.upsertJsonArray([mkRow('B', null)]);
    expect(calls()).toHaveLength(1);
    const [rows, opts] = calls()[0];
    expect(rows).toHaveLength(1);
    expect(opts.updateOnDuplicate).not.toContain('closeDate');
    // everything else still refreshes
    expect(opts.updateOnDuplicate).toEqual(
      expect.arrayContaining(['title', 'agency', 'sourceUrl', 'rawText', 'updatedAt']),
    );
  });

  it('a mixed batch is split so neither group is compromised', async () => {
    await svc.upsertJsonArray([
      mkRow('A', '2026-10-15T20:00:00.000Z'),
      mkRow('B', null),
      mkRow('C', '2026-10-16T20:00:00.000Z'),
    ]);
    expect(calls()).toHaveLength(2);
    const withClose = calls().find((c) => c[1].updateOnDuplicate.includes('closeDate'));
    const withoutClose = calls().find((c) => !c[1].updateOnDuplicate.includes('closeDate'));
    expect(withClose[0].map((r) => r.externalId)).toEqual([
      'bonfire:agency:utah:A', 'bonfire:agency:utah:C',
    ]);
    expect(withoutClose[0].map((r) => r.externalId)).toEqual(['bonfire:agency:utah:B']);
  });

  it('both groups still target external_id for conflict resolution', async () => {
    await svc.upsertJsonArray([mkRow('A', '2026-10-15T20:00:00.000Z'), mkRow('B', null)]);
    for (const [, opts] of calls()) {
      expect(opts.conflictAttributes).toEqual(['externalId']);
    }
  });

  it('reports every accepted row as upserted across both batches', async () => {
    const out = await svc.upsertJsonArray([
      mkRow('A', '2026-10-15T20:00:00.000Z'), mkRow('B', null), mkRow('C', null),
    ]);
    expect(out.processed).toBe(3);
    expect(out.upserted).toBe(3);
  });
});

describe('boundary 5: the corrected value genuinely differs from the legacy one', () => {
  it('the same portal string now persists six hours later than before', () => {
    // The legacy code stripped the zone and called new Date(<local string>).
    // In the production container (TZ=UTC) that is equivalent to reading the
    // wall clock as UTC, which is what we reproduce here deterministically —
    // using new Date('Oct 15 2026 2:00 PM') would make this test depend on the
    // runner's timezone, which is the very defect under repair.
    const legacy = new Date(Date.UTC(2026, 9, 15, 14, 0, 0)).toISOString();
    const corrected = parseDeadline('Oct 15th 2026, 2:00 PM MDT').utc;
    expect(legacy).toBe('2026-10-15T14:00:00.000Z');
    expect(corrected).toBe('2026-10-15T20:00:00.000Z');
    expect(new Date(corrected) - new Date(legacy)).toBe(6 * 3600 * 1000);
  });

  it('and the new parser is itself TZ-independent for this input', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
        process.env.TZ = tz;
        expect(parseDeadline('Oct 15th 2026, 2:00 PM MDT').utc).toBe('2026-10-15T20:00:00.000Z');
      }
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });
});
