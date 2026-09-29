/**
 * Deadline evidence: write rules and read model.
 *
 * TWO DEFECTS THIS REWRITE FIXES (both reproduced against c0d942ed)
 * ----------------------------------------------------------------
 * A. An existing verified deadline, plus a new HIGH-confidence parse whose
 *    instant equalled the stored one, but whose candidate set also contained a
 *    different instant. The write correctly refused to publish
 *    (verified=false, competing_evidence) — but persisted nothing saying so:
 *    `uncertainty` stayed null because the parse itself was clean, and
 *    observation_utc equalled close_date. The read model's heuristic therefore
 *    saw no disagreement and reported state=verified. An unresolved conflict
 *    must prevent publication, not merely decline to change the value.
 *
 * B. An existing verified deadline plus {fetch:{status:'success'}} with no
 *    parse and no rawPresent. `rawPresent` defaulted to false, which classified
 *    the source as `not_published` — treating MISSING CAPTURE as evidence that
 *    the buyer published no deadline — and the read still said verified.
 *
 * Both had the same root cause: state was INFERRED from a heuristic comparison
 * of fields, rather than RECORDED. The fix is structural.
 *
 * WHAT CHANGED
 *   1. Every successful observation records an EXPLICIT outcome. Absence is
 *      only ever `absent_confirmed`, and only when the caller asserts it.
 *      Anything we did not capture is `capture_unknown`, which is not evidence
 *      of anything.
 *   2. Verification additionally requires recorded PROVENANCE and an explicit
 *      BASIS. Parsing cleanly and nobody happening to pass competing candidates
 *      does not establish source authority.
 *   3. The read model no longer guesses. A stored verification is current only
 *      while no NEWER observation has landed:
 *
 *        isVerified = verified_at IS NOT NULL
 *                     AND (observed_at IS NULL OR observed_at <= verified_at)
 *
 *      A verifying write sets both to the same instant, so they stay equal. Any
 *      later observation — conflict, unparsed, unknown capture, confirmed
 *      absence — pushes observed_at past verified_at and the value becomes
 *      RETAINED, not verified. This single rule closes both A and B, and the
 *      SQL buckets use the identical predicate so query and mapper agree.
 */

/** What the source actually told us on one observation. Recorded, never guessed. */
const OBSERVATION_OUTCOME = {
  PARSED: 'parsed', // deadline text present and parsed to an instant
  CONFLICT: 'conflict', // competing candidate instants
  UNPARSED: 'unparsed', // text present, no instant derivable
  ABSENT_CONFIRMED: 'absent_confirmed', // source affirmatively published no deadline
  CAPTURE_UNKNOWN: 'capture_unknown', // we did not capture it; proves nothing
  FETCH_FAILED: 'fetch_failed', // not an observation at all
};

const SOURCE_STATE = {
  NOT_OBSERVED: 'not_observed',
  FETCH_FAILED: 'fetch_failed',
  NOT_PUBLISHED: 'not_published',
  CAPTURE_UNKNOWN: 'capture_unknown',
  PUBLISHED_UNPARSED: 'published_unparsed',
  PUBLISHED_PARSED: 'published_parsed',
  PUBLISHED_CONFLICTED: 'published_conflicted',
};

const EFFECTIVE_STATE = {
  VERIFIED: 'verified',
  LEGACY_UNVERIFIED: 'legacy_unverified',
  RETAINED_UNVERIFIED: 'retained_unverified',
  UNKNOWN: 'unknown',
  NOT_PUBLISHED: 'not_published',
};

const OUTCOME_TO_SOURCE_STATE = {
  [OBSERVATION_OUTCOME.PARSED]: SOURCE_STATE.PUBLISHED_PARSED,
  [OBSERVATION_OUTCOME.CONFLICT]: SOURCE_STATE.PUBLISHED_CONFLICTED,
  [OBSERVATION_OUTCOME.UNPARSED]: SOURCE_STATE.PUBLISHED_UNPARSED,
  [OBSERVATION_OUTCOME.ABSENT_CONFIRMED]: SOURCE_STATE.NOT_PUBLISHED,
  [OBSERVATION_OUTCOME.CAPTURE_UNKNOWN]: SOURCE_STATE.CAPTURE_UNKNOWN,
  [OBSERVATION_OUTCOME.FETCH_FAILED]: SOURCE_STATE.FETCH_FAILED,
};

function earliest(candidates) {
  const times = (candidates || []).map((c) => c && c.utc).filter(Boolean).sort();
  return times.length ? times[0] : null;
}

/** Distinct candidate instants means the source evidence disagrees with itself. */
function hasCompetingEvidence(candidates) {
  const distinct = new Set((candidates || []).map((c) => c && c.utc).filter(Boolean));
  return distinct.size > 1;
}

/**
 * Classify one successful observation.
 *
 * `absentConfirmed` must be asserted by the caller. Defaulting absence from a
 * falsy raw value is defect B: it converts "we did not capture it" into "the
 * buyer published nothing", which are opposite claims about the source.
 */
