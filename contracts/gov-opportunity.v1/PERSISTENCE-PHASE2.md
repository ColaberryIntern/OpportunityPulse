# Phase 2 deadline persistence — design proposal

**Status: PREPARE ONLY.** No migration is included in this branch, none has been run, and no
historical data has been altered. This document is the design to review before any schema work.

**Scope note:** this is Opportunity Pulse's *internal* storage design. It is not part of the
`gov-opportunity.v1` wire contract, but it exists to make that contract's `deadline` block
representable — §5 maps one onto the other.

---

## 1. Why five scalar columns are not enough

The earlier sketch proposed `close_date_raw`, `_timezone`, `_offset_minutes`, `_confidence`,
`_uncertainty`. Those carry the *latest parse* and nothing else. They cannot express:

- **Structured conflicts.** A DST fall-back yields **two** real candidate instants; a document/field
  disagreement yields two differently-sourced candidates. A scalar cannot hold a list, and
  `conflicting_sources` as a bare string tells a consumer only that a conflict exists, not what the
  candidates were or where each came from.
- **The distinction between what we believe and what we last saw.** One `close_date` column
  conflates "the verified deadline" with "the most recent observation". Once a re-scrape returns an
  unresolved deadline, those are different facts and both matter.
- **Verification age.** If a re-scrape writes observation fields and something bumps a single
  `updated_at`, a retained old deadline starts looking freshly confirmed. It was not.

## 2. Two groups, deliberately separated

**Group A — the effective belief.** What consumers read as *the* deadline. Written **only** on a
verified resolution.

| Column | Type | Notes |
|---|---|---|
| `close_date` | `timestamptz` | **Existing column, semantics narrowed.** The effective *verified* deadline. Never written from an unresolved parse, and never from a conservative planning value. Legacy consumers keep reading it unchanged. |
| `close_date_verified_at` | `timestamptz` | When `close_date` was last **verified**. Deliberately *not* touched by an unresolved re-scrape — this is the field that stops a retained value looking newly confirmed. |
| `close_date_confidence` | `text` | Confidence of the **effective** value: `high` \| `unknown`. |

**Group B — the latest source observation.** What the source last said, resolved or not. Written on
**every** scrape.

| Column | Type | Notes |
|---|---|---|
| `close_date_observed_at` | `timestamptz` | When the source was last read. Bumped every scrape, pass or fail. |
| `close_date_raw` | `text` | Verbatim source text, never normalised. |
| `close_date_timezone` | `text` | Exactly as printed (`MDT`, `Central Time`, `-04:00`, `Eastern Standard Time`). |
| `close_date_timezone_source` | `text` | `offset` \| `abbreviation` \| `named_zone` \| `absent` \| `unresolvable`. |
| `close_date_offset_minutes` | `integer` | Resolved offset; `NULL` when unresolved. |
| `close_date_uncertainty` | `text` | Parser reason, `NULL` when resolved: `missing_timezone`, `ambiguous_timezone`, `invalid_time`, `invalid_offset`, `unsupported_precision`, `dst_ambiguous`, `dst_nonexistent`, `conflicting_sources`. |

**Structured parts — JSONB, because they are lists.**

| Column | Type | Shape |
|---|---|---|
| `close_date_candidates` | `jsonb` | `[{ utc, offset_minutes, source, observed_at, supersedes }]` — every real instant the wall clock could denote, or every differently-sourced reading. `NULL`/`[]` when there is no conflict. |
| `close_date_conservative_utc` | `timestamptz` | Earliest candidate. **Planning aid only**; must never be copied into `close_date`. |
| `close_date_superseded` | `jsonb` | `[{ utc, verified_at, replaced_at, reason }]` — prior *effective* values, retained explicitly rather than overwritten, so a deadline change is auditable. |

Ten new columns, one existing column narrowed. Scalars carry what we filter and index on; JSONB
carries only what is genuinely a list.

## 3. Write rules — this is where the correctness lives

Let `P` be a `deadlineParser.parseDeadline()` result for a freshly scraped row.

**Always, on every scrape:**

