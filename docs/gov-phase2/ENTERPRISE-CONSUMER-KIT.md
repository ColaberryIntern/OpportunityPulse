# Enterprise consumer kit — `/api/v2/gov-opportunities`

For the Enterprise Accelerator team integrating the government-opportunity read API.

**Status: not yet deployed.** Everything here is implemented and tested on
`feat/gov-phase2-persistence-and-v2-api`. Wire against this specification now; the endpoints answer
once Phase 2 is merged and activated. No credential for this scope exists yet.

Base URL (same host as the v1 Bonfire integration you already consume): `http://172.17.0.1:8091`

---

## 1. Auth

```
Authorization: Bearer <api-key>
```

Accepted by `verifyTokenOrApiKey`: an API key **or** a user JWT. The key must carry the scope
**`read:gov_opportunities`**.

- Your existing `read:bonfire_source` key does **not** grant this. It will not be widened; a separate
  key will be issued.
- A key without the scope gets **403**, not 404 — you can distinguish "not entitled" from "no such
  record".
- `requireScope` does not accept a role as a scope substitute. Admin JWTs are permitted explicitly and
  only on these read routes.
- v1 routes are unchanged. Nothing in this kit alters `/api/v1/bonfire/*` semantics.

## 2. Pinned schema

| | |
|---|---|
| Version | `gov-opportunity.v1` |
| Path | `contracts/gov-opportunity.v1/schema.json` |
| Git blob | `23c85c08d0c59c89b2c7095956fe134d203ef549` |
| **sha256 (authoritative, LF committed blob)** | `26ff667ed6d669d35fc89dc13886042f23620b1b9cf97b0fc90f1597d6cdd6bb` |
| sha256 (CRLF working copy — informational) | `d2a100c810244221c01b5550c43e78731509d72ec444e7055b01d989d94d37c8` |

Verify with `git cat-file blob <ref>:contracts/gov-opportunity.v1/schema.json | sha256sum` — hash the
**blob**, not a checked-out file, or a CRLF checkout will look like a different schema version. The two
hashes above are the same bytes with different line endings; there is no second version.

JSON Schema **2020-12**. Validate with `ajv/dist/2020` + `ajv-formats`. Every field is
`additionalProperties: false`, so anything Opportunity Pulse needs to tell you that v1 does not define
arrives in a **`diagnostics` sibling outside the contract object** — never inside it.

`GET /contract` (unauthenticated) returns this metadata live, plus the supported parameter lists, the
`deadlineState` bucket names, and two *proposed* additive v1.1 changes that are deliberately not edited
into the shared schema.

## 3. Requests and sanitized responses

### 3.1 List

```
GET /api/v2/gov-opportunities?deadlineState=verified&limit=25
Authorization: Bearer <api-key>
```

| Parameter | Values |
|---|---|
| `limit` | 1–100, default 25 |
| `cursor` | opaque, from `meta.nextCursor`. Cursor paging, because offset paging skips or repeats rows while a scrape inserts underneath the reader |
| `deadlineState` | `verified`, `legacy_unverified`, `retained_unverified`, `unverified`, `unknown`, `not_published`, `all`. **Default `all`** |
| `agency` | substring match |
| `updatedSince` | ISO-8601 |

An unsupported parameter is a **400**, not a silent ignore. An unknown bucket is a 400.

```json
{ "status": "success", "message": "Success", "code": 200,
  "data": [ { "...": "one gov-opportunity.v1 object per row" } ],
  "diagnostics": [ { "canonicalOpportunityId": "op:gov:04e9…", "effectiveState": "verified",
                     "internalUncertaintyReason": null, "sourceState": "published_parsed",
                     "observationOutcome": "parsed", "fetchStatus": "success" } ],
  "meta": { "schemaVersion": "gov-opportunity.v1", "limit": 25, "nextCursor": "…", "generatedAt": "…",
            "sourceAvailability": { "...": "corpus-wide; see §5" } } }
```

`diagnostics` is index-aligned with `data`.

### 3.2 Detail

```
GET /api/v2/gov-opportunities/op:gov:04e92dfec7a6939d7b2f65a2c267abb8
Authorization: Bearer <api-key>
```