function classifyObservation({ fetchStatus, absentConfirmed, rawPresent, parse, candidates }) {
  if (fetchStatus === 'failed') return OBSERVATION_OUTCOME.FETCH_FAILED;
  if (fetchStatus !== 'success') return OBSERVATION_OUTCOME.CAPTURE_UNKNOWN;
  if (absentConfirmed === true) return OBSERVATION_OUTCOME.ABSENT_CONFIRMED;
  if (hasCompetingEvidence(candidates)) return OBSERVATION_OUTCOME.CONFLICT;
  const haveText = rawPresent === true || !!(parse && parse.originalText);
  if (!haveText) return OBSERVATION_OUTCOME.CAPTURE_UNKNOWN;
  if (!parse || !parse.utc) return OBSERVATION_OUTCOME.UNPARSED;
  return OBSERVATION_OUTCOME.PARSED;
}

/**
 * May this observation be PUBLISHED as the verified deadline?
 *
 * Parsing is necessary but nowhere near sufficient. Recorded provenance and an
 * explicit basis are required, because "nobody passed competing candidates" is
 * the absence of contrary evidence, not the presence of authority.
 */
function isVerifiable({ outcome, parse, provenance }) {
  if (outcome !== OBSERVATION_OUTCOME.PARSED) return false;
  if (!parse || !parse.utc || parse.confidence !== 'high') return false;
  if (!provenance || !provenance.source) return false;
  if (!provenance.basis) return false;
  return true;
}

/**
 * Build the column patch for one ingestion event.
 *
 * Pure. The caller applies it inside a transaction with the row locked, because
 * the superseded history is read-modify-write.
 *
 * @param {object} current current row (camelCase attributes)
 * @param {object} event
 * @param {object} event.fetch        { attemptedAt, status:'success'|'failed', error }
 * @param {object} [event.parse]      deadlineParser result
 * @param {boolean} [event.rawPresent]       did the source carry deadline text
 * @param {boolean} [event.absentConfirmed]  did the source AFFIRM no deadline
 * @param {Array}  [event.candidates] competing candidate instants
 * @param {object} [event.provenance] { source, basis, sourceRef } — required to verify
 * @param {Date}   [event.now]
 */
function buildObservationPatch(current, event) {
  const now = event.now || new Date();
  const fetch = event.fetch || {};
  const patch = {
    closeDateFetchAttemptedAt: fetch.attemptedAt || now,
    closeDateFetchStatus: fetch.status || 'failed',
    closeDateFetchError: fetch.error || null,
  };

  // A failed fetch is not an observation. observed_at deliberately does not
  // move, so the gap against fetch_attempted_at is the staleness signal, and
  // any existing verification stays current rather than being invalidated by
  // our own inability to reach the source.
  if (fetch.status !== 'success') {
    patch.closeDateSourceState = SOURCE_STATE.FETCH_FAILED;
    patch.closeDateObservationOutcome = OBSERVATION_OUTCOME.FETCH_FAILED;
    return { patch, decision: { verified: false, outcome: OBSERVATION_OUTCOME.FETCH_FAILED, reason: 'fetch_failed', publishedDeadlineChanged: false } };
  }

  const parse = event.parse || null;
  const candidates = Array.isArray(event.candidates) && event.candidates.length
    ? event.candidates
    : (parse && Array.isArray(parse.candidates) && parse.candidates.length ? parse.candidates : null);

  const outcome = classifyObservation({
    fetchStatus: 'success',
    absentConfirmed: event.absentConfirmed,
    rawPresent: event.rawPresent,
    parse,
    candidates,
  });

  Object.assign(patch, {
    closeDateObservedAt: now,
    closeDateObservationOutcome: outcome,
    closeDateSourceState: OUTCOME_TO_SOURCE_STATE[outcome],
    closeDateRaw: parse ? parse.originalText : null,
    closeDateTimezone: parse ? parse.timezoneLabel : null,
    closeDateTimezoneSource: parse ? parse.timezoneSource : null,
    closeDateOffsetMinutes: parse ? parse.offsetMinutes : null,
    closeDateObservationUtc: parse ? parse.utc : null,
    closeDateObservationConfidence: parse ? parse.confidence : null,
    closeDateUncertainty: parse ? parse.uncertainty : null,
    closeDateCandidates: candidates && candidates.length ? candidates : null,
  });

  // Defect A: a conflict must be durable. The parse alone may be clean, so the
  // parse's own uncertainty is null — record the conflict explicitly instead.
  if (outcome === OBSERVATION_OUTCOME.CONFLICT) {
    patch.closeDateUncertainty = 'conflicting_sources';
  }

  const provenance = event.provenance || null;
  const verified = isVerifiable({ outcome, parse, provenance });

  if (!verified) {
    // RETAIN, do not publish. close_date and close_date_verified_at are left
    // alone; because observed_at has moved past verified_at, the read model
    // reports the retained value as unverified.
    patch.closeDateConservativeUtc = earliest(candidates)
      || (parse && parse.utc ? parse.utc : null);
    return {
      patch,
      decision: {
        verified: false,
        outcome,
        reason: outcome === OBSERVATION_OUTCOME.PARSED ? 'missing_provenance_or_basis' : outcome,
        publishedDeadlineChanged: false,
      },
    };
  }

  const previous = current ? current.closeDate : null;
  const previousIso = previous ? new Date(previous).toISOString() : null;
  const changed = previousIso !== parse.utc;

  if (changed && previousIso) {
    const history = Array.isArray(current.closeDateSuperseded) ? current.closeDateSuperseded : [];
    patch.closeDateSuperseded = [...history, {
      utc: previousIso,
      verifiedAt: current.closeDateVerifiedAt ? new Date(current.closeDateVerifiedAt).toISOString() : null,
      replacedAt: now.toISOString(),
      reason: 'superseded_by_verified_observation',
    }];
  }

  Object.assign(patch, {
    closeDate: parse.utc,
    // Same instant as observed_at, so the read predicate
    // (observed_at <= verified_at) holds until a NEWER observation arrives.
    closeDateVerifiedAt: now,
    closeDateVerifiedSource: provenance.source,
    closeDateVerificationBasis: provenance.basis,
    closeDateConservativeUtc: null,
    closeDateCandidates: null,
  });

  return { patch, decision: { verified: true, outcome, reason: 'verified', publishedDeadlineChanged: changed } };
}

