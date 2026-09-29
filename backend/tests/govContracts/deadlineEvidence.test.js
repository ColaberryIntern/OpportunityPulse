// Phase 2 deadline evidence — write rules and read model.
//
// Each describe below pins one of the corrections the coordinator required.
// They are behavioural, not incidental: every one of them was a wrong answer
// the single-close_date design could produce.

const {
  buildObservationPatch,
  readDeadlineState,
  classifySourceState,
  isVerifiable,
  hasCompetingEvidence,
  SOURCE_STATE,
  EFFECTIVE_STATE,
} = require('../../src/bonfire/deadlineEvidence.service');

const T0 = new Date('2026-09-01T00:00:00.000Z');
const T1 = new Date('2026-09-10T00:00:00.000Z');
const T2 = new Date('2026-09-20T00:00:00.000Z');

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
  timezoneSource: 'absent',
  offsetMinutes: null,
  utc: null,
  confidence: 'unknown',
  uncertainty: 'missing_timezone',
  candidates: null,
});

const ambiguousParse = () => ({
  originalText: 'Nov 1 2026 1:30 AM Eastern Time',
  wallClock: '2026-11-01T01:30:00',
  timezoneLabel: 'Eastern Time',
  timezoneSource: 'named_zone',
  offsetMinutes: null,
  utc: null,
  confidence: 'unknown',
  uncertainty: 'dst_ambiguous',
  candidates: [
    { utc: '2026-11-01T05:30:00.000Z', offsetMinutes: -240 },
    { utc: '2026-11-01T06:30:00.000Z', offsetMinutes: -300 },
  ],
});

// ---------------------------------------------------------------------------
describe('legacy rows: a stored deadline with NULL verified_at is UNVERIFIED', () => {
  it('is unverified even when uncertainty is also NULL', () => {
    // This is the exact legacy shape: a value exists, nothing ever verified it,
    // and no parse failure was recorded. Absence of a recorded failure is not
    // evidence of verification.
    const state = readDeadlineState({
      closeDate: '2026-10-15T14:00:00.000Z',
      closeDateVerifiedAt: null,
      closeDateUncertainty: null,
    });
    expect(state.state).toBe(EFFECTIVE_STATE.LEGACY_UNVERIFIED);
    expect(state.isVerified).toBe(false);
    expect(state.utc).toBeNull();
  });

  it('retains the value rather than discarding it', () => {
    const state = readDeadlineState({
      closeDate: '2026-10-15T14:00:00.000Z', closeDateVerifiedAt: null, closeDateUncertainty: null,
    });
    expect(state.retainedUtc).toBe('2026-10-15T14:00:00.000Z');
  });

  it('a verified row with no newer disagreement IS verified', () => {
    const state = readDeadlineState({
      closeDate: '2026-10-15T20:00:00.000Z',
      closeDateVerifiedAt: T1,
      closeDateUncertainty: null,
      closeDateObservationUtc: '2026-10-15T20:00:00.000Z',
    });
    expect(state.state).toBe(EFFECTIVE_STATE.VERIFIED);
    expect(state.isVerified).toBe(true);
    expect(state.utc).toBe('2026-10-15T20:00:00.000Z');
  });
});

describe('parsing is not authority', () => {
  it('a clean parse with competing evidence is NOT verifiable', () => {
    expect(isVerifiable({
      sourceState: SOURCE_STATE.PUBLISHED_PARSED,
      parse: goodParse(),
      candidates: [
        { utc: '2026-10-15T20:00:00.000Z' },
        { utc: '2026-10-15T21:00:00.000Z' },
      ],
    })).toBe(false);
  });

  it('a clean parse with no competing evidence IS verifiable', () => {
    expect(isVerifiable({
      sourceState: SOURCE_STATE.PUBLISHED_PARSED, parse: goodParse(), candidates: null,
    })).toBe(true);
  });

  it('candidates naming the same instant are not a conflict', () => {
    expect(hasCompetingEvidence([
      { utc: '2026-10-15T20:00:00.000Z' }, { utc: '2026-10-15T20:00:00.000Z' },
    ])).toBe(false);
  });

  it('a conflicting observation does not publish, and records both candidates', () => {
    const current = { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0 };
    const { patch, decision } = buildObservationPatch(current, {
      fetch: { status: 'success', attemptedAt: T1 },
      parse: goodParse('2026-10-15T21:00:00.000Z'),
      candidates: [
        { utc: '2026-10-15T20:00:00.000Z', source: 'portal' },
        { utc: '2026-10-15T21:00:00.000Z', source: 'lead document' },
      ],
      now: T1,
    });
    expect(decision.verified).toBe(false);
    expect(decision.reason).toBe('competing_evidence');
    expect(patch).not.toHaveProperty('closeDate');
    expect(patch).not.toHaveProperty('closeDateVerifiedAt');
    expect(patch.closeDateCandidates).toHaveLength(2);
    expect(patch.closeDateConservativeUtc).toBe('2026-10-15T20:00:00.000Z'); // earliest
  });
});

