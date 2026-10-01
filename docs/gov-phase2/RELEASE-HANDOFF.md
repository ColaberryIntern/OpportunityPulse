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
> **Superseded by §19.2.** That section adds the actual merges for #4 and #6 and puts #7 first.

> **Prerequisite zero: read §13 first.** Merging into `main` currently triggers an unattended
> production deploy that also runs `db:migrate`. Until that coupling is resolved, **no PR below should
> be merged** — the order is correct, but it cannot be executed safely yet.

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
> **Superseded by §19.3.** This section had the order wrong: it dispatched the code release BEFORE
> pause/drain and migration. Migration now precedes rollout.

> **§13 blocks this sequence.** Steps 1-4 assume the migration is applied deliberately, after a drained
> ingestion and a verified backup. The CI deploy job runs `db:migrate` automatically on merge, which
> would bypass all of it.

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
> **Superseded by §16**, which corrects the cross-repository split: `sourceLive` and `sourceState` are
> **Enterprise-side** fields, while OP supplies `sourceAvailability` and `meta.sourceSnapshotVersion`.

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

## 13. BLOCKER — merging to `main` auto-deploys and auto-migrates production
> **RESOLVED IN PR #7** (`fix/separate-release-from-merge`, head `9b08e13`), not yet merged. The fix
> removes the auto-deploy job from `ci.yml`, adds manual `release.yml` and `migrate.yml`, and adds a
> preflight that refuses Phase 1 alone. The analysis below is kept because it is the reason the fix
> exists. **The blocker stands until #7 merges AND the `production` environment with required
> reviewers is created** — that environment is a repository setting and cannot come from a PR.

Found while verifying PR #5's CI, because one job reported `Deploy to Production: skipped`.

`.github/workflows/ci.yml` stage 9:

```yaml
deploy:
  name: Deploy to Production
  needs: [docker-build]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  steps:
    - uses: appleboy/ssh-action@v1
      with:
        script: |
          cd /opt/opportunity-pulse
          git pull origin main
          docker compose $ENV_FLAG -f docker-compose.prod.yml up -d --build
          sleep 25
          curl -sf .../api/v1/health || ... || exit 1
          docker exec op-backend npx sequelize-cli db:migrate
```

**Every merge into `main` triggers an unattended production deploy that also applies pending migrations.** There is **no approval gate**: the job declares no `environment:`, and the repository has **0 environments configured**, so no required reviewer exists. `main` also has no branch protection.

### Why this invalidates the landing plan as written

§10 and §11 assume merging and deploying are separate, separately authorized acts. **They are not, as currently configured.**

1. **Merging PR #5, PR #4 or an accelerator PR would deploy production immediately** — not on authorization, on merge.
2. **Merging PR #2 would deploy Phase 1 alone**, which §3 establishes as unacceptable: a re-scrape shifts stored deadlines (six hours for the Utah MDT case) with no verification column, observation, snapshot or superseded history. The stacked sequence necessarily leaves `main` holding Phase 1 without Phase 2 while #3 is retargeted, reviewed and re-checked — and auto-deploy would ship exactly that window.
3. **`db:migrate` runs automatically**, so the Phase 2 migration would apply with **no fresh baseline counts, no verified backup restoration, and no drained ingestion** — defeating Steps 1–4 of §11.
4. **The deploy's own smoke check curls `/api/v1/health`**, the endpoint that returns 200 unconditionally (PR #5, defect 2). So the gate that decides whether a deploy "succeeded" cannot detect an unready service. PR #5 fixes the *container* HEALTHCHECK; this curl is a separate line in the deploy script and is **not** changed by it.

### What would happen today, before reconciliation

Production `main` is divergent from `origin/main` and prod runs git 2.43.0 with `pull.rebase` and `pull.ff` **unset**, so `git pull` on a divergent branch **refuses** (`fatal: Need to specify how to reconcile divergent branches`). The workflow does not set `script_stop`, so on the action's default the script continues past the failure. Either way the outcome is bad:

- **If the script continues:** `docker compose up -d --build` rebuilds and restarts production from the **old, unchanged** checkout, `db:migrate` runs against it, and the job prints `Deploy successful` — an unattended restart of production reported as a successful deploy that shipped nothing.
- **If it aborts:** the deploy fails after having attempted a pull on the live checkout.

