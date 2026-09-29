/**
 * Maps persisted source evidence onto the frozen gov-opportunity.v1 contract.
 *
 * contracts/gov-opportunity.v1/schema.json
 * sha256 d2a100c810244221c01b5550c43e78731509d72ec444e7055b01d989d94d37c8
 *
 * THE CONTRACT IS FROZEN. Where our internal model is richer, we map DOWN to a
 * faithful v1 value and keep the detail OUTSIDE the contract object (the API
 * envelope carries a `diagnostics` sibling). We never widen v1 in place, and we
 * never emit a field v1 does not define — the schema sets
 * additionalProperties:false throughout, so a silent extension would fail
 * validation rather than leak, which is the intended safety property.
 */

const crypto = require('crypto');
const { readDeadlineState, SOURCE_STATE, EFFECTIVE_STATE } = require('../bonfire/deadlineEvidence.service');

/**
 * Internal parser reasons -> the frozen v1 `uncertaintyReason` enum.
 *
 * v1 permits: missing_timezone | ambiguous_timezone | dst_ambiguous |
 *             unparseable | conflicting_sources | null
 *
 * Four internal reasons have no v1 member. Each maps to the closest TRUE
 * category rather than to null, because null means "no uncertainty" and would
 * misrepresent a failed parse as a clean one:
 *
 *   invalid_time          -> unparseable        the string cannot yield an instant
 *   invalid_offset        -> unparseable        likewise
 *   unsupported_precision -> unparseable        we refuse rather than move the instant
 *   dst_nonexistent       -> ambiguous_timezone v1 defines this as "zone token
 *                                               present but not resolvable to one
 *                                               offset"; a skipped local hour
 *                                               resolves to ZERO offsets, which
 *                                               satisfies that definition as
 *                                               squarely as the two-offset case
 *
 * The precise reason is retained and surfaced in the envelope's diagnostics.
 * See PROPOSED_CONTRACT_CHANGES below for the coordinated v1.1 we would rather
 * have than this lossy mapping.
 */
const UNCERTAINTY_TO_V1 = {
  missing_timezone: 'missing_timezone',
  ambiguous_timezone: 'ambiguous_timezone',
  dst_ambiguous: 'dst_ambiguous',
  conflicting_sources: 'conflicting_sources',
  unparseable: 'unparseable',
  invalid_time: 'unparseable',
  invalid_offset: 'unparseable',
  unsupported_precision: 'unparseable',
  dst_nonexistent: 'ambiguous_timezone',
};

/**
 * Additive, backward-compatible enum extensions we propose for v1.1. Returned
 * by the API's contract endpoint so the coordinator can act on it; NOT applied
 * to the frozen schema here.
 */
const PROPOSED_CONTRACT_CHANGES = [
  {
    id: 'v1.1-uncertainty-reasons',
    field: 'deadline.uncertaintyReason',
    change: 'additive enum extension',
    add: ['invalid_time', 'invalid_offset', 'unsupported_precision', 'dst_nonexistent'],
    rationale:
      'Four internal parser outcomes currently collapse into unparseable / ambiguous_timezone. '
      + 'The mapping is truthful but lossy: a consumer cannot distinguish "the portal printed an '
      + 'impossible offset" from "the text was not a date at all", which are different remediations.',
    compatibility: 'Additive to an enum. Existing consumers that switch on known members are unaffected.',
  },
  {
    id: 'v1.1-effective-state',
    field: 'deadline.effectiveState',
    change: 'new optional field',
    add: ['verified', 'legacy_unverified', 'retained_unverified', 'unknown', 'not_published'],
    rationale:
      'v1 can say "no verified deadline" (utc null) but cannot say WHY: a legacy row that was '
      + 'never verified, a value retained because a newer observation was unresolved, and a buyer '
      + 'who published no deadline are three different facts. Today the distinction is carried '
      + 'outside the contract, in the envelope diagnostics and the deadlineState query buckets, '
      + 'because inventing a conflicts[] entry for a single unverified value would assert '
      + 'competing evidence that does not exist.',
    compatibility: 'Optional field; absent for consumers that ignore it.',
  },
];

const iso = (d) => (d ? new Date(d).toISOString() : null);
const hex32 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

/** Opaque, stable canonical id. Never derived from title or solicitation number. */
const canonicalIdFor = (canonicalUuid) => `op:gov:${hex32(canonicalUuid)}`;
const familyIdFor = (familyUuid) => `opfam:${hex32(familyUuid)}`;

/**
 * Internal candidate rows -> v1's exact conflict shape.
 *
 * v1 requires originalText, utc, source, observedAt on every entry and forbids
 * anything else. Internal JSONB carries extra keys (offsetMinutes, etc.), so we
 * project rather than forward it blindly — passing it through would fail
 * additionalProperties and, worse, would ship whatever shape the writer happened
 * to store.
 */
