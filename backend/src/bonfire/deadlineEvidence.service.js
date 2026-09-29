/**
 * Deadline evidence: write rules and read model.
 *
 * WHAT THIS MODULE EXISTS TO PREVENT
 * ----------------------------------
 * A single close_date column conflated four different facts, and each conflation
 * produced a specific wrong answer:
 *
 *   effective vs observed   - a newer, unresolved observation overwrote a value
 *                             we had actually verified
 *   parsed vs authoritative - a string that parsed cleanly was published as the
 *                             deadline even when another source disagreed
 *   attempt vs observation  - a failed fetch advanced "last seen", making stale
 *                             data look fresh
 *   absent vs unobserved    - NULL raw text was read as "no deadline published"
 *
 * The confidence rule is resolved explicitly. The earlier proposal had ONE
 * close_date_confidence column described as "confidence of the effective value"
 * but written from the observation on every scrape, so an unresolved re-scrape
 * downgraded the confidence of a value it had not touched. That column is gone:
 *
 *   effective verification  = (close_date_verified_at IS NOT NULL)
 *   observation confidence  = close_date_observation_confidence
 *
 * They are different facts about different things and are never merged.
 *
 * LEGACY ROWS
 * Every pre-existing row has close_date_verified_at = NULL. Such a row is
 * UNVERIFIED even when close_date is set and close_date_uncertainty is NULL:
 * absence of a recorded parse failure is not evidence of verification. The read
 * model returns 'legacy_unverified' for exactly this case.
 */

const SOURCE_STATE = {
  NOT_OBSERVED: 'not_observed',
  FETCH_FAILED: 'fetch_failed',
  NOT_PUBLISHED: 'not_published',
  PUBLISHED_UNPARSED: 'published_unparsed',
  PUBLISHED_PARSED: 'published_parsed',
};

const EFFECTIVE_STATE = {
  VERIFIED: 'verified',
  LEGACY_UNVERIFIED: 'legacy_unverified',
  RETAINED_UNVERIFIED: 'retained_unverified',
  UNKNOWN: 'unknown',
  NOT_PUBLISHED: 'not_published',
};

/** Columns that only ever move together with a verification. */
const EFFECTIVE_COLUMNS = ['closeDate', 'closeDateVerifiedAt', 'closeDateVerifiedSource'];

function earliest(candidates) {
  const times = (candidates || []).map((c) => c && c.utc).filter(Boolean).sort();
  return times.length ? times[0] : null;
}

/**
 * Do the candidates disagree about the instant?
 * One candidate, or several that name the same instant, is not a conflict.
 */
function hasCompetingEvidence(candidates) {
  const distinct = new Set((candidates || []).map((c) => c && c.utc).filter(Boolean));
  return distinct.size > 1;
}

/**
 * Decide whether an observation may be PUBLISHED as the verified deadline.
 *
 * Parsing successfully is necessary but NOT sufficient: competing source
 * evidence has to be absent. This is the "parsed is not authoritative" rule.
 */
function isVerifiable({ sourceState, parse, candidates }) {
  if (sourceState !== SOURCE_STATE.PUBLISHED_PARSED) return false;
  if (!parse || !parse.utc) return false;
  if (parse.confidence !== 'high') return false;
  if (hasCompetingEvidence(candidates)) return false;
  return true;
}

/**
 * Classify what the source actually told us on a SUCCESSFUL fetch.
 * `rawPresent` must be supplied by the caller: only the caller knows whether the
 * source had a deadline field at all, as opposed to one we failed to capture.
 */
function classifySourceState({ fetchStatus, rawPresent, parse }) {
  if (fetchStatus === 'failed') return SOURCE_STATE.FETCH_FAILED;
  if (fetchStatus !== 'success') return SOURCE_STATE.NOT_OBSERVED;
  if (!rawPresent) return SOURCE_STATE.NOT_PUBLISHED;
  if (!parse || !parse.utc) return SOURCE_STATE.PUBLISHED_UNPARSED;
  return SOURCE_STATE.PUBLISHED_PARSED;
}

/**
 * Build the column patch for one ingestion event.
 *
 * Pure: takes the current row plus the event, returns the fields to write. The
 * caller applies it inside a transaction with the row locked, so repeated or
 * concurrent ingestion cannot interleave a read-modify-write on the
 * append-only superseded history.
 *
 * @param {object} current   current row values (camelCase attributes)
 * @param {object} event
 * @param {object} event.fetch        { attemptedAt, status:'success'|'failed', error }
 * @param {object} [event.parse]      deadlineParser result; omitted on a failed fetch
 * @param {boolean} [event.rawPresent] did the source carry a deadline field at all
 * @param {Array}  [event.candidates] competing candidate instants
 * @param {string} [event.source]     what produced this observation
 * @param {Date}   [event.now]
 * @returns {{patch: object, decision: object}}
 */
