# gov-opportunity.v1

Shared contract between **Opportunity Pulse** (source facts) and **Enterprise** (pursuit decisions).

**Status: DRAFT for coordinator review.** Nothing here is implemented as a live endpoint, and
nothing in this directory changes existing API behaviour. Section 4 is a Phase 2 *specification*.

| Artifact | Path |
|---|---|
| JSON Schema (2020-12) | `schema.json` |
| Fixtures (12) | `fixtures/*.json` |
| Fixture generator | `build-fixtures.js` |
| Conformance + invariant tests | `backend/tests/contracts/govOpportunityV1.test.js` |

Regenerate fixtures: `node contracts/gov-opportunity.v1/build-fixtures.js`
Validate: `cd backend && npx jest tests/contracts`

---

## 1. The one rule

**Opportunity Pulse owns source facts and source-evidence assessments. Enterprise owns the
bidding entity, company capability match, pursuit decision, approval, effort budget and build
authorization.**

`companyQualification` is therefore **always `null`** in this contract — present as an explicit
null in every payload so the boundary is visible rather than implied by omission. A consumer that
finds itself wanting OP to populate it has found a contract bug, not a missing feature.

Two corollaries that repeatedly caused trouble in Rounds 1–2:

- **A procurement-type classification is not a bid/no-bid decision.** `existing_product_license`
  is a fact about the notice. Whether that disqualifies *us* is Enterprise's call.
- **`sourceAssessment.relevanceBasis: "title"` is not qualification.** It means a keyword matched
  a title. Nothing more.

## 2. Field dictionary

### Identity

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `"gov-opportunity.v1"` | Envelope shape. **Independent** of everything below. |
| `sourceSnapshotVersion` | integer ≥1 | Increments when observed **source** facts change (amendment, new documents, changed deadline). Independent of `legacy.enrichmentVersion` and of any model hash. |
| `canonicalOpportunityId` | `op:gov:<32 hex>` | **Opaque.** Never derived from title, solicitation number or URL — all three change. Stable across re-scrapes and retitles. |
| `sourceRecordId` | string | Upstream key for **this notice**. Opaque; do not parse. |
| `sourceAliases[]` | array | Every other id seen for the same notice. Duplicates are **recorded, not merged**. |
| `solicitationFamily` | object\|null | Links notices about one procurement (Sources Sought → Solicitation → Award). **Linking is not deduplication**; each notice keeps its own record. `null` = no family established, *not* "unrelated". |

`solicitationNumber` lives on the **family**, not the record, because several notices share one and
it is not a primary key. Never dedupe on it, and never dedupe on a title-derived `external_id`.

### Publisher — three distinct parties

`publisher.postingSource` (where we saw it) · `publisher.leadBuyer` (who is buying) ·
`publisher.officialSourceUrl` (canonical page at the lead source) · `publisher.submissionPortal`
(where a response is lodged).

NASPO SW1045 is the worked example: posted on **Utah**'s Bonfire, lead buyer **Oklahoma**,
submitted via **Oklahoma's PeopleSoft portal**, canonical page on **naspovaluepoint.org**. Four
different hosts. `submissionPortal: null` means *not established* — never "same as posting source".

### Notice — three orthogonal axes

| Axis | Question | Example |
|---|---|---|
| `noticeType` | What is the **purpose of this posting**? | `sources_sought` |
| `procurementType` | What would be **bought**? | `not_yet_determined`, or `mixed` with components |
| `contractVehicle` | Through what **instrument**? | `cooperative_master_agreement` |

A master agreement is a **vehicle**, not a notice type. Market research is a **notice purpose**,
not a procurement type. An RFI may legitimately describe professional services or mixed future
work — see `fixtures/rfi-va-enterprise-ai.json`, where a detailed draft PWS coexists with
`isBindingSolicitation: false` and `procurementType: not_yet_determined`.

`isBindingSolicitation` is **false for every RFI and Sources Sought**, however detailed the
attachment. `procurementType.basis` ∈ `document | summary | title | not_established` — `title` is
never sufficient for a pursuit decision.

### Deadline

`originalText` is preserved **verbatim** and always wins over any derived value.

- `utcConfidence: "unknown"` **requires** `utc: null`. We do not guess instants.
- `timezoneSource` ∈ `offset | abbreviation | named_zone | absent | unresolvable`.
- `conflicts[]` holds competing values with source and timestamp. **Never silently resolved.** An
  amended deadline appears here alongside the original; so does a known-bad legacy value, retained
  for audit (`supersedes: false`).