describe('verified -> unresolved -> verified', () => {
  it('step 1: verifies and stamps verified_at', () => {
    const { patch, decision } = buildObservationPatch(
      { closeDate: null, closeDateVerifiedAt: null },
      { fetch: { status: 'success', attemptedAt: T0 }, parse: goodParse(), source: 'portal_scrape', now: T0 },
    );
    expect(decision.verified).toBe(true);
    expect(patch.closeDate).toBe('2026-10-15T20:00:00.000Z');
    expect(patch.closeDateVerifiedAt).toBe(T0);
    expect(patch.closeDateVerifiedSource).toBe('portal_scrape');
  });

  it('step 2: an unresolved re-scrape touches NEITHER close_date NOR verified_at', () => {
    const current = {
      closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0, closeDateSuperseded: null,
    };
    const { patch, decision } = buildObservationPatch(current, {
      fetch: { status: 'success', attemptedAt: T1 }, parse: unresolvedParse(), now: T1,
    });
    expect(decision.verified).toBe(false);
    // The load-bearing assertion: a retained value cannot appear newly verified.
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDate')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDateVerifiedAt')).toBe(false);
    // ...while the observation clock DOES move, so staleness is visible.
    expect(patch.closeDateObservedAt).toBe(T1);
    expect(patch.closeDateUncertainty).toBe('missing_timezone');
  });

  it('step 2 read model: the retained value is reported as NOT verified', () => {
    const state = readDeadlineState({
      closeDate: '2026-10-15T20:00:00.000Z',
      closeDateVerifiedAt: T0,
      closeDateUncertainty: 'missing_timezone',
      closeDateObservedAt: T1,
    });
    expect(state.state).toBe(EFFECTIVE_STATE.RETAINED_UNVERIFIED);
    expect(state.isVerified).toBe(false);
    expect(state.utc).toBeNull();
    expect(state.retainedUtc).toBe('2026-10-15T20:00:00.000Z');
    // verified_at still reports the ORIGINAL verification, not "now"
    expect(state.verifiedAt).toBe(T0.toISOString());
  });

  it('step 3: re-verification republishes and appends the displaced value to history', () => {
    const current = {
      closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0, closeDateSuperseded: null,
    };
    const { patch, decision } = buildObservationPatch(current, {
      fetch: { status: 'success', attemptedAt: T2 },
      parse: goodParse('2026-10-20T20:00:00.000Z'),
      source: 'portal_scrape',
      now: T2,
    });
    expect(decision.verified).toBe(true);
    expect(decision.publishedDeadlineChanged).toBe(true);
    expect(patch.closeDate).toBe('2026-10-20T20:00:00.000Z');
    expect(patch.closeDateVerifiedAt).toBe(T2);
    expect(patch.closeDateSuperseded).toEqual([{
      utc: '2026-10-15T20:00:00.000Z',
      verifiedAt: T0.toISOString(),
      replacedAt: T2.toISOString(),
      reason: 'superseded_by_verified_observation',
    }]);
  });

  it('re-verifying the SAME instant does not pollute history', () => {
    const { patch } = buildObservationPatch(
      { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0, closeDateSuperseded: null },
      { fetch: { status: 'success' }, parse: goodParse(), now: T2 },
    );
    expect(patch.closeDateSuperseded).toBeUndefined();
    expect(patch.closeDateVerifiedAt).toBe(T2); // re-confirmed
  });

  it('history is append-only across repeated supersessions', () => {
    const existing = [{
      utc: '2026-09-01T00:00:00.000Z', verifiedAt: null, replacedAt: T0.toISOString(), reason: 'x',
    }];
    const { patch } = buildObservationPatch(
      { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0, closeDateSuperseded: existing },
      { fetch: { status: 'success' }, parse: goodParse('2026-11-01T20:00:00.000Z'), now: T2 },
    );
    expect(patch.closeDateSuperseded).toHaveLength(2);
    expect(patch.closeDateSuperseded[0]).toEqual(existing[0]); // prior entry preserved
  });
});

describe('a failed fetch is not an observation', () => {
  it('moves the attempt clock but NOT the observation clock', () => {
    const { patch, decision } = buildObservationPatch(
      { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0 },
      { fetch: { status: 'failed', attemptedAt: T2, error: 'HTTP 403' }, now: T2 },
    );
    expect(decision.reason).toBe('fetch_failed');
    expect(patch.closeDateFetchAttemptedAt).toBe(T2);
    expect(patch.closeDateFetchStatus).toBe('failed');
    expect(patch.closeDateFetchError).toBe('HTTP 403');
    expect(patch.closeDateSourceState).toBe(SOURCE_STATE.FETCH_FAILED);
    // Neither the observation nor the effective value is touched.
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDateObservedAt')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDate')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDateRaw')).toBe(false);
  });

  it('does not erase a previously captured raw text', () => {
    const { patch } = buildObservationPatch(
      { closeDateRaw: 'Oct 15th 2026, 2:00 PM MDT' },
      { fetch: { status: 'failed', attemptedAt: T2 }, now: T2 },
    );
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDateRaw')).toBe(false);
  });
});