```
close_date_observed_at    := now()
close_date_raw            := P.originalText
close_date_timezone       := P.timezoneLabel
close_date_timezone_source:= P.timezoneSource
close_date_offset_minutes := P.offsetMinutes        -- NULL when unresolved
close_date_uncertainty    := P.uncertainty          -- NULL when resolved
close_date_candidates     := P.candidates           -- NULL when none
```

**If `P.confidence = 'high'` and there is no cross-source conflict — RESOLVED:**

```
if close_date IS NOT NULL and close_date <> P.utc:
    append {utc: close_date, verified_at: close_date_verified_at,
            replaced_at: now(), reason: 'superseded_by_scrape'}
        to close_date_superseded
close_date                  := P.utc
close_date_verified_at      := now()
close_date_confidence       := 'high'
close_date_conservative_utc := NULL
```

**If `P.utc IS NULL` or a conflict is present — UNRESOLVED:**

```
-- close_date            LEFT UNTOUCHED
-- close_date_verified_at LEFT UNTOUCHED     <-- the key rule
close_date_confidence       := 'unknown'
close_date_conservative_utc := earliest(close_date_candidates.utc)   -- may be NULL
```

Four invariants that follow, and that Phase 2 tests must assert:

1. **A retained deadline never looks newly verified.** `close_date_verified_at` is only ever written
   alongside `close_date`. After an unresolved re-scrape the pair is unchanged while
   `close_date_observed_at` moves forward, so the gap between them *is* the staleness signal.
2. **An unresolved parse never erases a known deadline.** Already enforced at the upsert layer on
   this branch (batch split in `upsertJsonArray`); Phase 2 must preserve that when the new columns
   join `updateOnDuplicate`.
3. **A conservative planning value never becomes the deadline.** `close_date_conservative_utc` is a
   separate column and is never copied into `close_date`.
4. **A deadline change is auditable.** Overwrites append to `close_date_superseded` rather than
   vanishing.

## 4. Read contract

`close_date` is authoritative **only** when read together with its companions:

| Observed state | Meaning |
|---|---|
| `close_date` set, `close_date_uncertainty` NULL | Verified deadline. Use it. |
| `close_date` set, `close_date_uncertainty` NOT NULL | **Retained** deadline; the latest observation did not resolve. Stale but honest. Show `close_date_verified_at` and the candidates. |
| `close_date` NULL, `close_date_uncertainty` NOT NULL | Never resolved. Deadline **unknown** — which is not "no deadline". |
| `close_date` NULL, `close_date_uncertainty` NULL, `close_date_raw` NULL | Source published no deadline. |

The third and fourth rows are the distinction the current schema cannot express at all, and the one
that silently drops rows out of `/best-fit` today.

**Read-path consequence to decide in Phase 2:** `/best-fit` filters `close_date >= cutoff`, so rows
whose deadline is unknown are excluded. With these columns that exclusion becomes a deliberate,
visible policy choice rather than an accident. Recommendation: keep excluding them from the ranked
list, but expose them in a separate, labelled "deadline unresolved" bucket so they are not invisible.

## 5. Mapping onto `gov-opportunity.v1`

| Contract field | Source column |
|---|---|
| `deadline.utc` | `close_date` — **only** when `close_date_uncertainty IS NULL` |
| `deadline.utcConfidence` | `close_date_confidence` |
| `deadline.verifiedAt` | `close_date_verified_at` |
| `deadline.originalText` | `close_date_raw` |
| `deadline.statedTimezone` | `close_date_timezone` |
| `deadline.timezoneSource` | `close_date_timezone_source` |
| `deadline.offsetMinutes` | `close_date_offset_minutes` |
| `deadline.uncertaintyReason` | `close_date_uncertainty` |
| `deadline.conflicts[]` | `close_date_candidates` |
| `deadline.conservativePlanningUtc` | `close_date_conservative_utc` |
| `timestamps.sourceObservedAt` | `close_date_observed_at` |

`close_date_superseded` has no contract field today. It is internal audit history; if consumers want
it, that is a `v2` addition, not a silent `v1` change.

## 6. Migration shape (NOT executed)

Additive and reversible. No backfill.

