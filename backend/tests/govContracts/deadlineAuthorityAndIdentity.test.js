// Phase 2, issues 2 and 3.
//
// Issue 2: source authority is ESTABLISHED from what was observed, not assumed
//          by a hardcoded basis string that claimed publisher-of-record for
//          every portal row, including courtesy re-posts.
// Issue 3: verification validity is decided by observation IDENTITY, not by
//          comparing two timestamps that can be equal.
//
// Both are behavioural: each test below is a wrong answer the previous design
// produced.

const {
  buildObservationPatch,
  isVerificationCurrent,
  verifiability,
  AUTHORITY,
  OBSERVATION_OUTCOME,
} = require('../../src/bonfire/deadlineEvidence.service');
const { classifySourceAuthority, sourceContentHash } = require('../../src/govContracts/govIngestion.service');

const T0 = new Date('2026-09-01T00:00:00.000Z');
const T1 = new Date('2026-09-10T00:00:00.000Z');
const T2 = new Date('2026-09-20T00:00:00.000Z');

const PROV = {
  source: 'bonfire_portal_scrape',
  basis: AUTHORITY.PUBLISHER_OF_RECORD,
  authority: AUTHORITY.PUBLISHER_OF_RECORD,
  authorityEvidence: 'Portal host "utah.bonfirehub.com" matches the ingest namespace "utah".',
  sourceRef: 'https://utah.bonfirehub.com/opportunities/123',
};

const goodParse = (utc = '2026-10-15T20:00:00.000Z') => ({
  originalText: 'Oct 15th 2026, 2:00 PM MDT',
  wallClock: '2026-10-15T14:00:00',
  timezoneLabel: 'MDT',
  timezoneSource: 'abbreviation',
  offsetMinutes: -360,
  utc,
  confidence: 'high',
  uncertainty: null,
  candidates: null,
});

const unresolvedParse = () => ({
  originalText: 'Oct 15th 2026, 2:00 PM',
  wallClock: '2026-10-15T14:00:00',
  timezoneLabel: null,
  timezoneSource: null,
  offsetMinutes: null,
  utc: null,
  confidence: 'low',
  uncertainty: 'timezone_unresolved',
  candidates: null,
});

const withAuthority = (over) => ({ ...PROV, ...over });

// ---------------------------------------------------------------------------
// The classifier itself
// ---------------------------------------------------------------------------
describe('classifySourceAuthority determines authority from observed facts', () => {
  // The live case: NASPO SW1045 is carried on Utah's Bonfire with Oklahoma as
  // lead buyer. Reading Utah's rendering of the deadline tells us what Utah
  // printed, not what the buyer set.
  it('NASPO regression: a cooperative posting is a COURTESY posting', () => {
    const out = classifySourceAuthority({
      title: 'NASPO ValuePoint Software Value-Added Reseller (SW1045)',
      sourceUrl: 'https://utah.bonfirehub.com/opportunities/98765',
      externalId: 'bonfire:agency:utah:98765',
    });
    expect(out.authority).toBe(AUTHORITY.COURTESY_POSTING);
    // Evidence must be checkable, not a label.
    expect(out.evidence).toMatch(/NASPO/i);
  });

  it('an explicit courtesy notice is a courtesy posting', () => {
    expect(classifySourceAuthority({
      title: 'Courtesy Posting - RFP 24-100 on behalf of Sandy City',
      sourceUrl: 'https://utah.bonfirehub.com/opportunities/1',
      externalId: 'bonfire:agency:utah:1',
    }).authority).toBe(AUTHORITY.COURTESY_POSTING);
  });

  it('a portal publishing its OWN notice is publisher of record, with the comparison as evidence', () => {
    const out = classifySourceAuthority({
      title: 'RFP 24-200 Data Analytics Services',
      sourceUrl: 'https://utah.bonfirehub.com/opportunities/2',
      externalId: 'bonfire:agency:utah:2',
    });
    expect(out.authority).toBe(AUTHORITY.PUBLISHER_OF_RECORD);
    expect(out.evidence).toMatch(/utah\.bonfirehub\.com/);
    expect(out.evidence).toMatch(/namespace/i);
  });

  it('a host that does not match the ingest namespace is UNKNOWN, not assumed', () => {
    const out = classifySourceAuthority({
      title: 'RFP 24-300',
      sourceUrl: 'https://someaggregator.example.com/opportunities/3',
      externalId: 'bonfire:agency:utah:3',
    });
    expect(out.authority).toBe(AUTHORITY.UNKNOWN);
  });

  it('missing evidence yields UNKNOWN rather than an invented mapping', () => {
    expect(classifySourceAuthority({ title: 'RFP 24-400' }).authority).toBe(AUTHORITY.UNKNOWN);
    expect(classifySourceAuthority({}).authority).toBe(AUTHORITY.UNKNOWN);
    expect(classifySourceAuthority().authority).toBe(AUTHORITY.UNKNOWN);
  });

  it('does not fire on a word that merely CONTAINS a trigger', () => {
    // The word boundary is load-bearing: "Naspon" is not NASPO.
    expect(classifySourceAuthority({
      title: 'Naspon Industrial Cleaning Services',
      sourceUrl: 'https://utah.bonfirehub.com/opportunities/4',
      externalId: 'bonfire:agency:utah:4',
    }).authority).toBe(AUTHORITY.PUBLISHER_OF_RECORD);
  });

  it('a malformed URL does not throw; it yields UNKNOWN', () => {
    expect(classifySourceAuthority({
      title: 'RFP', sourceUrl: 'not a url', externalId: 'bonfire:agency:utah:5',
    }).authority).toBe(AUTHORITY.UNKNOWN);
  });
});

