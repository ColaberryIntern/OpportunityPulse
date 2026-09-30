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