function toV1Conflicts(candidates, { fallbackSource, fallbackObservedAt }) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .filter((c) => c && (c.utc || c.originalText))
    .map((c) => ({
      originalText: c.originalText != null ? String(c.originalText) : '(source text not captured)',
      utc: c.utc ? iso(c.utc) : null,
      source: c.source != null ? String(c.source) : (fallbackSource || 'unknown'),
      observedAt: iso(c.observedAt || fallbackObservedAt) || new Date(0).toISOString(),
      supersedes: c.supersedes === undefined ? null : c.supersedes,
      note: c.note != null ? String(c.note) : null,
    }));
}

/**
 * Build the v1 `deadline` block from persisted evidence.
 *
 * The load-bearing decisions:
 *   - `utc` is populated ONLY for a genuinely verified deadline.
 *   - A legacy-unverified or retained value is NOT published and is NOT turned
 *     into a fabricated conflict. It is reported through the envelope's
 *     diagnostics, and the record stays addressable via the deadlineState
 *     buckets on the list endpoint.
 *   - conservativePlanningUtc is only ever the earliest candidate, never copied
 *     into utc.
 */
function buildDeadline(row) {
  const state = readDeadlineState(row);

  // conflicts[] carries ONLY instants the source actually produced. A single
  // unverified stored value is not a conflict, and inventing a second "source"
  // for it would manufacture disagreement that never existed. The retained
  // value is reported through diagnostics instead — see
  // PROPOSED_CONTRACT_CHANGES.v1.1-effective-state for the faithful fix.
  const conflicts = toV1Conflicts(row.closeDateCandidates, {
    fallbackSource: 'opportunity-pulse observation',
    fallbackObservedAt: row.closeDateObservedAt,
  });

  const internalReason = row.closeDateUncertainty || null;
  // null stays null: v1's null means "no recorded uncertainty", which is the
  // truth for a legacy row. Reaching for conflicting_sources here would assert
  // competing evidence we do not have.
  const v1Reason = internalReason ? (UNCERTAINTY_TO_V1[internalReason] || 'unparseable') : null;

  return {
    originalText: row.closeDateRaw != null ? String(row.closeDateRaw) : null,
    wallClock: null,
    statedTimezone: row.closeDateTimezone != null ? String(row.closeDateTimezone) : null,
    resolvedZone: null,
    offsetMinutes: row.closeDateOffsetMinutes != null ? Number(row.closeDateOffsetMinutes) : null,
    timezoneSource: row.closeDateTimezoneSource || 'absent',
    utc: state.isVerified ? state.utc : null,
    utcConfidence: state.isVerified ? 'high' : 'unknown',
    uncertaintyReason: v1Reason,
    verifiedAt: state.verifiedAt,
    conservativePlanningUtc: iso(row.closeDateConservativeUtc),
    conflicts,
  };
}

/** Documents: never manufacture reviewed requirements from a title. */
function buildDocuments(row) {
  const fetched = row.attachmentsFetchedAt != null;
  return {
    coverage: fetched ? 'partial' : 'inaccessible',
    accessBarrier: fetched ? null : 'bot_protection',
    counts: {
      listed: 0, downloaded: 0, parsed: 0, inaccessible: 0,
    },
    items: [],
    amendments: [],
  };
}

/**
 * Map one persisted opportunity (+ identity) to a gov-opportunity.v1 object.
 * Returns { envelope, diagnostics } — diagnostics is OUR detail and is never
 * placed inside the contract object.
 */