### Value — published and estimated never merge

- `value.published.amountMinorUnits` — **integer minor units (USD cents)**. Never a float, never a
  string. `null` means the buyer published no figure; it does not mean zero, and it does not
  license substituting an estimate.
- `value.published.valueType` — a **`ceiling` is a maximum, not an expectation**. Neither a ceiling
  nor an estimate is expected revenue.
- `value.modelEstimate` — model output only, always `notForRevenuePlanning: true`. It is never
  promoted into `published`; `published.provenance` cannot be a model.

### Documents

`coverage` ∈ `complete | complete_for_this_notice | partial | none_published | inaccessible | unknown`.
**`none_published` and `inaccessible` are not interchangeable** — one means the source published
nothing, the other that we could not get at what exists.

Each item carries `retrieval` (status + method + failure reason) and `extraction` (status + method
+ `reviewedBy: human|model|hybrid`), a **full 64-char `sha256`** (never truncated), and
`documentVersion`/`documentDate`. `role` distinguishes `draft_pws` from `final_pws_sow` and
`solicitation` — which drives `bindingStatus` below.

### Requirements

> **An empty `requirements` array does NOT mean there are no requirements.** It means none were
> extracted. Read `documents.coverage` to know whether the absence is meaningful.

| Field | Notes |
|---|---|
| `applicability` | `always \| conditional \| not_applicable \| **unknown**`. `unknown` is first-class and **blocking** — never treat it as false. |
| `applicabilityEvidenceRef` | **Required when `not_applicable`.** An unevidenced `not_applicable` is exactly how a cert wall gets wrongly dismissed. |
| `responsibleParty` | `bidder \| subcontractor \| product_provider \| government \| shared \| unknown` |
| `dueStage` | `submission \| award \| delivery \| unknown` |
| `bindingStatus` | Four genuinely different things — see below |

`bindingStatus` separates:

1. `binding_solicitation_requirement` — binding in a live solicitation.
2. `mandatory_response_instruction` — mandatory for responding to **this** notice (e.g. the VA
   RFI's 20-page limit, SAM UEI, VAAR 852.219-75 certificate).
3. `draft_future_obligation` — in a **draft** PWS. Binds nobody yet.
4. `rfi_question` — the buyer is merely asking (e.g. "How much would you subcontract?").

### Timestamps — four independent clocks

`sourceObservedAt` · `fetchedAt` · `enrichedAt` · `documentReviewedAt` · `lastVerifiedAtSource`.
Conflating these is how stale data looks fresh. Document review can legitimately be newer than
enrichment.

### Legacy — preserved, not nulled

`legacy.fitScore` / `legacy.priorityScore` are passed through **unchanged**. They are advisory and
title-derived; `legacy.deprecation.status` starts at `advisory_only`. **Nulling them is not a
backward-compatible change** and is not done here; removal is a separate, announced breaking change
with `earliestRemovalVersion`.

`legacy.pursuitStatus` is an **OP-local operator action**, not an authoritative decision for the
consumer. A `declined` here does not oblige Enterprise to decline.

`sourceAssessment.legacyVerdict` preserves historical verdicts **with `method` and `evidence`**.
`method: "title_regex"` with `evidence: null` is weak and must surface as such (see
`fixtures/declined-with-legacy-verdict.json`). `scope` distinguishes a verdict about *this notice*
from one about the whole family. A `null` legacyVerdict means **not vetted** — not "cleared".

### Null semantics

| State | Meaning |
|---|---|
| `null` | No value supplied or known. |
| `"unknown"` | We have not established it. **Blocking** — never read as false. |
| `"not_applicable"` | Established as not applying. **Requires evidence.** |
| absent key | Not modelled in v1. |

---

## 3. Fixtures

| File | Demonstrates |
|---|---|
| `solicitation-verified.json` | Binding solicitation, buyer-stated **ceiling**, complete documents |
| `rfi-va-enterprise-ai.json` | RFI with a detailed draft PWS; all four `bindingStatus` values; mixed procurement components |
| `courtesy-posting-naspo-sw1045.json` | Poster ≠ lead buyer ≠ submission portal; master agreement as a vehicle; legacy wrong deadline retained as a conflict |
| `missing-documents-bonfire-403.json` | `coverage: inaccessible`, `accessBarrier: bot_protection`, title-only basis |
| `uncertain-value.json` | `published: null` + model estimate, never merged |
| `deadline-conflict-unresolved.json` | Competing sources, `utc: null`, refuses to pick |
| `amendment-extends-deadline.json` | Amendment supersedes without discarding; `supersededByDocId` |
| `missing-verdict.json` | `legacyVerdict: null` = not vetted |
| `declined-with-legacy-verdict.json` | `pursuitStatus: declined`; title-regex verdict with `evidence: null` |
| `duplicate-source-aliases.json` | One notice, three portal rows, **divergent enrichment**, not merged |
| `source-outage.json` | Source unavailable, flagged rather than served as current |
| `rejected-procurement-type.json` | Evidenced rejection that is still **not** a bid decision |

---

## 4. Phase 2 endpoint specification (NOT implemented)

Proposed, for coordinator review. No production endpoint exists.

### Backward compatibility

`GET /api/v1/bonfire/best-fit` and `GET /api/v1/bonfire/opportunities` keep **exactly** their
current fields and semantics. `fitScore` / `priorityScore` are **not** nulled, reordered or
reinterpreted. New shape ships at a new path:

```
GET /api/v2/gov-opportunities          list
GET /api/v2/gov-opportunities/{canonicalOpportunityId}   detail
```

Optionally negotiable on v1 paths via
`Accept: application/vnd.colaberry.gov-opportunity.v1+json`; absent that header, v1 behaviour is
byte-identical to today.

### List

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `limit` | 1–100 | 25 | |
| `cursor` | opaque | — | **Cursor pagination**, not offset: the underlying set changes under you during a scrape. |
| `noticeType` | csv enum | — | |
| `procurementType` | csv enum | — | |
| `deadlineAfter` / `deadlineBefore` | ISO-8601 | — | Applies only to rows with `utcConfidence: high`; see `includeUnknownDeadline`. |
| `includeUnknownDeadline` | bool | `false` | When true, rows with `utc: null` are returned. **Default false means a deadline-filtered list silently omits them** — documented rather than surprising. |
| `minDocumentCoverage` | enum | — | e.g. `partial` and better. |
| `updatedSince` | ISO-8601 | — | Against `sourceSnapshotVersion` change time. |

```json
{ "data": [ /* gov-opportunity.v1 */ ],
  "pagination": { "cursor": "…", "hasMore": true, "limit": 25 },
  "meta": { "schemaVersion": "gov-opportunity.v1", "generatedAt": "…",
            "sourceAvailability": [ { "sourceSystem": "sbir.gov", "status": "unavailable", "since": "…" } ] } }
```

`meta.sourceAvailability` surfaces outages at the **list** level so a consumer can tell "no results"
from "a source is down".

### Snapshot retrieval

```
GET /api/v2/gov-opportunities/{id}?snapshotVersion=3
GET /api/v2/gov-opportunities/{id}/snapshots        → [{ version, observedAt, changedFields[] }]
```

Snapshots are immutable. Requesting a pruned snapshot returns `410 Gone` with the oldest retained
version, never a silently substituted current one.

### Errors

Existing envelope (`{status, message, code}`) plus a stable `errorCode`:

| HTTP | `errorCode` | When |
|---|---|---|
| 400 | `invalid_parameter` | Bad enum/cursor/date |
| 401 | `unauthenticated` | Missing/invalid key |
| 403 | `insufficient_scope` | Key lacks the scope below |
| 404 | `not_found` | Unknown canonical id |
| 410 | `snapshot_pruned` | Snapshot no longer retained |
| 429 | `rate_limited` | Includes `Retry-After` |
| 503 | `source_unavailable` | Upstream down **and** no usable snapshot |

### Authorization

New scope **`read:gov_opportunities`**, additive to the existing API-key model. It grants reads of
this contract only. It does **not** imply `read:bonfire_source`, and neither implies any write:
API-key requests carry no `role`, so admin routes reject them by construction.

**Never exposed:** credentials, session cookies, scraper state, raw unredacted portal payloads,
internal prompts, `rawText`. Document *bytes* are served via short-lived signed URLs, not inline.

---

## 5. Known gaps in v1

1. `close_date_raw` / timezone columns do not exist in the database yet. The scraper now produces
   them (`scraper/normalize.js`) but they are dropped at `validateRow`. A migration is Phase 2.
2. Historical rows cannot be recomputed: **0 of 5,302** Bonfire rows retain their original deadline
   text. See `backend/src/scripts/deadlineImpactReport.js`.
3. Bonfire notices have no `noticeType` at source, so most map to `unknown` — correctly, but it
   limits filtering until documents are read.