```sql
ALTER TABLE bonfire_opportunities
  ADD COLUMN close_date_verified_at      timestamptz,
  ADD COLUMN close_date_confidence       text,
  ADD COLUMN close_date_observed_at      timestamptz,
  ADD COLUMN close_date_raw              text,
  ADD COLUMN close_date_timezone         text,
  ADD COLUMN close_date_timezone_source  text,
  ADD COLUMN close_date_offset_minutes   integer,
  ADD COLUMN close_date_uncertainty      text,
  ADD COLUMN close_date_candidates       jsonb,
  ADD COLUMN close_date_conservative_utc timestamptz,
  ADD COLUMN close_date_superseded       jsonb;

CREATE INDEX idx_bonfire_close_date_uncertainty
  ON bonfire_opportunities (close_date_uncertainty)
  WHERE close_date_uncertainty IS NOT NULL;
```

**Deliberately absent:**

- **No backfill.** All 5,302 existing rows keep `close_date_verified_at = NULL`, which is the correct
  statement: their stored deadline was produced by the timezone-stripping parser and has never been
  verified. `NULL` is the honest value, not a defect to paper over.
- **No historical correction.** Still requires a portal re-fetch; 0 rows are recomputable from stored
  evidence (see `backend/src/scripts/deadlineImpactReport.js`).
- **No change to `/best-fit`** in the migration itself; see §4.

## 7. Code changes Phase 2 will need

1. `bonfire.util.validateRow` — extend the allow-list; it currently copies nine keys and silently
   drops everything else, which is why all provenance is lost today.
2. `bonfire.service.upsertJsonArray` — add the new columns to `updateOnDuplicate` **while keeping the
   existing batch split**, so an unresolved parse still cannot null a stored `close_date`.
3. A small writer implementing §3's rules — the resolved/unresolved branch is the whole point and
   belongs in one tested function, not inline at the call site.
4. Read API — expose `close_date_confidence` / `close_date_uncertainty` so a consumer can tell
   "unknown" from "none".
5. Tests — the four invariants in §3, plus a re-scrape sequence: verified → unresolved → verified,
   asserting `close_date_verified_at` does **not** move during the middle step.

## 8. Evidence integrity — the three issues closed after the first Phase 2 review

Sections 1–7 were the proposal. This section records what the implementation actually does, where it
differs from the proposal, and why. Each subsection is a defect that was reproduced first.

### 8.1 One publisher for the deadline (transactional consistency)

**What was wrong.** `upsertJsonArray` published `close_date` through the bulk upsert, and
`recordGovEvidence` moved the observation state afterwards, in a different transaction. Two wrong
answers followed:

- An evidence failure left a **changed** `close_date` beside an untouched `close_date_verified_at`
  and an untouched observation id. The row then satisfied every "is this verification current?" test
  while holding a value nobody had verified.
- On success, the evidence write read the **already-overwritten** `close_date`, so the
  `close_date_superseded` entry recorded the new value as the one it had replaced. The audit trail
  described a transition that never happened.

**What it does now.** When the Phase 2 tables are present, the bulk statement inserts new rows and,
on conflict, touches nothing but `updated_at`. Every source column of an existing row *and* its
deadline decision are applied by `ingestObservation` in **one** transaction, together with identity
resolution and the snapshot append. A snapshot therefore always describes a row state that existed.

`SOURCE_COLUMNS` in `govIngestion.service.js` is the allow-list of row columns an observation may
rewrite — held in the writer, not taken from the caller, so nothing can rewrite enrichment or scoring
through the evidence path. `close_date` is deliberately **not** in it: the deadline decision owns it.

**Per-row failure is contained, not fatal.** A row whose evidence write fails keeps its last
consistent state in full — old title, old deadline, old verification metadata — and the loop
continues with the next row. A brand-new row whose evidence write fails exists (the insert is what
made it addressable) with no verification and no identity, which is the honest description of what
happened.

**Only validated rows reach evidence.** `recordGovEvidence` now takes `{raw, row}` pairs. It used to
receive the entire raw array, so a row the validator had **rejected** could still mint identity, write
a snapshot, and move the deadline state of a row that does exist. The pair keeps the provenance the
allow-list strips (`close_date_raw`, timezone, confidence) while guaranteeing validation ran.