Response — **real mapper output, validated against the pinned schema**, values sanitized:

```json
{
  "status": "success", "message": "Success", "code": 200,
  "data": {
    "schemaVersion": "gov-opportunity.v1",
    "sourceSnapshotVersion": 1,
    "canonicalOpportunityId": "op:gov:04e92dfec7a6939d7b2f65a2c267abb8",
    "sourceSystem": "opportunity-pulse",
    "sourceRecordId": "bonfire:agency:utah:RFP-24-200",
    "sourceAliases": [
      { "idType": "legacy_row_id", "idValue": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "observedAt": "2026-09-29T18:00:00.000Z", "note": "Primary alias minted at first ingestion." },
      { "idType": "portal_url", "idValue": "https://utah.bonfirehub.com/opportunities/98765",
        "observedAt": "2026-09-29T18:00:00.000Z", "note": "Portal URL observed during scrape." }
    ],
    "solicitationFamily": null,
    "publisher": { "...": "agency / portal identification" },
    "notice": { "...": "title, type, binding status" },
    "deadline": {
      "originalText": "Oct 15th 2026, 2:00 PM MDT",
      "wallClock": null,
      "statedTimezone": "MDT", "resolvedZone": null, "offsetMinutes": -360,
      "timezoneSource": "abbreviation",
      "utc": "2026-10-15T20:00:00.000Z", "utcConfidence": "high",
      "uncertaintyReason": null,
      "verifiedAt": "2026-09-29T18:00:00.000Z",
      "conservativePlanningUtc": null,
      "conflicts": []
    },
    "value": { "...": "published vs estimated, never merged" },
    "documents": { "coverage": "inaccessible", "accessBarrier": "bot_protection",
                   "counts": { "listed": 0, "downloaded": 0, "parsed": 0, "inaccessible": 0 },
                   "items": [], "amendments": [] },
    "requirements": [],
    "timestamps": { "...": "first seen / last observed" },
    "sourceAssessment": { "serviceCategories": ["analytics"], "relevanceBasis": "title",
                          "assessedBy": "opportunity-pulse/enrichment",
                          "method": "llm-title-inference-v1", "evidenceRefs": [],
                          "isNotEligibilityDetermination": true, "legacyVerdict": null },
    "legacy": { "fitScore": 72, "priorityScore": 64, "pursuitStatus": null,
                "deprecation": { "status": "advisory_only",
                  "guidance": "Title-derived. Not an eligibility signal; do not rank on it.",
                  "earliestRemovalVersion": null } },
    "sourceAvailability": null,
    "companyQualification": null
  },
  "diagnostics": [ { "canonicalOpportunityId": "op:gov:04e9…", "effectiveState": "verified",
                     "internalAliasTypes": ["bonfire_opportunity_id", "portal_url"],
                     "internalUncertaintyReason": null, "mappedV1UncertaintyReason": null,
                     "sourceState": "published_parsed", "observationUtc": "2026-10-15T20:00:00.000Z",
                     "retainedUnverifiedUtc": null, "supersededBy": null,
                     "observationOutcome": "parsed", "verificationBasis": "publisher_of_record",
                     "fetchStatus": "success" } ],
  "meta": { "schemaVersion": "gov-opportunity.v1", "generatedAt": "…", "sourceSnapshotVersion": 1 }
}
```

Note `diagnostics` is an **array of one** on detail (same shape as list), not an object.

### 3.3 Exact snapshot

Snapshot **metadata history**:

```
GET /api/v2/gov-opportunities/op:gov:04e9…/snapshots
```

```json
{ "status": "success", "code": 200,
  "data": [ { "version": 1, "observedAt": "…", "fetchAttemptedAt": "…", "fetchStatus": "success",
              "contentHash": "…", "createdAt": "…" } ],
  "meta": { "canonicalOpportunityId": "op:gov:04e9…", "recorded": 1, "currentVersion": 1,
            "note": "Snapshots are OBSERVATION history. A failed fetch observes nothing and writes none; see close_date_fetch_* on the record for attempt history." } }
```