// ---------------------------------------------------------------------------
// Issue 2: authority gates verification
// ---------------------------------------------------------------------------
describe('source authority gates verification', () => {
  it('a courtesy posting does NOT verify, however cleanly it parses', () => {
    const { patch, decision } = buildObservationPatch({}, {
      fetch: { status: 'success' },
      parse: goodParse(),
      provenance: withAuthority({
        authority: AUTHORITY.COURTESY_POSTING,
        authorityEvidence: 'Title matched courtesy-posting phrase "NASPO".',
      }),
      now: T1,
    });
    expect(decision.verified).toBe(false);
    expect(decision.reason).toBe('unestablished_source_authority');
    expect(patch.closeDateVerifiedAt).toBeUndefined();
    // The reading is still RECORDED. Withholding verification is not
    // discarding evidence.
    expect(patch.closeDateObservationUtc).toBe('2026-10-15T20:00:00.000Z');
  });

  it('an unknown authority does not verify', () => {
    expect(verifiability({
      outcome: OBSERVATION_OUTCOME.PARSED,
      parse: goodParse(),
      provenance: withAuthority({ authority: AUTHORITY.UNKNOWN }),
    })).toEqual({ ok: false, reason: 'unestablished_source_authority' });
  });

  it('an aggregator does not verify', () => {
    expect(verifiability({
      outcome: OBSERVATION_OUTCOME.PARSED,
      parse: goodParse(),
      provenance: withAuthority({ authority: AUTHORITY.AGGREGATOR }),
    }).ok).toBe(false);
  });

  it('publisher-of-record WITHOUT evidence for the claim does not verify', () => {
    // The point of issue 2: a label is not evidence.
    expect(verifiability({
      outcome: OBSERVATION_OUTCOME.PARSED,
      parse: goodParse(),
      provenance: withAuthority({ authorityEvidence: null }),
    })).toEqual({ ok: false, reason: 'unevidenced_authority' });
  });

  it('publisher-of-record with no resolvable source reference does not verify', () => {
    expect(verifiability({
      outcome: OBSERVATION_OUTCOME.PARSED,
      parse: goodParse(),
      provenance: withAuthority({ sourceRef: null }),
    })).toEqual({ ok: false, reason: 'missing_source_ref' });
  });

  it('an evidenced publisher of record DOES verify', () => {
    const { decision } = buildObservationPatch({}, {
      fetch: { status: 'success' }, parse: goodParse(), provenance: PROV, now: T1,
    });
    expect(decision).toMatchObject({
      verified: true, reason: 'verified', authority: AUTHORITY.PUBLISHER_OF_RECORD,
    });
  });

  it('the authority and its evidence are PERSISTED on every applied observation', () => {
    const { patch } = buildObservationPatch({}, {
      fetch: { status: 'success' },
      parse: goodParse(),
      provenance: withAuthority({
        authority: AUTHORITY.COURTESY_POSTING,
        authorityEvidence: 'Title matched courtesy-posting phrase "NASPO".',
      }),
      now: T1,
    });
    expect(patch.closeDateAuthority).toBe(AUTHORITY.COURTESY_POSTING);
    expect(patch.closeDateAuthorityEvidence).toMatch(/NASPO/);
  });
});