async function applyObservation(Model, opportunityId, event, { sequelize }) {
  return sequelize.transaction(async (transaction) => {
    const row = await Model.findByPk(opportunityId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) return { applied: false, reason: 'not_found' };
    const { patch, decision } = buildObservationPatch(row.get ? row.get({ plain: true }) : row, event);
    await row.update(patch, { transaction });
    return { applied: true, decision, patch };
  });
}

/**
 * THE single definition of effective state. The SQL buckets in
 * govOpportunityV2.service implement the identical predicate; a divergence
 * between them is a bug, and a test asserts they agree.
 */
function isVerificationCurrent(row) {
  const r = row || {};
  if (!r.closeDateVerifiedAt) return false;
  if (!r.closeDateObservedAt) return true; // verified, never re-observed
  return new Date(r.closeDateObservedAt).getTime() <= new Date(r.closeDateVerifiedAt).getTime();
}

function readDeadlineState(row) {
  const r = row || {};
  const hasDeadline = r.closeDate != null;
  const verifiedAt = r.closeDateVerifiedAt || null;
  const current = isVerificationCurrent(r);

  if (hasDeadline && verifiedAt && current) {
    return {
      state: EFFECTIVE_STATE.VERIFIED,
      utc: new Date(r.closeDate).toISOString(),
      retainedUtc: null,
      verifiedAt: new Date(verifiedAt).toISOString(),
      isVerified: true,
      supersededBy: null,
    };
  }

  if (hasDeadline && verifiedAt && !current) {
    // A newer observation landed and did not verify. The value is retained and
    // explicitly NOT published; verifiedAt still reports the original
    // verification, never "now".
    return {
      state: EFFECTIVE_STATE.RETAINED_UNVERIFIED,
      utc: null,
      retainedUtc: new Date(r.closeDate).toISOString(),
      verifiedAt: new Date(verifiedAt).toISOString(),
      isVerified: false,
      supersededBy: r.closeDateObservationOutcome || null,
    };
  }

  if (hasDeadline && !verifiedAt) {
    return {
      state: EFFECTIVE_STATE.LEGACY_UNVERIFIED,
      utc: null,
      retainedUtc: new Date(r.closeDate).toISOString(),
      verifiedAt: null,
      isVerified: false,
      supersededBy: null,
    };
  }

  // Only an AFFIRMED absence counts as "the buyer published no deadline".
  if (r.closeDateObservationOutcome === OBSERVATION_OUTCOME.ABSENT_CONFIRMED) {
    return {
      state: EFFECTIVE_STATE.NOT_PUBLISHED, utc: null, retainedUtc: null, verifiedAt: null, isVerified: false, supersededBy: null,
    };
  }

  return {
    state: EFFECTIVE_STATE.UNKNOWN, utc: null, retainedUtc: null, verifiedAt: null, isVerified: false, supersededBy: r.closeDateObservationOutcome || null,
  };
}

module.exports = {
  OBSERVATION_OUTCOME,
  SOURCE_STATE,
  EFFECTIVE_STATE,
  OUTCOME_TO_SOURCE_STATE,
  classifyObservation,
  hasCompetingEvidence,
  isVerifiable,
  isVerificationCurrent,
  buildObservationPatch,
  applyObservation,
  readDeadlineState,
  earliest,
};