**Capability is probed, not assumed.** The switch between legacy and evidence-only publication is a
real query against `gov_canonical_opportunities`, cached per process. Gating on model presence would
have been wrong: the models ship with the code and the tables arrive with a migration, so an
unmigrated database — production, today — would have switched to evidence-only publication while
every evidence write failed on a missing relation, and deadlines would have silently stopped
updating.

### 8.2 Retention is a guarantee about *verified* deadlines

Making evidence the sole publisher raised a question §3 had not answered: what happens to a row whose
stored deadline was **never** verified when a new unverifiable reading arrives?

- A **verified** deadline is never replaced by a reading we could not verify. Unchanged from §3.
- A deadline that was never verified has no claim to protect, and freezing it would leave a staler
  unverified value standing in front of a fresher one — on the column `/best-fit` filters by. So an
  applied observation refreshes it, **without touching any verification column**. The row stays
  unverified; it is unverified about the current reading rather than about an older one.
- Nothing is ever null-erased. Only a reading we actually have replaces a stored one.

### 8.3 Authority is established, not assumed

**What was wrong.** Every portal row was ingested with a hardcoded
`basis: 'agency_portal_is_publisher_of_record'`. That asserted the reading agency publishes the
deadline, for rows where it demonstrably does not. NASPO SW1045 is the live case: carried on Utah's
Bonfire with Oklahoma as lead buyer, so Utah's rendering of the deadline is Utah's, not the buyer's.

**What it does now.** `classifySourceAuthority()` returns a classification **and** the evidence for
it, both derived from what ingestion observed:

| Classification | How it is established | Can verify |
|---|---|---|
| `publisher_of_record` | Portal host matches the ingest namespace — both observed | Yes |
| `courtesy_posting` | Notice text matches a re-publication phrase (`courtesy post`, `on behalf of`, `NASPO`, `cooperative post`) | No |
| `aggregator` | Reserved; no ingestion path produces it yet | No |
| `unknown` | Host/namespace mismatch, or either one missing | No |

`VERIFIABLE_AUTHORITIES` is a one-element set. Widening it is a decision, not a typo.

Two limits stated rather than papered over:

- A NASPO solicitation on a state portal may be that state's **own** lead posting or a courtesy
  re-post, and the notice text alone does not distinguish them. Both classify as courtesy, which
  withholds verification rather than inventing a confirmed authority.
- `verifiability()` returns the failing condition, not just `false`
  (`unestablished_source_authority`, `unevidenced_authority`, `missing_source_ref`,
  `missing_provenance_or_basis`, `low_confidence_parse`), so the read model and the logs say *which*
  condition a row failed.

### 8.4 Versioning covers all material evidence; validity is decided by identity

**Content hash.** `sourceContentHash` covers the published source facts **plus** the competing-reading
set, the authority determination, and its evidence, plus observed document identities, versions and
hashes. Candidate and document lists are sorted, so an ordering change is not mistaken for a content
change while a changed reading is. Fetch timestamps, observation ids and every enrichment field are
deliberately excluded: re-running enrichment must not advance a *source* version.

`documents: null` means **ingestion has not observed any documents** for this source. It is not a
claim that none exist — Bonfire portal scraping captures none at all.

**Verification validity.** `close_date_verified_observation_id` and `close_date_last_observation_id`
are minted per observation (UUID). A verification is current only while they are equal. Timestamp
comparison could not express two cases that occur:

- Two observations inside the same millisecond, where `observed_at <= verified_at` read an unresolved
  outcome as verified.
- Out-of-order arrival: an observation older than the one already applied is now recorded as an
  attempt (`reason: 'stale_observation'`) and otherwise ignored, instead of rewriting current state.

A **failed fetch** deliberately does not set `close_date_last_observation_id`: our inability to reach
the source is not evidence against a deadline we already verified.

The timestamp rule survives only as a fallback for rows written before observation ids existed, where
`observed_at <= verified_at` is correct because the old code stamped both from the same clock read.
`CURRENT_SQL` in `govOpportunityV2.service.js` mirrors this definition exactly, so the API's SQL
buckets and the mapper's state never disagree.
