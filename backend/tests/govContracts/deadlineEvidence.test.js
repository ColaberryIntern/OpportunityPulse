// Phase 2 deadline evidence — write rules and read model.
//
// Each describe below pins one of the corrections the coordinator required.
// They are behavioural, not incidental: every one of them was a wrong answer
// the single-close_date design could produce.

const {
  buildObservationPatch,
  readDeadlineState,
  classifyObservation,
  isVerifiable,
  hasCompetingEvidence,
  isVerificationCurrent,
  OBSERVATION_OUTCOME,
  SOURCE_STATE,
  EFFECTIVE_STATE,
} = require('../../src/bonfire/deadlineEvidence.service');

// Verification now requires recorded provenance AND an explicit basis: parsing
// cleanly, with nobody happening to pass competing candidates, is the absence
// of contrary evidence rather than the presence of source authority.
const PROV = { source: 'portal_scrape', basis: 'single_authoritative_source' };

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
      closeDateObservedAt: T1, // verified write sets both to the same instant
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
    // A conflict is classified as outcome=conflict, which is not verifiable.
    expect(isVerifiable({
      outcome: OBSERVATION_OUTCOME.CONFLICT, parse: goodParse(), provenance: PROV,
    })).toBe(false);
  });

  it('a clean parse with no competing evidence IS verifiable', () => {
    expect(isVerifiable({
      outcome: OBSERVATION_OUTCOME.PARSED, parse: goodParse(), provenance: PROV,
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
      provenance: PROV,
      candidates: [
        { utc: '2026-10-15T20:00:00.000Z', source: 'portal' },
        { utc: '2026-10-15T21:00:00.000Z', source: 'lead document' },
      ],
      now: T1,
    });
    expect(decision.verified).toBe(false);
    // The outcome is now recorded explicitly rather than described in prose.
    expect(decision.outcome).toBe(OBSERVATION_OUTCOME.CONFLICT);
    expect(decision.reason).toBe(OBSERVATION_OUTCOME.CONFLICT);
    expect(patch).not.toHaveProperty('closeDate');
    expect(patch).not.toHaveProperty('closeDateVerifiedAt');
    expect(patch.closeDateCandidates).toHaveLength(2);
    expect(patch.closeDateConservativeUtc).toBe('2026-10-15T20:00:00.000Z'); // earliest
    // DEFECT A: the conflict must be DURABLE. The parse itself was clean, so
    // parse.uncertainty is null; without this the read model saw no
    // disagreement and reported the stale value as verified.
    expect(patch.closeDateUncertainty).toBe('conflicting_sources');
    expect(patch.closeDateObservationOutcome).toBe(OBSERVATION_OUTCOME.CONFLICT);
  });
});

// ===========================================================================
// The two defects the coordinator reproduced against c0d942ed. Both are
// end-to-end through buildObservationPatch -> readDeadlineState, because both
// passed at the writer and failed only when the row was read back.
// ===========================================================================
describe('reproduced defect A: unresolved conflict must withhold publication', () => {
  const OLD = '2026-10-15T20:00:00.000Z';
  const current = { closeDate: OLD, closeDateVerifiedAt: T0, closeDateObservedAt: T0 };

  it('a high-confidence parse MATCHING the stored value, with a disagreeing candidate, is not verified', () => {
    const { patch, decision } = buildObservationPatch(current, {
      fetch: { status: 'success' },
      parse: goodParse(OLD), // parses to exactly the stored instant
      candidates: [{ utc: OLD }, { utc: '2026-10-16T20:00:00.000Z' }],
      provenance: PROV,
      now: T1,
    });
    expect(decision.verified).toBe(false);

    const state = readDeadlineState({ ...current, ...patch });
    expect(state.state).toBe(EFFECTIVE_STATE.RETAINED_UNVERIFIED); // was: verified
    expect(state.isVerified).toBe(false);
    expect(state.utc).toBeNull(); // was: the stale old value
    expect(state.retainedUtc).toBe(OLD);
    expect(state.supersededBy).toBe(OBSERVATION_OUTCOME.CONFLICT);
  });
});

describe('reproduced defect B: missing capture is not evidence of absence', () => {
  const OLD = '2026-10-15T20:00:00.000Z';
  const current = { closeDate: OLD, closeDateVerifiedAt: T0, closeDateObservedAt: T0 };

  it('a successful fetch with no parse and no rawPresent is capture_unknown, NOT not_published', () => {
    const { patch } = buildObservationPatch(current, {
      fetch: { status: 'success' }, provenance: PROV, now: T1,
    });
    expect(patch.closeDateObservationOutcome).toBe(OBSERVATION_OUTCOME.CAPTURE_UNKNOWN);
    expect(patch.closeDateSourceState).toBe(SOURCE_STATE.CAPTURE_UNKNOWN);
    expect(patch.closeDateSourceState).not.toBe(SOURCE_STATE.NOT_PUBLISHED);
  });

  it('and the stored verification is no longer reported as current', () => {
    const { patch } = buildObservationPatch(current, {
      fetch: { status: 'success' }, provenance: PROV, now: T1,
    });
    const state = readDeadlineState({ ...current, ...patch });
    expect(state.state).toBe(EFFECTIVE_STATE.RETAINED_UNVERIFIED); // was: verified
    expect(state.isVerified).toBe(false);
    expect(state.supersededBy).toBe(OBSERVATION_OUTCOME.CAPTURE_UNKNOWN);
  });

  it('an AFFIRMED absence is different, and does read as not_published', () => {
    const { patch } = buildObservationPatch({}, {
      fetch: { status: 'success' }, absentConfirmed: true, provenance: PROV, now: T1,
    });
    expect(patch.closeDateObservationOutcome).toBe(OBSERVATION_OUTCOME.ABSENT_CONFIRMED);
    expect(readDeadlineState(patch).state).toBe(EFFECTIVE_STATE.NOT_PUBLISHED);
  });
});