The **immutable payload** of one exact version:

```
GET /api/v2/gov-opportunities/op:gov:04e9…?snapshotVersion=1
```

Returns `data` = the stored snapshot including its `payload` (source facts, observation, provenance),
with `meta.note: "Immutable source snapshot as observed. Not the current projection."`
Snapshots are append-only, enforced by a database `BEFORE UPDATE OR DELETE` trigger.

## 4. Mapping your existing v1 discovery IDs

```
canonicalOpportunityId = "op:gov:" + md5(<v1 opportunity id as a string>)
```

The v1 id is the UUID you already receive from `/api/v1/bonfire/opportunities`. Worked example:

```
v1 discovery id : 7c9e6679-7425-40de-944b-e07fc1f90ae7
canonical id    : op:gov:04e92dfec7a6939d7b2f65a2c267abb8
```

This is **stable, not a coincidence**: on first ingestion the writer persists
`canonical_public_id` equal to this derivation and uniquely indexes it, so an id you compute before a
record is ingested still resolves after it. The id is deliberately opaque — never derived from title or
solicitation number, because both change and neither is a key.

The reverse mapping is available without computing hashes: `sourceAliases` exposes `legacy_row_id`
(the Bonfire row id) and `portal_url`, so you can reconcile records you already hold.

`idType` is one of `source_record_id | external_id | portal_url | legacy_row_id | other`, enforced by
the pinned schema. Internal alias keys are projected onto that enum and the original value is echoed
in `diagnostics[].internalAliasTypes`.

## 5. Error semantics and source health

| HTTP | `errorCode` | Meaning |
|---|---|---|
| 400 | `unsupported_parameter` | A query parameter outside the documented set. Response includes `unsupportedParameters` and `supportedParameters`. Never silently ignored |
| 400 | `invalid_parameter` | Malformed value — bad `canonicalOpportunityId` (must match `^op:gov:[0-9a-f]{32}$`), non-positive `snapshotVersion`, unknown `deadlineState` |
| 401 | — | No credential |
| 403 | — | Credential lacks `read:gov_opportunities` |
| 404 | `not_found` | No such opportunity |
| 404 | `snapshot_not_found` | That version does not exist. Response includes `availableVersions`. Also returned, with `availableVersions: []`, when the record has no persisted identity yet |
| 500 | `internal_error` | Server-side failure |

Error envelope: `{ "status": "error", "message": "...", "code": <http>, "errorCode": "...", ...extra }`.

**Source health.** `data.sourceAvailability` is non-null only when the last fetch for that record
failed:

```json
{ "status": "degraded", "since": "2026-09-29T17:00:00.000Z",
  "reason": "connect ETIMEDOUT", "servingLastKnownSnapshot": true }
```

`meta.sourceAvailability` on list is **corpus-wide** and stays visible on an empty filtered page, so
"no results" is distinguishable from "a source is down". Treat `degraded` as *the value you are seeing
may be stale*, not as *the record is gone*.

**Snapshot not yet recorded.** A record with no snapshots returns `data: []` with
`meta.recorded: 0` and:

> `"No snapshots recorded for this record. That means none were written, not that the source never changed."`

Do not read an empty snapshot list as evidence of a stable source. At activation, **every** record will
be in this state until ingestion runs.

## 6. Reading `deadline` correctly

| `deadlineState` | What it means for your consumer |
|---|---|
| `verified` | High-confidence parse of a notice published by the soliciting body itself, with the evidence stored. `utc` is usable |
| `retained_unverified` | Previously verified value, plus a newer observation that did **not** verify. The value shown is the older verified one. Stale, not wrong |
| `legacy_unverified` | Stored date predating deadline evidence, produced by the timezone-stripping parser. Treat as unverified |
| `unknown` | No deadline known. **Not** "no deadline exists" |
| `not_published` | The buyer affirmatively stated there is no deadline. Rare |

- `utc: null` with populated `conflicts` means competing sources disagree and the API **refuses to
  pick**. `conservativePlanningUtc` is a labelled planning aid, never an answer.