Once the divergence is reconciled (PR #4 + accelerator landed), the pull succeeds — and then merges really do ship code and run migrations unattended.

### Required decision before any merge

This is a production-infrastructure change and therefore a governance boundary; it is **not** something to fix unilaterally. Options, in order of preference:

| Option | Effect | Cost |
|---|---|---|
| **A. Add a GitHub environment with a required reviewer** to the `deploy` job (`environment: production`), so merges queue a deploy that waits for explicit approval | Preserves the existing flow, makes every deploy an authorized act, and makes the §11 sequence enforceable | One workflow edit + one repo setting |
| **B. Gate the deploy on a tag or a manual `workflow_dispatch`** instead of push-to-main | Fully decouples merge from deploy | One workflow edit; changes team habits |
| **C. Temporarily disable the deploy job** for the duration of the release, re-enabling it after | Simplest; unblocks merging now | Easy to forget to re-enable |
| **D. Merge nothing until the release window**, accepting that each merge deploys | No changes | Removes the ability to land #4/#5 early, and still auto-migrates |

Separately, and regardless of which option is chosen: **`db:migrate` should not run unattended in the same step as a code deploy**, and the deploy's readiness curl should target `/api/v1/health/ready` rather than `/api/v1/health`.

### Consequence for §10 and §11

**§10's order and §11's sequence remain correct in substance, but neither can be executed safely until this is resolved.** Treat this as prerequisite zero, ahead of PR #4. No PR should be merged — including PR #5 and PR #4 — until the merge-to-deploy coupling is decided.

## 14. Current PR set, heads and dependencies
> **Superseded by §19.1** for the heads, and §19.2 for the order.

Verified against `origin` at the time of writing.

| PR | Branch | Head | Base | State | What it is |
|---|---|---|---|---|---|
| **#7** | `fix/separate-release-from-merge` | `9b08e13` | `main` | open | **Resolves §13.** Removes auto-deploy from `ci.yml`; adds manual `release.yml` + `migrate.yml`; adds `releasePreflight.js` that refuses Phase 1 alone |
| **#6** | `feat/accelerator-bonfire-read-integration` | `a3a451a` | `main` | open | Preserves the **already-running** Enterprise v1 integration (`read:bonfire_source`, `/best-fit`). All code/test files byte-identical to production |
| **#5** | `fix/healthcheck-readiness-not-rate-limited` | `668342c` | `main` | open | Probes get their own bounded rate-limit bucket; probe targets `/health/ready` instead of the unconditional `/health` |
| **#4** | `recovery/prod-ingestion-source-health` | `486630f` | `main` | **draft** | Preserves the production-only ingestion source-health monitor |
| **#3** | `feat/gov-phase2-persistence-and-v2-api` | `a956725`+ | **#2's branch** | open | Phase 2: evidence persistence, canonical identity, `/api/v2/gov-opportunities` |
| **#2** | `feat/gov-deadline-parser-and-contract-v1` | `b9b8905` | `main` | open | Phase 1: timezone-correct parser + `gov-opportunity.v1` contract |

### Dependencies

- **#7 gates everything.** Until it lands, merging any PR deploys production unattended and runs `db:migrate`.
- **#4 + #6 together** make `origin/main` a superset of production *code and test*. Neither alone is sufficient; §9 has the measurement.
- **#3 depends on #2** and must be retargeted to `main` after #2 merges.
- **#5 and #7 are independent** of the gov stack — no file overlap.
- `PROGRESS.md` conflicts between #4, #6, #2 and #3. **Resolution is always union — keep every entry.** Rehearsed; see §15.

### Landing mechanics — unchanged

1. **#2 merges with a merge commit**, never squash.
2. **Retain `feat/gov-deadline-parser-and-contract-v1`** until #3 is retargeted.
3. **Retarget #3 to `main`**, inspect the diff (Phase 2 paths only), **re-run checks and re-review** on the new base.
4. **Merge #3.**
5. **Deploy #2 and #3 together, only after release authorization.** Never #2 alone — now enforced by preflight, not merely intended.

### Pending decisions

| Decision | Owner | Blocking |
|---|---|---|
| Create the GitHub `production` environment **with required reviewers** | repo admin | #7's approval gate is inert without it |
| Review and un-draft **#4** | reviewer | production reconciliation |
| Review **#6** (code already live in production) | reviewer | production reconciliation |
| Branch protection on `main` (currently none) | repo admin | optional, recommended |
| Rotate/relocate plaintext env backups in the prod deploy directory | ops | hygiene, not release-blocking |
| Whether `/metrics` should also leave the general rate-limit bucket | reviewer | not release-blocking |

## 15. Combined-release rehearsal
> **Superseded by §19.7**, which rehearses the corrected order with #7 first.

Performed in an isolated `git worktree` off `origin/main`. **The production checkout was never touched.**

Merge order: **#4 → #6 → #5 → #7 → #2 → #3.**

| Conflict | Times | Resolution |
|---|---|---|
| `PROGRESS.md` | 3 (at #6, #2, #3) | **Union — every entry kept.** Both the recovery entry and the accelerator entries survive in the final tree, alongside all four gov entries |
| `backend/src/bonfire/bonfire.service.js` | 1 (at #3) | `module.exports` list only: #6 added `listBestFitOpportunities`, #3 added `recordGovEvidence` and `resetGovEvidenceCapability`. **Both kept** |
| anything else | 0 | — |

The single code conflict across the entire five-PR stack is an export-list collision. There is no logic conflict between the Enterprise v1 integration and Phase 2.

**Production functionality survives.** In the fully merged tree, every file production currently runs is byte-identical to production: `sourceHealthMonitor.js`, `scheduler.js`, `sourceHealthMonitor.test.js`, `bonfire.util.js`, `apiKeyAuth.middleware.js`, `bestFit.test.js`, `sourceFieldsScope.test.js`.

**Test evidence on the combined tree:** full suite **2,908 passed / 44 skipped / 215 of 217 suites,
0 failures**; the Postgres suites separately against a disposable `postgres:15-alpine`: **44 passed /
0 skipped / 0 failed**. The `bonfireManualUpload` flake seen on PR #6's branch in isolation does **not**
recur here, because PR #2 carries its root-cause fix.

**Preflight passes on the rehearsed tree** — all three gates (`phase1_requires_phase2`, `production_reconciliation_source_health`, `production_reconciliation_enterprise_v1`), exit 0. The same script refuses the tree if any of #2/#3 or #4/#6 is missing.

## 16. Cross-repository acceptance language — corrected

Earlier drafts of this document treated `sourceLive` as a field that ought to exist in `gov-opportunity.v1` and flagged its absence. That was the wrong frame: **`sourceLive` is an Enterprise-side field, not an OP one.** The two systems each supply different signals and they must not be conflated.

| Supplied by | Field | Meaning |
|---|---|---|
| **Opportunity Pulse** | `data.sourceAvailability` | Record-level. `null` when the last fetch for that record succeeded; `{status: 'degraded', since, reason, servingLastKnownSnapshot: true}` when it failed |
| **Opportunity Pulse** | `meta.sourceSnapshotVersion` | The persisted source-snapshot version for the record. Non-null proves a persisted identity rather than the derivation fallback |
| **Enterprise** | `sourceLive` | Enterprise-side. **Currently indicates configuration, not successful connectivity** — it reports that the integration is configured, not that a call succeeded |
| **Enterprise** | `sourceState` | Enterprise-side rollup of integration state |

**Consequence:** `sourceLive: true` on the Enterprise side is **not** evidence that OP answered. Acceptance must not rest on it.

### Acceptance requires, on the OP side

1. **A matching contract hash** — `GET /api/v2/gov-opportunities/contract` → `data.schemaSha256.committedBlobLf` equal to Enterprise's vendored copy hashed as a **git blob**. If they differ, **investigate the difference; do not automatically re-pin.** A mismatch has previously meant CRLF-vs-LF on the same bytes, not a new schema version.
2. **A real canonical ID** — matching `^op:gov:[0-9a-f]{32}$`, taken from a **list** response, not constructed.
3. **A persisted snapshot** — `/{id}/snapshots` with `meta.recorded >= 1` and a retrievable immutable payload at `?snapshotVersion=N`. Requires the pilot ingestion to have run.
4. **An actual available resolve** — that id round-trips **list → detail** with `200`, `data.canonicalOpportunityId` equal to the id requested, and **non-null `meta.sourceSnapshotVersion`**, which is what distinguishes a persisted identity from the derivation fallback.

### What still blocks qualification approval

**Empty document evidence and empty requirements continue to block qualification approval, unconditionally.** Ingestion observes no solicitation documents at all, so `documents.coverage` is `inaccessible`, all counts are `0`, and `items` / `amendments` / `requirements` are `[]`. That is *not observed* — it is neither a reviewed package nor an absence of requirements. Document coverage and cited requirements must pass **independently**, via the human route in §7. `companyQualification` is always `null`, and `sourceAssessment.isNotEligibilityDetermination` is `true`. **Connectivity does not establish qualification.**

## 17. Credential coordination

| | |
|---|---|
| Enterprise side | Preparing a dedicated **`OPPORTUNITY_PULSE_V2_API_KEY`**, split from the v1 credential (Enterprise PR #2844 at `706e9521`; its CI and secret scan reported passing). **v2 has no fallback to v1.** |
| OP side | Will mint **one** key scoped **`read:gov_opportunities` only**, at activation Step 7, as its own authorized action |
| **The existing v1 credential and its scope are preserved unchanged** | `read:bonfire_source` is **not** replaced, reissued or widened. The live v1 integration keeps working exactly as it does today |
| Delivery | Out of band. Never into a transcript, ticket, log or PR. Only the key prefix and scope set are recorded |
| Not done | No credential has been minted. This is activation Step 7 and requires release authorization |

Because v2 has no fallback to v1, the v2 key must exist **before** Enterprise switches its v2 calls on — and the v1 key must remain valid throughout, since it serves a different, already-live surface.

## 18. Enterprise handoff package (after release authorization)

To be supplied once the release is authorized and the pilot has run:

1. **The deployed commit SHA** — the exact merge commit containing both #2 and #3, as dispatched through `release.yml`.
2. **The v2 base URL** — same host as the existing v1 integration.
3. **The `read:gov_opportunities`-only credential**, delivered securely out of band; v1 credential untouched.
4. **The confirmed schema hash** — `26ff667e…` as the committed LF blob, cross-checked against Enterprise's vendored copy. Investigate any difference rather than re-pinning.
5. **A real canonical ID** with its **persisted snapshot** and a **successful list → detail verification**, including non-null `meta.sourceSnapshotVersion`.

Plus the standing caveat: empty documents/requirements still block qualification approval.

## 19. CORRECTED release checklist — supersedes §10, §11, §14 and §15

Earlier sections had the activation order wrong: they dispatched the code release **before** pause/drain and migration. That would have started the corrected parser against the old schema. §19 is authoritative.

### 19.1 Exact PR heads

| PR | Branch | Head | Base | State |
|---|---|---|---|---|
| **#7** | `fix/separate-release-from-merge` | **`fe4d0c7`** | `main` | open |
| **#4** | `recovery/prod-ingestion-source-health` | **`486630f`** | `main` | **draft** |
| **#6** | `feat/accelerator-bonfire-read-integration` | **`a3a451a`** | `main` | open |
| **#5** | `fix/healthcheck-readiness-not-rate-limited` | **`668342c`** | `main` | open |
| **#2** | `feat/gov-deadline-parser-and-contract-v1` | **`b9b8905`** | `main` | open |
| **#3** | `feat/gov-phase2-persistence-and-v2-api` | **`2751c2f`** | **#2's branch** | open |

### 19.2 Landing order — actual merges

| Step | Action | Evidence required at this gate |
|---|---|---|
| **L0** | Create the GitHub environment **`production` with required reviewers** | The environment exists and lists at least one reviewer. **Prerequisite to any dispatch** — both production-changing jobs declare `environment: production`, but an environment that exists *without* reviewers is not a gate |
| **L1** | **Merge #7** (`fe4d0c7`) **with a merge commit** | CI green on the head; `ci.yml` contains no `appleboy/ssh-action`, no `DEPLOY_SSH_KEY`, no `refs/heads/main` |
| **L2** | Review, **un-draft, and merge #4** (`486630f`) | Human review recorded. Three preservation blobs still byte-identical to production |
| **L3** | Review and **merge #6** (`a3a451a`). Resolve the `PROGRESS.md` conflict by **union — keep every entry** | Human review recorded. Nine code/test files byte-identical to production |
| **L4** | **Merge #5** (`668342c`) | CI green; `healthLimiter.test.js` 8/8 |
| **L5** | **Merge #2** (`b9b8905`) **with a merge commit**, never squash. **Retain its branch** | The merge commit exists; `feat/gov-deadline-parser-and-contract-v1` still present on origin |
| **L6** | **Retarget #3 to `main`** (`gh pr edit 3 --base main`) | PR #3 base is `main` |
| **L7** | **Inspect the resulting diff**: `git diff --stat origin/main...origin/feat/gov-phase2-persistence-and-v2-api` | Lists **only Phase 2 paths**. Phase 1 paths appearing means L5 did not use a merge commit |
| **L8** | **Fresh checks and fresh review on the new base** | A new CI run against the retargeted base, plus a new human approval. A `mergeable` flag is **not** review |
| **L9** | **Merge #3** | The merge commit SHA — this is the release candidate |
| **L10** | Delete the two gov feature branches | — |

After L9, record the release-candidate SHA. Everything in 19.3 uses that one SHA.

### 19.3 Activation order — corrected

**Migration comes before code rollout.** The migration is additive, so the currently-deployed code is unaffected by the new nullable columns and tables; deploying code first would instead open a window where new code expects columns that do not exist.

| Step | Action | Machine-verified | Reviewer must verify |
|---|---|---|---|
| **A1** | **Pause scheduled ingestion.** Set `BONFIRE_ENGINE_ENABLED=false` and disable `INGESTION_SCHEDULE` in `.env.prod`; restart so no scheduler is armed | — (a production config change, done by an operator) | `/api/v1/bonfire/flag` returns `enabled:false` |
| **A2** | **Drain in-flight ingestion** | `migrate.yml` asserts `ingestion_logs` `status='running'` is **0 across two reads 60 s apart**, and that `BONFIRE_ENGINE_ENABLED != true` | No terminal-status run was killed mid-write |
| **A3** | **Backup, and restore-test it** | `migrate.yml` asserts the artifact at `backup_path` **exists** and exceeds **1 MiB** | **That the restore was actually performed into a scratch database and row counts matched.** No workflow can prove this; `backup_restore_evidence` is an operator assertion, recorded in the run summary |
| **A4** | **Fresh baseline counts** | `migrate.yml` records total / with-`close_date` / still-open **before and after**, and **fails** if any row is marked verified after | The before-counts are from *now*, not carried over from 2026-09-29 |
| **A5** | **Apply the additive migration** — dispatch `migrate.yml` with the L9 SHA | Checks out the SHA, **asserts HEAD matches**, **builds the image from it**, proves the artifact contains the migration, runs it in a **one-shot container** (`docker compose run --rm --no-deps -T backend`), and **does not restart the serving container**. Fails on any pending-status, verified-count, or immutability-trigger anomaly | The SHA is the reviewed release candidate from L9 |
| **A6** | **Roll out the combined code** — dispatch `release.yml` with the same SHA | Preflight refuses **Phase 1 alone** and refuses a tree missing the production-only monitor or the Enterprise v1 tests. Then: detached checkout + HEAD assertion; **refuses if any migration is still pending** ("run migrate.yml BEFORE deploying"); **verifies ingestion is off and nothing in flight before rollout**; polls `/api/v1/health/ready`; **re-verifies the ingestion flag after** the rebuild, since a rebuild re-reads `.env.prod` | `confirm: DEPLOY` was typed deliberately; the SHA matches A5 |
| **A7** | **Verify v1 and v2** | — | v1 unchanged: `/api/v1/bonfire/opportunities`, `/best-fit`, `/opportunities/:id`; `read:bonfire_source` still gates un-redaction. v2: `/contract` → 200 with the LF hash; no credential → **401**; a `read`-only credential → **403** |
| **A8** | **Provision the scoped credential — its own authorization step** | — | See §19.4. **Not part of A6** |
| **A9** | **One-opportunity Utah pilot**, scheduler still unarmed | — | See §19.5 |
| **A10** | **Resume broader ingestion** — a separate authorization after pilot evidence is accepted | — | Re-arming the scheduler is its own decision |

**Why this order prevents every write in the interval:** between A1 and A9 the scheduler is unarmed and `BONFIRE_ENGINE_ENABLED` is false; `migrate.yml` refuses to run unless both are true *and* nothing is in flight; `release.yml` re-checks both before rolling out and re-checks the flag after; and `release.yml` refuses outright while any migration is pending. The only writer that could touch opportunity rows in that window is a scrape, and no scrape can start.

### 19.4 Credential provisioning — separate from deployment (A8)

Previously numbered inside the code-release step, which was wrong. It is its own authorization.

- Mint **one** key scoped **`read:gov_opportunities` only**.
- **Preserve the existing v1 key and its `read:bonfire_source` scope unchanged** — not replaced, not reissued, not widened. It serves a different, already-live surface.
- Enterprise's side is `OPPORTUNITY_PULSE_V2_API_KEY` (their PR #2844 at `706e9521`), which has **no fallback to v1**, so the v2 key must exist before Enterprise switches v2 calls on, and v1 must keep working throughout.
- **Never exposed in logs, run output, PR bodies, tickets or handoff documents.** Delivered out of band. Only the **key prefix** and the **scope set** are ever recorded.
- Requires its own authorization. Not done.

### 19.5 The authorized pilot (A9)

- **One** portal (`utah`), **one** opportunity already present in `bonfire_opportunities`. Not the 1,698 Utah rows, not a new portal, not a corpus re-fetch.
- **Enforced, not intended:** run the scraper for that single `external_id` with the scheduler **still disabled** and `BONFIRE_ENGINE_ENABLED` still false. The gate is that the scheduler stays unarmed.
- Expected changes, stated in advance: **1** `bonfire_opportunities` row (source columns and, if the observation verifies, `close_date` plus deadline-evidence columns — **`close_date` may move by hours**, which is the corrected parse); **1** `gov_canonical_opportunities` row; **1–2** `gov_source_aliases`; **1** `gov_source_snapshots` at version 1. Nothing else, because ingestion is keyed on `external_id`.
- Evidence retained under `docs/gov-phase2/activation-evidence/`: row before/after, snapshot payload, the immutability rejection, and list → detail resolution.

### 19.6 Rollback that preserves snapshots

1. **Code rollback first, and sufficient for most failures:** dispatch `release.yml` with the previous SHA. The evidence columns and tables are additive, so the prior code runs correctly with them present and populated.
2. **Do not drop the evidence tables as routine rollback.** `gov_source_snapshots`, `gov_canonical_opportunities` and `gov_source_aliases` hold the only record of what was observed, including superseded deadline values. Dropping them destroys the audit history this phase exists to create and is not recoverable from the application.
3. If the schema genuinely must be removed: **export those three tables to a retained dump first**, record where it lives, then run the migration's `down` (proven to leave `close_date` intact by `govPhase2Migration.integration.test.js`). Treat it as data destruction requiring its own authorization.
4. A single wrong published deadline after the pilot is remedied by re-running ingestion for that one `external_id` — the write is idempotent and **appends** a new snapshot rather than editing the old one.
5. **No corpus-wide re-fetch and no historical deadline correction**, in rollback or activation.

### 19.7 Rehearsal of the corrected landing order

Performed in an isolated worktree off `origin/main`; **production checkout never touched**. Order **#7 → #4 → #6 → #5 → #2 → #3**.

| Step | Result |
|---|---|
| #7 | fast-forwarded **in this local rehearsal only** (its base is `origin/main`, which had not moved). **Not a merge policy** — the intended GitHub method is a **merge commit**; see §20 |
| #4 | clean |
| #6 | `PROGRESS.md` conflict → **union, every entry kept** |
| #5 | clean |
| #2 | `PROGRESS.md` conflict → **union, every entry kept** |
| #3 | `PROGRESS.md` **and** `backend/src/bonfire/bonfire.service.js` → both **union**; the service conflict is the `module.exports` list only (#6's `listBestFitOpportunities` + #3's `recordGovEvidence` / `resetGovEvidenceCapability`), **both kept**, `node --check` clean |

Recorded resolutions: **`PROGRESS.md` is always union — never take one side.** The `bonfire.service.js` conflict is always both export lists. No other file conflicts, and there is no logic conflict between the Enterprise v1 integration and Phase 2.

Preflight passes on the corrected-order tree: all three gates, exit 0. Full suite on that tree:
**2,908 passed / 44 skipped / 215 of 217 suites, 0 failures** — identical to the first rehearsal, so the
reordering changed nothing functionally.

### 19.8 Remaining blockers

| Blocker | Kind |
|---|---|
| `production` environment with required reviewers does not exist | **repository setting** — cannot come from a PR |
| PR #4 is draft with 0 reviews | human review |
| PR #6 has 0 reviews | human review |
| `main` has no branch protection | repository setting, recommended |
| Localhost rate-limit burst source unidentified | **separate follow-up.** The app logs nothing for rate-limited requests, so the source is not attributable without request-level evidence. Not attributed here. PR #5 isolates the probe from it regardless |
| Plaintext env backups in the production deploy directory | ops hygiene |
| `/metrics` shares the general rate-limit bucket | not release-blocking |

## 20. Review-item closure evidence

Each item implemented and executed, not described. PR #7 head **`fe4d0c7`**.

| Requested fix | Implementation location | Verification result | Tested SHA |
|---|---|---|---|
| **1a.** Replace `!= true` with explicit validated false | `.github/workflows/release.yml` + `migrate.yml`, shared `need_false()` helper requiring the exact lowercase string `false` for `BONFIRE_ENGINE_ENABLED`, `BONFIRE_SCRAPER_ENABLED`, `BONFIRE_SCRAPER_CRON_ENABLED`, `INGESTION_SCHEDULER_ENABLED` | Both workflows parse; all 7 extracted step scripts pass `bash -n` | `fe4d0c7` |
| **1b.** Demonstrate the scheduler is disabled | `backend/src/ingestion/scheduler.js` — **new** `INGESTION_SCHEDULER_ENABLED=false` gate, checked *before* cron validation. It had **no off switch**: `INGESTION_SCHEDULE` only changed the expression and unsetting it fell back to `0 6 * * *`. Workflows additionally require the container to have logged `ingestion_scheduler_disabled` within 24 h, proving the flag took effect | `backend/tests/unit/ingestionSchedulerGate.test.js` **7/7** — arms by default; refuses on `false`/`FALSE`/`False`; a typo (`flase`, `no`, `0`, `off`) still **arms** so ingestion cannot be silently killed; an explicit `schedule` argument cannot bypass it; the gate precedes cron validation | `fe4d0c7` |
| **1c.** Prevent other ingestion entry points from writing | Behavioural catch-all in both workflows: `ingestion_logs` count, `bonfire_opportunities` count, and an **md5 checksum over `(id, close_date)`** captured before and compared after. `release.yml` re-runs the entire freeze check **after** rollout, because a rebuild re-reads `.env.prod` | Any writer by any entry point (scheduler, admin scrape route, manual upload, rescoring job) breaks the comparison and aborts the run. Scripts syntax-clean | `fe4d0c7` |
| **2.** Replace "restore verification is irreducibly human" | `migrate.yml`: new required `backup_sha256`; `sha256sum` recomputed on the server and mismatch aborts; the dump is **restored into an isolated scratch database** (`pg_restore` or `psql` by format), row **and** `close_date` counts compared against live, restored schema asserted `>10` tables, scratch DB dropped via `trap` on every exit path | Replaces file-existence and `>1 MiB`, which are now gone. Implemented and syntax-verified; the restore itself executes only at activation | `fe4d0c7` |
| **3.** Prove the migration actually ran | `migrate.yml` proof block: exactly **1** `SequelizeMeta` row for `20260929000001`; **5** gov tables; **≥24** `close_date*` columns; unique `canonical_public_id` index; trigger present; row count **and** `(id, close_date)` checksum unchanged; `ingestion_logs` unchanged; **0** rows verified; all **5** evidence tables empty | **EXECUTED against a real migrated Postgres 15** built to the production pre-migration shape (one `close_date` column, 3 seeded rows): `SequelizeMeta=1`, `gov tables=5`, `close_date* columns=24`, `unique index=1`, `trigger=1`, all five evidence tables `=0`, `rows=3` unchanged, `deadline_checksum=5a373c39…`, `verified=0` | migration from `af41c35`; assertions run 2026-09-30 |
| **4.** Exercise immutability on a real snapshot in a rolled-back transaction, asserting the specific error | `migrate.yml`: `BEGIN` → insert a canonical row → insert a snapshot → `UPDATE` it → assert message `gov_source_snapshots is append-only`, assert `INSERT 0 1` so a row really existed, assert both tables empty afterwards | **EXECUTED**: `INSERT 0 1` twice, then `ERROR: gov_source_snapshots is append-only (attempted UPDATE on snapshot 233fe88b-…)` from `gov_source_snapshots_immutable() line 3 at RAISE`; snapshots after = **0**, canonical after = **0**. Re-verified in the indented single-command form actually shipped | migration from `af41c35`; assertions run 2026-09-30 |
| **5.** Correct "#7 fast-forwards" | §19.7 corrected below | See §19.7 note and the verification in the next row | — |
| **5b.** Verify post-#7 `main` cannot auto-deploy | `.github/workflows/ci.yml` with the deploy job removed | On the rehearsal tree **with #7 merged**: `ci.yml` has **8** jobs, **0** `appleboy/ssh-action` references, **no** deploy-named job, and **no** job gated on `refs/heads/main` | rehearsal `53e0582` (= corrected order + `fe4d0c7`) |

### Postgres integration provenance — the question asked

**44/44 has now been rerun on the corrected-order tree**, at rehearsal head **`53e0582`** (corrected landing order **plus** PR #7 at `fe4d0c7`), against a disposable `postgres:15-alpine`: **2 suites, 44 passed, 0 skipped, 0 failed.**

To be exact about what was previously reported: the earlier 44/44 was run on the **first** rehearsal tree (`85c6b84`, order `#4 → #6 → #5 → #7 → #2 → #3`). On the corrected-order tree only the full suite had been run, and that run *skips* the two Postgres suites. So the figure was carried-over evidence until this run.

The full suite on the corrected tree remains **2,908 passed / 44 skipped / 0 failures**; the 44 skipped are exactly these two suites when `PHASE2_TEST_DB_URL` is unset.

### §19.7 correction — merge method

"**#7 fast-forwards**" described **local rehearsal behaviour only**: `git merge` fast-forwarded because #7 branches directly from `origin/main` and `main` had not moved. It is **not** a merge policy.

**Intended GitHub merge method for #7: a merge commit** (`gh pr merge 7 --merge`), consistent with every other PR in this release and with the repository's enabled methods (merge, squash and rebase are all available, so the choice must be made deliberately).

Why merging #7 first is safe: for a `push` event GitHub runs the workflow files **as they exist in the pushed commit**. The merge commit for #7 contains #7's `ci.yml`, which has no deploy job — so the very push that lands #7 cannot trigger the old deploy path. Verified structurally in the row above; it cannot be executed without merging, which is not authorized.

---

## Pre-flight: tool preconditions (run BEFORE stopping the service)

Post-rollout verification parses scheduler evidence with `python3` on the
**deploy host** — `scripts/release/check_scheduler_evidence.py` is executed
there by `verify-release.sh`, not on the GitHub runner.

`release.yml` guards this at the top of its SSH script, but by then the operator
has already stopped `op-backend`, so a missing interpreter would be discovered
after downtime had begun. Run this **read-only** check before stopping anything:

```bash
ssh root@<deploy-host> 'command -v python3 && python3 --version'
```

Expected: a path and a version. If it prints nothing, **do not stop the
service** — the release would roll out and then fail verification for a reason
unrelated to the release itself.

Last verified: 2026-10-01, `/usr/bin/python3`, Python 3.12.3.

This check writes nothing, touches no container, and is safe to run at any time.