// ---------------------------------------------------------------------------
// Issue 3: observation identity, not timestamp comparison
// ---------------------------------------------------------------------------
describe('verification validity is decided by observation identity', () => {
  it('equal timestamps with DIFFERENT observations read as NOT current', () => {
    // The case a `<=` comparison cannot express: a later observation that
    // happened to land in the same millisecond as the verification.
    expect(isVerificationCurrent({
      closeDateVerifiedAt: T0,
      closeDateObservedAt: T0,
      closeDateVerifiedObservationId: 'obs-1',
      closeDateLastObservationId: 'obs-2',
    })).toBe(false);
  });

  it('equal timestamps with the SAME observation read as current', () => {
    expect(isVerificationCurrent({
      closeDateVerifiedAt: T0,
      closeDateObservedAt: T0,
      closeDateVerifiedObservationId: 'obs-1',
      closeDateLastObservationId: 'obs-1',
    })).toBe(true);
  });

  it('an observation arriving with an OLDER clock cannot demote a verification', () => {
    const verifiedRow = {
      closeDate: '2026-10-15T20:00:00.000Z',
      closeDateVerifiedAt: T2,
      closeDateObservedAt: T2,
      closeDateVerifiedObservationId: 'obs-1',
      closeDateLastObservationId: 'obs-1',
    };
    const { patch, decision } = buildObservationPatch(verifiedRow, {
      fetch: { status: 'success' }, parse: unresolvedParse(), provenance: PROV, now: T1,
    });
    expect(decision.reason).toBe('stale_observation');
    // Attempt recorded; state untouched, so the row stays verified.
    expect(patch.closeDateFetchStatus).toBe('success');
    expect(patch.closeDateLastObservationId).toBeUndefined();
    expect(patch.closeDateObservedAt).toBeUndefined();
    expect(patch.closeDate).toBeUndefined();
  });

  it('every applied observation stamps itself as the latest', () => {
    const { patch, decision } = buildObservationPatch({}, {
      fetch: { status: 'success' }, parse: goodParse(), provenance: PROV, now: T1,
    });
    expect(patch.closeDateLastObservationId).toBe(decision.observationId);
    expect(patch.closeDateVerifiedObservationId).toBe(decision.observationId);
  });

  it('a FAILED fetch does not claim to be the latest observation', () => {
    // Our inability to reach the source is not evidence against the deadline.
    const { patch } = buildObservationPatch({}, {
      fetch: { status: 'failed', error: 'timeout' }, provenance: PROV, now: T1,
    });
    expect(patch.closeDateLastObservationId).toBeUndefined();
  });

  it('a later unverifiable observation breaks the identity link, so the row is no longer current', () => {
    const first = buildObservationPatch({}, {
      fetch: { status: 'success' }, parse: goodParse(), provenance: PROV, now: T0,
    });
    const row = { ...first.patch };
    expect(isVerificationCurrent(row)).toBe(true);

    const second = buildObservationPatch(row, {
      fetch: { status: 'success' },
      parse: goodParse(),
      provenance: withAuthority({ authority: AUTHORITY.COURTESY_POSTING }),
      now: T1,
    });
    expect(isVerificationCurrent({ ...row, ...second.patch })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retention is a guarantee about VERIFIED deadlines only
// ---------------------------------------------------------------------------
describe('an unverifiable observation and the published deadline', () => {
  it('never replaces a VERIFIED deadline', () => {
    const row = {
      closeDate: '2026-10-15T20:00:00.000Z',
      closeDateVerifiedAt: T0,
      closeDateVerifiedObservationId: 'obs-1',
      closeDateLastObservationId: 'obs-1',
    };
    const { patch, decision } = buildObservationPatch(row, {
      fetch: { status: 'success' },
      parse: goodParse('2026-11-01T20:00:00.000Z'),
      provenance: withAuthority({ authority: AUTHORITY.COURTESY_POSTING }),
      now: T1,
    });
    expect(decision.verified).toBe(false);
    expect(patch.closeDate).toBeUndefined();
    expect(patch.closeDateVerifiedAt).toBeUndefined();
    expect(patch.closeDateObservationUtc).toBe('2026-11-01T20:00:00.000Z');
  });

  it('DOES refresh an unverified one, without claiming verification', () => {
    // Freezing an unverified value would leave a staler reading standing in
    // front of a fresher one, on the column /best-fit filters by.
    const row = { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: null };
    const { patch, decision } = buildObservationPatch(row, {
      fetch: { status: 'success' },
      parse: goodParse('2026-11-01T20:00:00.000Z'),
      provenance: withAuthority({ authority: AUTHORITY.COURTESY_POSTING }),
      now: T1,
    });
    expect(patch.closeDate).toBe('2026-11-01T20:00:00.000Z');
    expect(patch.closeDateVerifiedAt).toBeUndefined();
    expect(patch.closeDateVerifiedObservationId).toBeUndefined();
    expect(decision.verified).toBe(false);
    expect(decision.publishedDeadlineChanged).toBe(true);
  });

  it('never NULL-ERASES an unverified deadline when nothing parsed', () => {
    const row = { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: null };
    const { patch } = buildObservationPatch(row, {
      fetch: { status: 'success' }, parse: unresolvedParse(), rawPresent: true, provenance: PROV, now: T1,
    });
    expect(patch.closeDate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Issue 3: what a SOURCE version is allowed to depend on.
// ---------------------------------------------------------------------------
describe('sourceContentHash covers material evidence and nothing else', () => {
  const FACTS = {
    deadlineText: 'Oct 15th 2026, 2:00 PM MDT',
    title: 'RFP 24-200 Data Analytics Services',
    agency: 'State of Utah',
    sourceUrl: 'https://utah.bonfirehub.com/opportunities/2',
    externalId: 'bonfire:agency:utah:2',
  };
  const EXTRA = {
    authority: AUTHORITY.PUBLISHER_OF_RECORD,
    authorityEvidence: 'Portal host matches the ingest namespace.',
  };
  const base = sourceContentHash(FACTS, EXTRA);

  it('is stable for an identical re-observation', () => {
    expect(sourceContentHash({ ...FACTS }, { ...EXTRA })).toBe(base);
  });

  it('changes when the published deadline text changes', () => {
    expect(sourceContentHash({ ...FACTS, deadlineText: 'Nov 1st 2026, 2:00 PM MDT' }, EXTRA))
      .not.toBe(base);
  });

  it('changes when the AUTHORITY determination changes', () => {
    // A row that flips from publisher-of-record to courtesy posting has had a
    // material change in what its deadline means. Hashing only the published
    // facts left that unversioned.
    expect(sourceContentHash(FACTS, { ...EXTRA, authority: AUTHORITY.COURTESY_POSTING }))
      .not.toBe(base);
  });

  it('changes when the EVIDENCE for the authority changes', () => {
    expect(sourceContentHash(FACTS, { ...EXTRA, authorityEvidence: 'something else entirely' }))
      .not.toBe(base);
  });

  it('changes when the competing-reading set changes', () => {
    expect(sourceContentHash(FACTS, {
      ...EXTRA,
      candidates: [
        { utc: '2026-10-15T20:00:00.000Z', source: 'portal' },
        { utc: '2026-10-15T21:00:00.000Z', source: 'lead document' },
      ],
    })).not.toBe(base);
  });

  it('does NOT change when only the ORDER of the candidates differs', () => {
    const asc = sourceContentHash(FACTS, {
      ...EXTRA,
      candidates: [
        { utc: '2026-10-15T20:00:00.000Z', source: 'portal' },
        { utc: '2026-10-15T21:00:00.000Z', source: 'lead document' },
      ],
    });
    const desc = sourceContentHash(FACTS, {
      ...EXTRA,
      candidates: [
        { utc: '2026-10-15T21:00:00.000Z', source: 'lead document' },
        { utc: '2026-10-15T20:00:00.000Z', source: 'portal' },
      ],
    });
    expect(desc).toBe(asc);
  });

  it('changes when an observed DOCUMENT version or hash changes', () => {
    const v1 = sourceContentHash(FACTS, {
      ...EXTRA,
      documents: [{ id: 'doc-1', version: 1, sha256: 'aaa' }],
    });
    const v2 = sourceContentHash(FACTS, {
      ...EXTRA,
      documents: [{ id: 'doc-1', version: 2, sha256: 'bbb' }],
    });
    expect(v2).not.toBe(v1);
    expect(v1).not.toBe(base);
  });

  it('does NOT change when only the order of documents differs', () => {
    const a = sourceContentHash(FACTS, {
      ...EXTRA,
      documents: [
        { id: 'doc-1', version: 1, sha256: 'aaa' },
        { id: 'doc-2', version: 1, sha256: 'bbb' },
      ],
    });
    const b = sourceContentHash(FACTS, {
      ...EXTRA,
      documents: [
        { id: 'doc-2', version: 1, sha256: 'bbb' },
        { id: 'doc-1', version: 1, sha256: 'aaa' },
      ],
    });
    expect(b).toBe(a);
  });

  it('no observed documents is NOT a claim that none exist', () => {
    // Bonfire portal scraping captures no documents at all, so the absence of a
    // document list must hash the same as an explicitly empty one rather than
    // asserting complete coverage.
    expect(sourceContentHash(FACTS, { ...EXTRA, documents: [] })).toBe(base);
  });

  it('does NOT change when enrichment changes', () => {
    // If scores or AI categories fed the hash, re-running enrichment would
    // advance a SOURCE version and claim the buyer changed something.
    expect(sourceContentHash({
      ...FACTS, aiScore: 92, categories: ['analytics'], enrichedAt: new Date().toISOString(),
    }, EXTRA)).toBe(base);
  });

  it('does NOT change when only fetch timing changes', () => {
    expect(sourceContentHash({ ...FACTS, fetchedAt: '2026-09-29T00:00:00.000Z' }, {
      ...EXTRA, observedAt: '2026-09-29T00:00:00.000Z',
    })).toBe(base);
  });
});