- A **courtesy posting never verifies.** Where a portal re-publishes another body's solicitation
  (NASPO/cooperative postings, "on behalf of"), the deadline it renders is the re-publisher's, not the
  buyer's. Absence of `verified` there is a statement about *authority*, not about the date.
- `verifiedAt` means verified **against the notice** — never against the cover page and addenda.

**`wallClock` and `resolvedZone` are always `null`.** The parser computes both, but no column persists
them, so the mapper emits `null` unconditionally. This is a gap, not a per-record absence — do not
interpret a null here as "unknown for this record". Nothing is lost: reconstruct the wall clock as
`utc + offsetMinutes` (here `2026-10-15T20:00:00Z` + `-360` min = `2026-10-15T14:00:00` local), and
`statedTimezone` + `timezoneSource` tell you how the offset was established. Persisting the two fields
is a small additive follow-up, tracked in the release handoff.

## 7. What this API does not tell you

- **`documents` and `requirements` are empty because nothing was observed.** Ingestion captures no
  solicitation documents at all; Bonfire scraping reads the notice table only. An empty
  `documents.items` / `requirements` is **not** a reviewed package and **not** an absence of
  requirements.
- **`companyQualification` is always `null`.** The API does not determine whether any company
  qualifies, and must not be presented as doing so.
- `sourceAssessment` carries `isNotEligibilityDetermination: true` and `legacyVerdict` is title-derived
  with `deprecation.status: 'advisory_only'`. Do not rank or gate on it.

## 8. Producer tests and fixtures (at the head this kit describes)

| Path | Covers |
|---|---|
| `contracts/gov-opportunity.v1/schema.json` | The pinned contract |
| `contracts/gov-opportunity.v1/fixtures/` | 12 fixtures: `solicitation-verified`, `rfi-va-enterprise-ai` (unresolved 14:00Z vs 15:00Z conflict), `courtesy-posting-naspo-sw1045`, `deadline-conflict-unresolved`, `amendment-extends-deadline`, `missing-documents-bonfire-403`, `source-outage`, `uncertain-value`, `duplicate-source-aliases`, `missing-verdict`, `declined-with-legacy-verdict`, `rejected-procurement-type` |
| `contracts/gov-opportunity.v1/README.md` | Field-by-field contract rationale |
| `contracts/gov-opportunity.v1/PERSISTENCE-PHASE2.md` | Persistence design, incl. §8 evidence-integrity rules |
| `backend/tests/govContracts/govOpportunityV2.test.js` | Every emitted payload validated against the pinned schema with real Ajv 2020-12; enum mapping; alias projection; auth 401/403/200; pagination; v1 compatibility |
| `backend/tests/govContracts/deadlineEvidence.test.js` | Read/write state model |
| `backend/tests/govContracts/deadlineAuthorityAndIdentity.test.js` | Authority classification, NASPO regression, observation identity, content-hash coverage |
| `backend/tests/bonfire/deadlineParser.test.js` | Timezone parsing |
| `backend/tests/bonfire/deadlineIngestionBoundary.test.js` | Parser → scraper → row boundaries, incl. the provenance the allow-list drops |
| `backend/tests/integration/govPhase2EndToEnd.integration.test.js` | Ingest → Postgres → HTTP, list → detail by returned id → exact snapshot; post-ingestion payload schema-validated |
| `backend/tests/integration/govPhase2Migration.integration.test.js` | Migration up/down/re-appliable; snapshot immutability; no backfill |

## 9. Integration checklist

1. Fetch `GET /contract` and assert `schemaSha256.committedBlobLf` matches
   `26ff667e…`. Fail closed on mismatch rather than parsing an unknown shape.
2. Validate every payload against the pinned schema in your own CI, using a vendored copy of the blob.
3. Read `deadlineState` / `diagnostics[].effectiveState` before acting on `deadline.utc`. Never treat
   `unknown` as "no deadline".
4. Handle `meta.sourceAvailability.status === 'degraded'` as stale-data, not missing-record.
5. Treat empty `documents` / `requirements` and null `companyQualification` as *not observed* and *not
   determined*. Do not derive eligibility from them.
6. Page with `meta.nextCursor` only. Do not synthesize offsets.
