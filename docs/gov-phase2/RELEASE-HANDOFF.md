# Gov Phase 2 — release handoff

**Tied to exact heads.** PR #2 head `b9b89054f5c0c5ed088fcea8f794141797f8b530`. PR #3 head as of this
document: see `git log -1` on `feat/gov-phase2-persistence-and-v2-api`. Nothing below is deployed.

This document supersedes PR #3's original description, which was written at `c0d942ed` and still
listed limitations that later commits closed.

---

## 1. Implemented code vs activated production behaviour

The distinction matters more than anything else in this handoff: **every capability below is
implemented and tested, and none of it is doing anything in production.**

| Capability | Implemented | Activated in production |
|---|---|---|
| Timezone-correct deadline parser | Yes (PR #2) | **No** — absent from the running image |
| `gov-opportunity.v1` contract + 12 fixtures | Yes (PR #2) | n/a (artifact, not runtime) |
| Deadline-evidence columns (23) + 5 identity/snapshot tables | Yes (PR #3 migration) | **No** — migration not applied; `bonfire_opportunities` has one `close_date` column |
| Snapshot **ingestion** writer with a real production caller | Yes (PR #3) | **No** — no ingestion run |
| Persisted canonical identity, uniquely indexed | Yes (PR #3) | **No** — tables absent, so every read uses the derivation fallback |
| Source-authority classification gating verification | Yes (PR #3) | **No** |
| `/api/v2/gov-opportunities` list / detail / snapshots | Yes (PR #3) | **No** — route not mounted in the running image |
| Immutable snapshots enforced by DB trigger | Yes (PR #3 migration) | **No** |

Production is at `6936c99`, branch `main`, with `20260620000001-add-bonfire-vet-verdict.js` as the
last applied migration.

## 2. Corrections to PR #3's original description

| PR #3 said | Actual state |
|---|---|
| Contract hash `d2a100c8…` | That is the **CRLF working-copy** hash. Authoritative is the committed **LF blob**: `26ff667ed6d669d35fc89dc13886042f23620b1b9cf97b0fc90f1597d6cdd6bb`. Blob id `23c85c08d0c59c89b2c7095956fe134d203ef549`, unchanged since `b9b8905`. |
| "17 deadline-evidence columns" | **23** |
| "`isVerifiable()` additionally requires the absence of competing evidence" | It *also* requires an **evidenced source authority**. Absence of contrary evidence is not authority. |
| "Effective verification is `verified_at IS NOT NULL`" | Verification currency is decided by **observation identity** (`close_date_verified_observation_id == close_date_last_observation_id`). The timestamp rule survives only as a fallback for pre-Phase-2 rows. |
| Limitation 1: "`getGovOpportunity` … unindexed" | **Half closed.** Ingested records resolve through the unique index on `canonical_public_id` plus an alias lookup. Records with no persisted identity still fall back to deriving over all row ids — measured at **36 ms** of database execution for 5,302 rows on production hardware. Ingesting a record moves it onto the indexed path. |
| Limitation 2: "identity is derived on read; `gov_canonical_opportunities` stays empty" | **Closed in code.** `ingestObservation` resolves-or-creates identity and aliases. Still true *operationally* until an ingestion run happens. |
| Limitation 3: "no ingestion path writes snapshots" | **Closed.** `upsertJsonArray` → `recordGovEvidence` → `ingestObservation` writes snapshots from the real scraper path. |
| Limitation 4: `legacy_unverified` → `conflicting_sources` is an imperfect fit | **Still true.** The proposed additive `v1.1-effective-state` is served from `GET /contract`. |
| Evidence "2,823 passed / 13 skipped / 211 suites", "13/13 Postgres" | Superseded; see §6. |

## 3. What deploying PR #2 alone would actually do

Three facts, each verified by a test on the branch:

1. **Existing rows receive changed `close_date` values on routine re-scrape.** `closeDate` is in
   `updateOnDuplicate`, and with no Phase 2 tables present that is the only publisher. The corrected
   parser returns a *different instant* for the same portal string — `deadlineIngestionBoundary.test.js`
   pins the shift at **exactly six hours** for `"Oct 15th 2026, 2:00 PM MDT"` (legacy `14:00Z`,
   corrected `20:00Z`).
2. **Parsing a timestamp correctly does not prove source authority.** Authority classification and the
   verification gate live in PR #3. Phase 1 alone writes the newly-parsed instant with no record of
   who published it, so a courtesy re-post's deadline is stored exactly like a buyer's.
3. **Phase 1 alone drops provenance at the existing validation boundary.** `validateRow`'s nine-key
   allow-list discards `close_date_raw`, timezone, timezone source, offset, confidence and
   uncertainty. Pinned by `deadlineIngestionBoundary.test.js` ("ALL five provenance fields are
   dropped — this is the Phase 2 gap").

**Operational consequence.** Deploying #2 alone mutates stored deadlines on up to the re-scraped
subset of 5,192 rows that carry a `close_date`, with **no verification column, no observation record,
no snapshot and no superseded history** — because none of those columns exist until PR #3's migration.
There would be no way after the fact to say which rows changed, from what, on whose authority, or
whether the new value is better than the old one. The correction is real and desirable; shipping it
without the audit surface is the problem.

### Recommendation: land #2 and #3 in dependency order and deploy together

Deploy #2 alone is **not** operationally acceptable, for the reason above. This corrects a
recommendation I gave in the previous recovery round ("smallest next slice: merge PR #2 alone"): that
advice weighed migration risk and overlooked that #2 alone rewrites existing deadline values with no
audit trail. Migration risk is the smaller of the two risks — the migration is additive, reversible
and backfill-free.

Deploying them together means the first re-scrape after rollout writes a corrected deadline **and**
the observation, authority, snapshot and superseded-history record that explains it.

## 4. Landing plan for the stacked PRs

**Prerequisite — production divergence. PREPARED, awaiting review.** Production `main` is 5 commits
ahead of `origin/main` and divergent; a `git pull` there merges rather than fast-forwards. Two of
those commits carried `backend/src/ingestion/sourceHealthMonitor.js`, its test and `scheduler.js`
wiring that existed on **no origin ref**, so the usual recovery move (`git reset --hard origin/main`)
would have deleted live ingestion alerting.

That code is now preserved on **`recovery/prod-ingestion-source-health`** and opened as **draft PR #4**
against `main`, byte-identical to production (blobs verified per file; the ingestion surface diffs
empty against `refs/prod/main`), with its tests passing (9/9, and 406/37 for the whole unit suite) and
**zero conflicts** against PR #2, PR #3 or the accelerator branch. See `tmp/escalation.json`
(`status: resolved_pending_review`).

**Merge PR #4 before any rollout step that touches the prod checkout.** Until it lands, `origin/main`
is still not a superset of production and the recovery move remains destructive. **§9-§11 below supersede
this section's ordering**: the accelerator branch is also still unmerged, and the full reconciliation,
the four-PR landing order and the explicit activation sequence live there. Note also that
`feat/accelerator-bonfire-read-integration` has no PR of its own — its content is safe on origin but
unmerged, so prod `main` stays divergent from `origin/main` until that lands too.

**Also surfaced, non-blocking:** `op-backend` reports **unhealthy** because its healthcheck receives
**429** from `/api/v1/health` on localhost — the rate limiter rejects the container's own healthcheck.
External traffic is unaffected (1,873 of the last 2,000 nginx lines are 200; the only two 429s were
`/metrics` from curl). It does not block the rollout — `docker-compose.prod.yml` gates only `postgres`
and `redis` on `service_healthy` — but it makes the backend health signal untrustworthy, and step B's
smoke checks below rely on observing health. Fix separately.

**Order and mechanics.**

1. **PR #2 → `main`.** Use **merge commit** (`gh pr merge 2 --merge`), *not* squash or rebase.
   A squash would replace #2's commits with one new commit; #3's branch still contains the originals,
   so its diff against `main` would show every Phase 1 change again as unrelated-looking history and
   invite a conflict-laden rebase. A merge commit keeps #2's commits reachable from `main`, and #3's
   effective diff collapses to Phase 2 only.
2. **Do not delete `feat/gov-deadline-parser-and-contract-v1` on merge.** Verified: the repository has
   `delete_branch_on_merge: false`, so nothing auto-deletes — confirm that is still the case at merge
   time rather than assuming. Retarget #3 explicitly first, then delete the branch. Deleting the base
   while #3 is open relies on GitHub's auto-retarget and risks losing the base ref mid-flight.
   Verified available merge strategies on this repo: merge commit, squash and rebase are all enabled,
   so the merge-commit choice must be made deliberately in the UI or with `--merge`.
3. **Retarget #3:** `gh pr edit 3 --base main`. Because #2's commits are now ancestors of `main`,
   nothing duplicates — no rebase, no force-push, no history rewrite.
4. **Re-verify the effective diff after retargeting.** `git diff --stat origin/main...HEAD` must list
   only Phase 2 paths. If it lists Phase 1 paths, step 1 did not use a merge commit.
5. **Re-run checks on the retargeted PR.** Retargeting changes the merge base, so the previous check
   run no longer describes the diff under review. A `mergeable` flag is **not** review: it reports
   textual conflict absence only. Require a fresh `Gov Phase 2` workflow pass plus human approval on
   the new base.
6. **Then merge #3 → `main`.** Delete both feature branches after #3 lands.

## 5. Bounded activation plan (superseded by §11 — kept for the per-step detail it carries)

> **§11 is the authoritative activation sequence.** It adds the ingestion pause/drain, backup
> *restoration*, fresh baseline counts and the enforced one-record pilot gate that this section lacks.

Each step is separately authorizable and separately reversible.

### A. Migration

1. Verify the nightly `op-backup` container produced a restorable dump; take a fresh explicit
   `pg_dump` of `bonfire_opportunities` immediately before, and record its byte size and row count.
2. Confirm the pre-state on the record, to be able to prove nothing was rewritten:
   `SELECT count(*) FROM bonfire_opportunities` (expect 5,302) and
   `count(close_date)` (expect 5,192).
3. Apply `20260929000001` only. It is additive: 23 nullable columns, 5 new tables, 2 indexes, 1
   trigger. **No backfill, no UPDATE of any existing row.**
4. Post-migration assertions, all read-only: the two counts above are unchanged;
   `count(*) WHERE close_date_verified_at IS NOT NULL` is **0**; the 5 tables exist and are empty;
   `UPDATE gov_source_snapshots …` is rejected by the trigger.
5. Recovery: the migration's `down` drops only what `up` added and leaves `close_date` intact
   (proven by `govPhase2Migration.integration.test.js`). Restore from the dump only if `down` fails.

### B. Code rollout

6. Build and restart `op-backend` from the merged `main`. Read-only smoke checks:
   `GET /api/v2/gov-opportunities/contract` → 200 with the LF hash;
   `GET /api/v2/gov-opportunities` with **no** credential → 401;
   with a `read`-only credential → 403;
   `GET /api/v1/bonfire/opportunities` and `/best-fit` → unchanged behaviour (legacy semantics
   preserved; regression-check this explicitly, since it is the live Enterprise surface).

### C. Credential provisioning — a separate activation action

7. Mint one API key carrying `read:gov_opportunities` **only**. Do not widen the existing
   `read:bonfire_source` key. Deliver out of band; never into a transcript, ticket or log. Record only
   the key prefix and the scope set. Not done in this round, and not to be bundled with A or B.

### D. Ingestion sample — explicitly scoped

8. Run the scraper for **one portal, `utah`, limited to a single opportunity** already present in
   `bonfire_opportunities` — not a corpus re-fetch, not a new portal, not the full 1,698 Utah rows.
9. What that sample changes, stated in advance so it can be checked afterwards:
   - **1 row** of `bonfire_opportunities`: its source columns and, if the observation verifies, its
     `close_date` plus the deadline-evidence columns. **Its `close_date` may change by hours** — this
     is the corrected parse and is the point of the exercise.
   - **1 row** in `gov_canonical_opportunities`, **1–2 rows** in `gov_source_aliases`, **1 row** in
     `gov_source_snapshots` (version 1).
   - Nothing else. No other row is touched, because ingestion is keyed on `external_id`.
10. Evidence retention: capture the row's before/after state and the snapshot payload to a dated file
    under `docs/gov-phase2/activation-evidence/`, plus the immutability check
    (`UPDATE gov_source_snapshots` rejected) and the identity check (the id returned by list resolves
    through detail). The snapshot itself is the durable audit record and is append-only by trigger.

### E. Rollback

11. **Rolling back code is safe and sufficient for most failures**: redeploy the previous image. The
    evidence columns and tables are additive; the legacy `close_date` path still works with them
    present and populated.
12. **Do not drop the evidence tables as a routine rollback.** They hold the only record of what was
    observed, including the superseded deadline values. Dropping them destroys the audit history the
    phase exists to create, and is not reversible from the application.
13. If the schema itself must go, run the migration's `down` **only after** exporting
    `gov_source_snapshots`, `gov_canonical_opportunities` and `gov_source_aliases` to a retained dump,
    and record where that dump lives. Treat it as data destruction requiring explicit authorization.
14. If a single row's published deadline is wrong after the sample, the targeted remedy is to re-run
    ingestion for that `external_id` — the write is idempotent and appends a new snapshot rather than
    editing the old one. **No corpus-wide re-fetch and no historical deadline correction** are part of
    activation.

## 5b. Defects found during release preparation (fixed this round)

Two contract-honesty defects that a release would otherwise have shipped:

1. **Post-ingestion payloads failed their own pinned contract.** The ingestion writer keys its primary
   alias on `bonfire_opportunity_id`; v1's `sourceAliases[].idType` enum has no such member. The moment
   a record gained a persisted identity, its detail payload violated the frozen schema. It was invisible
   because the unit mock leaves the alias table `null` (so `sourceAliases` was always empty) and the one
   end-to-end assertion **pinned the internal token** instead of validating the payload. Fixed by
   projecting at the mapper boundary (`bonfire_opportunity_id` → `legacy_row_id`, unrecognised → `other`),
   with the internal value retained in `diagnostics[].internalAliasTypes`. The test gap is closed: the
   end-to-end suite now Ajv-validates the payload of a record that *has* a persisted identity, and four
   unit tests cover the projection including an unknown-type case.
2. **`deadline.wallClock` and `deadline.resolvedZone` are hardcoded `null`.** The parser computes both;
   no column persists them, so the mapper emits `null` unconditionally. Not fixed in code — persisting
   them is an additive schema change and out of scope for release preparation. Disclosed in the consumer
   kit as a **gap, not a per-record absence**, with the reconstruction rule (`utc + offsetMinutes`).
   Recommended as a small additive follow-up slice.

## 6. Verification evidence at this head

| Scope | Result |
|---|---|
| Full backend | **2,874 passed / 44 skipped / 212 of 214 suites, 0 failures** |
| `tests/govContracts` + `tests/bonfire` | all passing; `govOpportunityV2.test.js` now 56 reported cases (4 new `it` blocks) |
| Postgres (`tests/integration/govPhase2`) | 44 passed / 0 skipped / 0 failed, real `postgres:15-alpine` |
| CI `Gov Phase 2` | success — lint, unit/contract, Postgres, schema integrity, advisory audit |
| eslint | 0 errors on all changed files |

The 44 skipped in the full run are the two Postgres suites, which self-skip without
`PHASE2_TEST_DB_URL` and are run separately.

## 7. Document coverage — read this before using the API for eligibility

`documents` is **required** by the contract, and ingestion observes **no solicitation documents at
all**. Bonfire portal scraping captures the notice table only. Therefore:

- `documents.coverage` is `inaccessible` (or `partial` where attachments were fetched by other means),
  `counts` are all `0`, and `items` and `amendments` are `[]`.
- `requirements` is `[]`.
- **An empty `documents` or `requirements` does not mean a reviewed package, an absence of
  requirements, or eligibility.** It means nothing was observed.
- `companyQualification` is always `null`. The API does not determine qualification and must not be
  read as doing so.

`deadline.verifiedAt` means *verified against the notice*, never *against the cover page and
addenda* — ingestion cannot see an addendum that moves a deadline. The
`OPPORTUNITY_VETTING_AND_DISQUALIFICATION.md` addendum check remains human work.

### Smallest existing authorized route to a complete package for one pilot opportunity

No new crawler is proposed. The existing, already-deployed path is:

1. A human obtains the full document set from the portal by normal authorized access (log in, accept
   the terms the portal requires, download).
2. `POST` those files through the existing **manual upload** path
   (`bonfireManualUpload.ingestFiles`, reached from `bonfire.controller.js:403`, admin JWT only). It
   expands zips, extracts text, dedupes by content, writes `OpportunityAttachment` rows and sets
   `attachmentsFetchedAt` — which is what flips `documents.coverage` off `inaccessible`.
3. `documentDeepVet.deepVetFromDocuments(:id)` (`bonfire.controller.js:430`) then performs the
   document-grounded gate check. `GET /opportunities/:id/attachments` lists what was stored.

**What is missing for that to become contract-grade document evidence**, stated rather than papered
over:

- The uploaded attachments are **not** joined to `documents.items` / `amendments` in the v1 mapper —
  `buildDocuments()` reads only `attachmentsFetchedAt` and emits zero counts. Wiring it is a small,
  separate slice.
- No per-document `sha256`, version or `supersededByDocId` is recorded, so amendment supersession
  cannot be expressed even when the amendment file is present.
- `sourceContentHash` already has a `documents` input, so document versions would participate in
  snapshot versioning as soon as they are observed — the plumbing is ready, the observation is not.
- Provenance of a manual upload is a human, not a portal fetch; the contract has no field asserting
  that, so it must not be presented as source-verified coverage.

## 9. Production-to-origin reconciliation — the complete picture

Measured, not assumed. `refs/prod/main` is a read-only fetch of production's `main` (`6936c99`).

| Compared against | Files where **production** has content the ref lacks |
|---|---|
| `origin/main` (`f0c577c`) | **14** |
| `origin/recovery/prod-ingestion-source-health` (PR #4) | 11 |
| `origin/feat/accelerator-bonfire-read-integration` (`a3a451a`, **no PR**) | 4 |
| **Union of PR #4 + the accelerator branch** | **1** |

The union was built by actually merging the two branches in a throwaway worktree (they merge with **zero code conflicts**; one trivial `PROGRESS.md` conflict) and diffing production against the result. What remains is exactly one file:

- `directives/ACCELERATOR_BONFIRE_API_CONTRACT.md` — **7 lines**, the stale `Rollout state as of 2026-09-28 — NOT LIVE` table asserting "deploy blocked", "no credential minted", "no such hostname". Deliberately excluded: the accelerator branch supersedes it with the post-rollout state, and preserving it would reintroduce claims that are now false.

**Therefore: once PR #4 and an accelerator PR both land, `origin/main` contains every line of production *code* and *test*. Zero source files remain production-unique.** The only residual difference is those 7 lines of superseded documentation.

**`origin/main` is not, and is not claimed to be, a byte-for-byte copy of production.** Any checkout replacement on the server must be justified by the functional statement above, not by a byte comparison — and it is only safe **after both PRs land**. Until then, `git reset --hard origin/main` on production still destroys the source-health monitor.

### Production functionality accounted for

| Production capability | Where it lives on origin | Status |
|---|---|---|
| Ingestion source-health monitor + scheduler wiring + tests | `recovery/prod-ingestion-source-health` | **PR #4, draft — needs review** |
| `read:bonfire_source` API-key scope | `feat/accelerator-bonfire-read-integration` | **no PR yet** |
| `/api/v1/bonfire/best-fit` digest-parity endpoint | same | **no PR yet** |
| `bestFit` + `sourceFieldsScope` test suites | same | **no PR yet** |
| Accelerator API contract directive | same (supersedes prod's copy) | **no PR yet** |
| Stale "NOT LIVE" rollout table | nowhere, by decision | not preserved |

**Blocker:** the accelerator branch carries the **live Enterprise integration surface** — the scope and endpoint Enterprise consumes today — and it has no PR. It must be reviewed and landed as part of the release, not left as an unmerged branch.

## 10. Revised landing order

Four PRs, in this order. Each step is separately authorizable.

1. **PR #5 — healthcheck fix** (`fix/healthcheck-readiness-not-rate-limited`, base `main`). Independent of the gov stack; no file overlap with #4, #2 or #3. Land it **before the rollout** so the deploy's own health signal is trustworthy. Takes effect on the next image build only.
2. **PR #4 — preservation** (`recovery/prod-ingestion-source-health`, base `main`). Review and land. Until it merges, `origin/main` is not a superset of production.
3. **A new PR for `feat/accelerator-bonfire-read-integration`** → `main`. This is the remaining production dependency and the live Enterprise surface. **Not yet opened** — needs authorization, since it is someone else's unreviewed branch.
4. **PR #2 — Phase 1** → `main`, **with a merge commit** (`gh pr merge 2 --merge`), never squash. A squash replaces #2's commits while #3's branch still holds the originals, so #3's diff would re-show every Phase 1 change.
   - **Retain `feat/gov-deadline-parser-and-contract-v1` until #3 is retargeted.** The repo has `delete_branch_on_merge: false` (verified) — confirm again at merge time rather than assuming.
5. **Retarget PR #3** to `main` (`gh pr edit 3 --base main`). #2's commits are now ancestors of `main`, so nothing duplicates: no rebase, no force-push.
6. **Inspect the resulting diff:** `git diff --stat origin/main...origin/feat/gov-phase2-persistence-and-v2-api` must list **only Phase 2 paths**. If Phase 1 paths appear, step 4 did not use a merge commit.
7. **Re-run checks and re-review on the new base.** Retargeting changes the merge base, so the earlier run no longer describes the diff under review. A green `mergeable` flag reports absence of textual conflict — it is **not** review. `main` has no branch protection, so nothing enforces this mechanically.
8. **Merge PR #3.** Then delete the two gov feature branches.
9. **Deploy #2 and #3 together, in one rollout.** Never #2 alone: `closeDate` is in `updateOnDuplicate` and with no Phase 2 tables it is the only publisher, so a re-scrape would shift stored deadlines — six hours exactly for the Utah MDT case — with no verification column, observation, snapshot or superseded history.

## 11. Activation sequence (explicit; nothing below is authorized yet)

Ordered, each step gated on the previous one's evidence.

### Step 1 — Pause and drain scheduled ingestion

Ingestion must not run during migration or rollout: a scrape mid-migration would write through a half-applied schema, and one after code rollout but before the pilot gate would violate the one-record pilot scope.

- **Pause:** set `BONFIRE_ENGINE_ENABLED=false` (the flag `/api/v1/bonfire/flag` already reports, verified `true` in production today) and unset/disable `INGESTION_SCHEDULE`, then restart the backend so no scheduler is armed. Record `/api/v1/bonfire/flag` returning `enabled:false` as the evidence that the pause took effect.
- **Drain:** confirm no ingestion is in flight before touching the schema —
  `SELECT count(*) FROM ingestion_logs WHERE status = 'running'` must be **0**, and it must stay 0 across two reads 60s apart. If a run is in flight, wait for it to reach a terminal status; do not kill it mid-write.
- **Confirm quiet:** no new `ingestion_logs` row for at least one full scheduler interval.

### Step 2 — Verify backup *restoration*, not just backup existence

A dump that has never been restored is not a backup.

- Take a fresh explicit `pg_dump` immediately before migrating; record its byte size and SHA-256.
- **Restore it into a scratch database on the same server and verify row counts match the source.** Existence of the nightly `op-backup` artifact is not sufficient evidence.
- Record where the dump lives and how long it is retained.

### Step 3 — Fresh baseline counts, taken at activation time

The counts observed on 2026-09-29 (5,302 rows / 5,192 with `close_date` / 516 still open) are **evidence of method, not the baseline**. Ingestion has run since. Re-measure immediately before migrating and record the new numbers:

```sql
SELECT count(*) AS total,
       count(close_date) AS with_close_date,
       count(*) FILTER (WHERE close_date >= now()) AS still_open,
       count(*) FILTER (WHERE close_date_verified_at IS NOT NULL) AS verified
FROM bonfire_opportunities;
```

The last column must be **0** before and after the migration.

### Step 4 — Apply the additive migration

`20260929000001` only. 23 nullable columns, 5 tables, 2 indexes, 1 immutability trigger. **No backfill, no UPDATE of any existing row.**

Post-migration assertions, all read-only: the Step-3 counts are unchanged; `close_date_verified_at IS NOT NULL` is still **0**; the 5 tables exist and are empty; `UPDATE gov_source_snapshots …` is rejected by the trigger.

### Step 5 — Roll out code

Rebuild and restart `op-backend` from the merged `main`. The new `HEALTHCHECK` (PR #5) takes effect with this build, so container health becomes a real readiness signal at this point — confirm `docker inspect` reports `healthy` with `failing_streak=0`.

### Step 6 — Verify v1 *and* v2

- **v1 regression (the live Enterprise surface):** `/api/v1/bonfire/opportunities`, `/api/v1/bonfire/best-fit`, `/api/v1/bonfire/opportunities/:id` return unchanged shapes; `read:bonfire_source` still gates un-redaction of `sourceUrl`/`rawText`. **Legacy semantics preserved** is a release requirement, not a nice-to-have.
- **v2 read-only smoke:** `GET /api/v2/gov-opportunities/contract` → 200 with `schemaSha256.committedBlobLf = 26ff667e…`; no credential → **401**; a `read`-only credential → **403**.

### Step 7 — Provision the scoped credential, securely and separately

One API key carrying **`read:gov_opportunities` only**. Do **not** widen the existing `read:bonfire_source` key. Deliver out of band — never into a transcript, ticket, log or PR. Record only the key prefix and the scope set. This is its own authorization, not a rider on Steps 4–6.

### Step 8 — The authorized one-opportunity Utah pilot, and nothing more

Only after release approval, and only after Steps 1–7 have produced their evidence.

- Scope: **one** portal (`utah`), **one** opportunity already present in `bonfire_opportunities`. Not the 1,698 Utah rows, not a new portal, not a corpus re-fetch.
- **Enforcement, not intention:** re-enable ingestion in a single-record mode rather than re-arming the scheduler — run the scraper for that one `external_id` with the scheduler still disabled, and keep `BONFIRE_ENGINE_ENABLED=false` until the pilot evidence is reviewed. The gate is that the scheduler stays unarmed; a flag alone that some other code path ignores is not a gate.
- Expected changes, stated in advance so they can be checked afterwards: **1** `bonfire_opportunities` row (its source columns and, if the observation verifies, `close_date` plus the deadline-evidence columns — **`close_date` may move by hours**, which is the corrected parse and the point of the exercise); **1** row in `gov_canonical_opportunities`; **1–2** rows in `gov_source_aliases`; **1** row in `gov_source_snapshots` at version 1. Nothing else, because ingestion is keyed on `external_id`.
- Evidence retained under `docs/gov-phase2/activation-evidence/`: the row before/after, the snapshot payload, the immutability check (`UPDATE gov_source_snapshots` rejected), and the identity check (the id returned by list resolves through detail).
- **Resume broader ingestion only after that evidence is reviewed and accepted.** Re-arming the scheduler is a separate authorization.

### Step 9 — Rollback that preserves evidence

- **Code rollback is the first resort and is sufficient for most failures:** redeploy the previous image. The evidence columns and tables are additive; the legacy `close_date` path works with them present and populated.
- **Do not drop the evidence tables as routine rollback.** They hold the only record of what was observed, including superseded deadline values. Dropping them destroys the audit history this phase exists to create and is not reversible from the application.
- If the schema itself must go: export `gov_source_snapshots`, `gov_canonical_opportunities` and `gov_source_aliases` to a retained dump **first**, record where it lives, then run the migration's `down` (proven to leave `close_date` intact by `govPhase2Migration.integration.test.js`). Treat it as data destruction requiring its own authorization.
- A single wrong published deadline after the pilot is remedied by re-running ingestion for that one `external_id` — the write is idempotent and appends a new snapshot rather than editing the old one. **No corpus-wide re-fetch and no historical deadline correction** are part of activation or rollback.

## 12. Enterprise live-integration evidence

What Enterprise must be able to show before the integration counts as live. Each item is a checkable artifact, not an assertion.

| # | Evidence | How it is checked | Status of the field today |
|---|---|---|---|
| 1 | **Matching contract hash** | `GET /api/v2/gov-opportunities/contract` → `data.schemaSha256.committedBlobLf` equals `26ff667ed6d669d35fc89dc13886042f23620b1b9cf97b0fc90f1597d6cdd6bb`, and equals Enterprise's vendored copy hashed as a **git blob**. Fail closed on mismatch. | Implemented |
| 2 | **A real canonical ID** | A `canonicalOpportunityId` matching `^op:gov:[0-9a-f]{32}$` that came from a **list** response, not constructed by hand. | Implemented |
| 3 | **A persisted snapshot** | `GET /api/v2/gov-opportunities/{id}/snapshots` returns `meta.recorded >= 1` and `data[0].contentHash`; `?snapshotVersion=1` returns the immutable payload. **Requires the pilot ingestion to have run** — before that, `meta.recorded: 0` with the explicit note that none were written. | Implemented; **unpopulated until Step 8** |
| 4 | **A real "available" resolve** | The id from (2) resolves through **detail** and returns `200` with `data.canonicalOpportunityId` equal to the id requested — i.e. list → detail round-trips on a persisted identity, not on the derivation fallback. Confirm `meta.sourceSnapshotVersion` is non-null, which is what distinguishes the two. | Implemented |
| 5 | **Source liveness** | ⚠️ **There is no `sourceLive` field.** I checked the contract and the API: no such property exists. The real signal is `data.sourceAvailability`, which is **`null` when the last fetch for that record succeeded** and an object `{status: 'degraded', since, reason, servingLastKnownSnapshot: true}` when it failed; plus a corpus-wide `meta.sourceAvailability` on list. Enterprise should assert `sourceAvailability === null` (record-level) rather than a `sourceLive: true` that does not exist. If a positive boolean is genuinely wanted, that is an **additive v1.1 change** to propose, not an existing field to consume. | **Field does not exist — mapped to `sourceAvailability`** |

### What connectivity does *not* establish

A green run of items 1–5 proves the pipe works. It does **not** establish qualification, and the contract is built so it cannot be read that way:

- **`documents` and `requirements` are empty because nothing was observed.** Ingestion captures no solicitation documents at all — portal scraping reads the notice table only. `documents.coverage` is `inaccessible`, all counts are `0`, `items`/`amendments`/`requirements` are `[]`. That is *not observed*, **not** a reviewed package and **not** an absence of requirements.
- **Document coverage and cited requirements must pass independently**, through the human route in §7 (portal download → manual upload → `documentDeepVet`). Until the mapper joins uploaded attachments into `documents.items` with per-document `sha256`/version/`supersededByDocId`, an empty `documents` block is silent about coverage and must be treated as unreviewed.
- **`companyQualification` is always `null`.** The API does not determine whether any company qualifies.
- `sourceAssessment` carries `isNotEligibilityDetermination: true`, and `legacy.deprecation.status` is `advisory_only` with "do not rank on it".
- `deadline.verifiedAt` means verified **against the notice**, never against the cover page and addenda.