function toGovOpportunityV1(row, identity = {}) {
  // Prefer the PERSISTED public id. Deriving from identity.canonicalId (the
  // internal UUID) would produce a different hash from the one ingestion stored
  // — which is exactly how an id handed out by list failed to resolve through
  // detail. The derivation from row.id is the pre-ingestion fallback and is
  // equal by construction to what the writer persists.
  const publicId = identity.canonicalPublicId || canonicalIdFor(row.id);
  const deadline = buildDeadline(row);
  const state = readDeadlineState(row);

  // Classification is title-derived unless documents were actually read. Saying
  // otherwise would manufacture evidence, which is the failure this whole
  // contract exists to prevent.
  const documentsReviewed = row.attachmentsFetchedAt != null;

  const envelope = {
    schemaVersion: 'gov-opportunity.v1',
    sourceSnapshotVersion: identity.sourceSnapshotVersion || 1,
    canonicalOpportunityId: publicId,
    sourceSystem: 'opportunity-pulse',
    sourceRecordId: String(row.externalId || row.id),
    sourceAliases: (identity.aliases || []).map((a) => ({
      idType: a.idType || a.id_type,
      idValue: String(a.idValue || a.id_value),
      observedAt: iso(a.observedAt || a.observed_at) || new Date(0).toISOString(),
      note: a.note || null,
    })),
    solicitationFamily: identity.family
      ? {
        familyId: familyIdFor(identity.family.familyId || identity.family.family_id),
        solicitationNumber: identity.family.solicitationNumber || identity.family.solicitation_number || null,
        linkBasis: identity.family.linkBasis || identity.family.link_basis,
        confidence: identity.family.confidence,
        memberSourceRecordIds: identity.family.memberSourceRecordIds || [],
      }
      : null,
    publisher: {
      isCourtesyPosting: false,
      postingSource: {
        name: row.agency ? String(row.agency) : 'unknown',
        portal: 'bonfire',
        url: row.sourceUrl ? String(row.sourceUrl) : null,
      },
      leadBuyer: {
        name: row.agency ? String(row.agency) : 'unknown',
        office: null,
        requirementOwner: null,
        jurisdiction: 'unknown',
      },
      officialSourceUrl: row.sourceUrl ? String(row.sourceUrl) : null,
      submissionPortal: null,
    },
    notice: {
      title: row.title ? String(row.title) : null,
      noticeType: {
        value: 'unknown', // Bonfire publishes no notice type; saying otherwise would be invention.
        raw: null,
        isResponseInvited: state.isVerified,
        isBindingSolicitation: false,
        evidenceRef: null,
      },
      procurementType: {
        value: 'unknown',
        basis: documentsReviewed ? 'document' : 'title',
        evidenceRef: null,
      },
      contractVehicle: {
        value: 'unknown', programName: null, obligationsSummary: null, evidenceRef: null,
      },
      selectableLots: null,
    },
    deadline,
    value: {
      published: null, // Bonfire publishes no buyer figure.
      modelEstimate: row.estimatedValue != null
        ? {
          amountMinorUnits: Number(row.estimatedValue),
          currency: 'USD',
          method: 'llm-title-inference-v1',
          generatedAt: iso(row.enrichedAt),
          notForRevenuePlanning: true,
        }
        : null,
    },
    documents: buildDocuments(row),
    requirements: [], // never synthesised from a title
    timestamps: {
      sourceObservedAt: iso(row.closeDateObservedAt),
      fetchedAt: iso(row.closeDateFetchAttemptedAt),
      enrichedAt: iso(row.enrichedAt),
      documentReviewedAt: iso(row.attachmentsFetchedAt),
      lastVerifiedAtSource: iso(row.closeDateVerifiedAt),
    },
    sourceAssessment: {
      serviceCategories: row.aiCategory ? [String(row.aiCategory)] : [],
      relevanceBasis: documentsReviewed ? 'document' : 'title',
      assessedBy: 'opportunity-pulse/enrichment',
      method: 'llm-title-inference-v1',
      evidenceRefs: [],
      isNotEligibilityDetermination: true,
      legacyVerdict: row.vetVerdict
        ? {
          status: row.vetVerdict.status || null,
          disqualifier: row.vetVerdict.disqualifier || null,
          label: row.vetVerdict.label || null,
          method: row.vetVerdict.auto === false ? 'title_regex' : 'auto_signal',
          evidence: row.vetVerdict.evidence || null,
          vettedAt: iso(row.vetVerdict.vetted_at),
          scope: 'this_notice',
        }
        : null,
    },
    legacy: {
      fitScore: row.fitScore != null ? Number(row.fitScore) : null,
      priorityScore: row.priorityScore != null ? Number(row.priorityScore) : null,
      enrichmentVersion: row.enrichmentVersion != null ? Number(row.enrichmentVersion) : null,
      enrichmentHash: row.enrichmentHash || null,
      pursuitStatus: row.pursuitStatus || null,
      pursuitStatusChangedAt: iso(row.pursuedAt),
      deprecation: {
        status: 'advisory_only',
        guidance: 'Title-derived. Not an eligibility signal; do not rank on it.',
        earliestRemovalVersion: null,
      },
    },
    sourceAvailability: row.closeDateFetchStatus === 'failed'
      ? {
        status: 'degraded',
        since: iso(row.closeDateFetchAttemptedAt),
        reason: row.closeDateFetchError ? String(row.closeDateFetchError) : 'fetch failed',
        servingLastKnownSnapshot: true,
      }
      : null,
    companyQualification: null,
  };

  const diagnostics = {
    canonicalOpportunityId: envelope.canonicalOpportunityId,
    effectiveState: state.state,
    internalUncertaintyReason: row.closeDateUncertainty || null,
    mappedV1UncertaintyReason: deadline.uncertaintyReason,
    sourceState: row.closeDateSourceState || SOURCE_STATE.NOT_OBSERVED,
    observationUtc: iso(row.closeDateObservationUtc),
    retainedUnverifiedUtc: state.retainedUtc,
    // Why the stored verification is no longer current (conflict, capture_unknown,
    // unparsed, absent_confirmed). Null when it IS current or was never verified.
    supersededBy: state.supersededBy || null,
    observationOutcome: row.closeDateObservationOutcome || null,
    verificationBasis: row.closeDateVerificationBasis || null,
    fetchStatus: row.closeDateFetchStatus || null,
  };

  return { envelope, diagnostics };
}

module.exports = {
  toGovOpportunityV1,
  buildDeadline,
  toV1Conflicts,
  UNCERTAINTY_TO_V1,
  PROPOSED_CONTRACT_CHANGES,
  canonicalIdFor,
  familyIdFor,
};