describe('absent is not the same as unobserved', () => {
  it('a successful fetch with no deadline field is not_published', () => {
    expect(classifySourceState({ fetchStatus: 'success', rawPresent: false, parse: null }))
      .toBe(SOURCE_STATE.NOT_PUBLISHED);
  });

  it('a failed fetch is fetch_failed, NOT not_published', () => {
    expect(classifySourceState({ fetchStatus: 'failed', rawPresent: false, parse: null }))
      .toBe(SOURCE_STATE.FETCH_FAILED);
  });

  it('never observed is distinct from both', () => {
    expect(classifySourceState({ fetchStatus: null, rawPresent: false, parse: null }))
      .toBe(SOURCE_STATE.NOT_OBSERVED);
  });

  it('text present but unparseable is published_unparsed', () => {
    expect(classifySourceState({ fetchStatus: 'success', rawPresent: true, parse: unresolvedParse() }))
      .toBe(SOURCE_STATE.PUBLISHED_UNPARSED);
  });

  it('NULL raw text alone does not prove the buyer published nothing', () => {
    // Same NULL raw text, two different truths, distinguished by source_state.
    const notPublished = readDeadlineState({
      closeDate: null, closeDateVerifiedAt: null, closeDateRaw: null,
      closeDateSourceState: SOURCE_STATE.NOT_PUBLISHED,
    });
    const neverLooked = readDeadlineState({
      closeDate: null, closeDateVerifiedAt: null, closeDateRaw: null,
      closeDateSourceState: SOURCE_STATE.NOT_OBSERVED,
    });
    expect(notPublished.state).toBe(EFFECTIVE_STATE.NOT_PUBLISHED);
    expect(neverLooked.state).toBe(EFFECTIVE_STATE.UNKNOWN);
    expect(notPublished.state).not.toBe(neverLooked.state);
  });
});

describe('DST ambiguity carries both candidates into storage', () => {
  it('stores both instants and picks the earlier as conservative only', () => {
    const { patch, decision } = buildObservationPatch(
      { closeDate: null, closeDateVerifiedAt: null },
      { fetch: { status: 'success' }, parse: ambiguousParse(), now: T1 },
    );
    expect(decision.verified).toBe(false);
    expect(patch.closeDateCandidates).toHaveLength(2);
    expect(patch.closeDateConservativeUtc).toBe('2026-11-01T05:30:00.000Z');
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDate')).toBe(false);
  });
});

describe('the confidence contradiction is resolved', () => {
  it('observation confidence is recorded without implying verification', () => {
    const { patch } = buildObservationPatch(
      { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0 },
      { fetch: { status: 'success' }, parse: unresolvedParse(), now: T1 },
    );
    // The observation was low-confidence...
    expect(patch.closeDateObservationConfidence).toBe('unknown');
    // ...and that fact did NOT reach back and downgrade the effective value,
    // which is exactly what the old single confidence column did.
    expect(Object.prototype.hasOwnProperty.call(patch, 'closeDateVerifiedAt')).toBe(false);
    expect(patch).not.toHaveProperty('closeDateConfidence');
  });

  it('there is no single ambiguous confidence column at all', () => {
    const { patch } = buildObservationPatch(
      {}, { fetch: { status: 'success' }, parse: goodParse(), now: T0 },
    );
    expect(patch).not.toHaveProperty('closeDateConfidence');
    expect(patch).toHaveProperty('closeDateObservationConfidence');
    expect(patch).toHaveProperty('closeDateVerifiedAt');
  });
});

describe('repeated ingestion is idempotent in effect', () => {
  it('applying the same verified observation twice yields the same published value', () => {
    const first = buildObservationPatch({}, {
      fetch: { status: 'success' }, parse: goodParse(), source: 'portal_scrape', now: T0,
    });
    const after = { ...first.patch };
    const second = buildObservationPatch(after, {
      fetch: { status: 'success' }, parse: goodParse(), source: 'portal_scrape', now: T1,
    });
    expect(second.patch.closeDate).toBe(first.patch.closeDate);
    expect(second.decision.publishedDeadlineChanged).toBe(false);
    expect(second.patch.closeDateSuperseded).toBeUndefined();
  });

  it('a repeated unresolved observation never accumulates history', () => {
    const current = { closeDate: '2026-10-15T20:00:00.000Z', closeDateVerifiedAt: T0, closeDateSuperseded: null };
    for (const now of [T1, T2]) {
      const { patch } = buildObservationPatch(current, {
        fetch: { status: 'success' }, parse: unresolvedParse(), now,
      });
      expect(patch.closeDateSuperseded).toBeUndefined();
    }
  });
});