describe('verification requires recorded provenance and an explicit basis', () => {
  it('a clean parse WITHOUT provenance does not verify', () => {
    const { decision } = buildObservationPatch({}, {
      fetch: { status: 'success' }, parse: goodParse(), now: T1,
    });
    expect(decision.verified).toBe(false);
    expect(decision.reason).toBe('missing_provenance_or_basis');
  });

  it('a clean parse with a source but NO basis does not verify', () => {
    const { decision } = buildObservationPatch({}, {
      fetch: { status: 'success' }, parse: goodParse(), provenance: { source: 'portal_scrape' }, now: T1,
    });
    expect(decision.verified).toBe(false);
  });

  it('with both, it verifies and records the basis', () => {
    const { patch, decision } = buildObservationPatch({}, {
      fetch: { status: 'success' }, parse: goodParse(), provenance: PROV, now: T1,
    });
    expect(decision.verified).toBe(true);
    expect(patch.closeDateVerifiedSource).toBe('portal_scrape');
    expect(patch.closeDateVerificationBasis).toBe('single_authoritative_source');
  });
});

describe('isVerificationCurrent is the single state definition', () => {
  it('true when never re-observed', () => {
    expect(isVerificationCurrent({ closeDateVerifiedAt: T0, closeDateObservedAt: null })).toBe(true);
  });
  it('true when observed at the same instant as verification', () => {
    expect(isVerificationCurrent({ closeDateVerifiedAt: T0, closeDateObservedAt: T0 })).toBe(true);
  });
  it('false once a newer observation lands', () => {
    expect(isVerificationCurrent({ closeDateVerifiedAt: T0, closeDateObservedAt: T1 })).toBe(false);
  });
  it('false when never verified', () => {
    expect(isVerificationCurrent({ closeDateVerifiedAt: null, closeDateObservedAt: T1 })).toBe(false);
  });
});

describe('verified -> unresolved -> verified', () => {
  it('step 1: verifies and stamps verified_at', () => {
    const { patch, decision } = buildObservationPatch(
      { closeDate: null, closeDateVerifiedAt: null },
      { fetch: { status: 'success', attemptedAt: T0 }, parse: goodParse(), provenance: PROV, now: T0 },
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
      provenance: PROV,
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
      { fetch: { status: 'success' }, parse: goodParse(), provenance: PROV, now: T2 },
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
      { fetch: { status: 'success' }, parse: goodParse('2026-11-01T20:00:00.000Z'), provenance: PROV, now: T2 },
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
    // Only an AFFIRMED absence counts. This is defect B.
    expect(classifyObservation({ fetchStatus: 'success', absentConfirmed: true, parse: null }))
      .toBe(OBSERVATION_OUTCOME.ABSENT_CONFIRMED);
    expect(classifyObservation({ fetchStatus: 'success', rawPresent: false, parse: null }))
      .toBe(OBSERVATION_OUTCOME.CAPTURE_UNKNOWN);
  });

  it('a failed fetch is fetch_failed, NOT not_published', () => {
    expect(classifyObservation({ fetchStatus: 'failed', rawPresent: false, parse: null }))
      .toBe(OBSERVATION_OUTCOME.FETCH_FAILED);
  });

  it('never observed is distinct from both', () => {
    expect(classifyObservation({ fetchStatus: null, rawPresent: false, parse: null }))
      .toBe(OBSERVATION_OUTCOME.CAPTURE_UNKNOWN);
  });

  it('text present but unparseable is published_unparsed', () => {
    expect(classifyObservation({ fetchStatus: 'success', rawPresent: true, parse: unresolvedParse() }))
      .toBe(OBSERVATION_OUTCOME.UNPARSED);
  });

  it('NULL raw text alone does not prove the buyer published nothing', () => {
    // Same NULL raw text, two different truths, distinguished by source_state.
    const notPublished = readDeadlineState({
      closeDate: null, closeDateVerifiedAt: null, closeDateRaw: null,
      closeDateObservationOutcome: OBSERVATION_OUTCOME.ABSENT_CONFIRMED,
    });
    const neverLooked = readDeadlineState({
      closeDate: null, closeDateVerifiedAt: null, closeDateRaw: null,
      closeDateObservationOutcome: OBSERVATION_OUTCOME.CAPTURE_UNKNOWN,
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
      {}, { fetch: { status: 'success' }, parse: goodParse(), provenance: PROV, now: T0 },
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