function buildObservationPatch(current, event) {
  const now = event.now || new Date();
  const fetch = event.fetch || {};
  const patch = {
    closeDateFetchAttemptedAt: fetch.attemptedAt || now,
    closeDateFetchStatus: fetch.status || 'failed',
    closeDateFetchError: fetch.error || null,
  };

  // A failed fetch is NOT an observation. Nothing about what the source says is
  // updated, and close_date_observed_at deliberately does not move: the gap
  // between it and fetch_attempted_at is the staleness signal.
  if (fetch.status !== 'success') {
    patch.closeDateSourceState = SOURCE_STATE.FETCH_FAILED;
    return {
      patch,
      decision: { verified: false, reason: 'fetch_failed', publishedDeadlineChanged: false },
    };
  }

  const parse = event.parse || null;
  const candidates = Array.isArray(event.candidates) && event.candidates.length
    ? event.candidates
    : (parse && Array.isArray(parse.candidates) ? parse.candidates : null);

  const sourceState = classifySourceState({
    fetchStatus: 'success',
    rawPresent: event.rawPresent !== undefined
      ? !!event.rawPresent
      : !!(parse && parse.originalText),
    parse,
  });

  // Observation fields: always refreshed on a successful fetch.
  Object.assign(patch, {
    closeDateObservedAt: now,
    closeDateSourceState: sourceState,
    closeDateRaw: parse ? parse.originalText : null,
    closeDateTimezone: parse ? parse.timezoneLabel : null,
    closeDateTimezoneSource: parse ? parse.timezoneSource : null,
    closeDateOffsetMinutes: parse ? parse.offsetMinutes : null,
    closeDateObservationUtc: parse ? parse.utc : null,
    closeDateObservationConfidence: parse ? parse.confidence : null,
    closeDateUncertainty: parse ? parse.uncertainty : null,
    closeDateCandidates: candidates && candidates.length ? candidates : null,
  });

  const verified = isVerifiable({ sourceState, parse, candidates });

  if (!verified) {
    // RETAIN, do not publish. close_date and close_date_verified_at are
    // untouched, so a previously verified value keeps its original verification
    // timestamp and cannot appear newly confirmed.
    patch.closeDateConservativeUtc = earliest(candidates)
      || (parse && parse.utc ? parse.utc : null);
    return {
      patch,
      decision: {
        verified: false,
        reason: hasCompetingEvidence(candidates) ? 'competing_evidence' : sourceState,
        publishedDeadlineChanged: false,
      },
    };
  }

  // VERIFIED. Publish, and append any displaced value to the append-only
  // history rather than losing it.
  const previous = current ? current.closeDate : null;
  const previousIso = previous ? new Date(previous).toISOString() : null;
  const changed = previousIso !== parse.utc;

  if (changed && previousIso) {
    const history = Array.isArray(current.closeDateSuperseded) ? current.closeDateSuperseded : [];
    patch.closeDateSuperseded = [
      ...history,
      {
        utc: previousIso,
        verifiedAt: current.closeDateVerifiedAt
          ? new Date(current.closeDateVerifiedAt).toISOString()
          : null,
        replacedAt: now.toISOString(),
        reason: 'superseded_by_verified_observation',
      },
    ];
  }

  Object.assign(patch, {
    closeDate: parse.utc,
    closeDateVerifiedAt: now,
    closeDateVerifiedSource: event.source || 'unknown',
    closeDateConservativeUtc: null,
    closeDateCandidates: null,
  });

  return {
    patch,
    decision: { verified: true, reason: 'verified', publishedDeadlineChanged: changed },
  };
}

/**
 * Apply an observation atomically.
 *
 * The row is locked FOR UPDATE inside the transaction because the superseded
 * history is read-modify-write: two concurrent ingestions of the same
 * opportunity would otherwise each read the same history and one would
 * overwrite the other's appended entry.
 */
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
 * Derive the EFFECTIVE deadline state for reads.
 *
 * The central rule: a stored close_date with NULL verified_at is UNVERIFIED,
 * even when uncertainty is NULL. Every legacy row is in exactly that position,
 * and reporting them as verified would launder the timezone-stripping parser's
 * output into apparent evidence.
 */
function readDeadlineState(row) {
  const r = row || {};
  const hasDeadline = r.closeDate != null;
  const verifiedAt = r.closeDateVerifiedAt || null;

  if (hasDeadline && verifiedAt) {
    // Verified — but a newer unresolved observation still makes it stale.
    const supersededByObservation = !!r.closeDateUncertainty
      || (r.closeDateObservationUtc
        && new Date(r.closeDateObservationUtc).toISOString() !== new Date(r.closeDate).toISOString());
    return {
      state: supersededByObservation ? EFFECTIVE_STATE.RETAINED_UNVERIFIED : EFFECTIVE_STATE.VERIFIED,
      utc: supersededByObservation ? null : new Date(r.closeDate).toISOString(),
      retainedUtc: supersededByObservation ? new Date(r.closeDate).toISOString() : null,
      verifiedAt: new Date(verifiedAt).toISOString(),
      isVerified: !supersededByObservation,
    };
  }

  if (hasDeadline && !verifiedAt) {
    // Legacy: a value exists but nothing ever verified it.
    return {
      state: EFFECTIVE_STATE.LEGACY_UNVERIFIED,
      utc: null,
      retainedUtc: new Date(r.closeDate).toISOString(),
      verifiedAt: null,
      isVerified: false,
    };
  }

  if (r.closeDateSourceState === SOURCE_STATE.NOT_PUBLISHED) {
    return {
      state: EFFECTIVE_STATE.NOT_PUBLISHED, utc: null, retainedUtc: null, verifiedAt: null, isVerified: false,
    };
  }

  return {
    state: EFFECTIVE_STATE.UNKNOWN, utc: null, retainedUtc: null, verifiedAt: null, isVerified: false,
  };
}

module.exports = {
  SOURCE_STATE,
  EFFECTIVE_STATE,
  EFFECTIVE_COLUMNS,
  classifySourceState,
  hasCompetingEvidence,
  isVerifiable,
  buildObservationPatch,
  applyObservation,
  readDeadlineState,
  earliest,
};
