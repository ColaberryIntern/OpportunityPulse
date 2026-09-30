# Pre-migration write freeze — proposal for review

**Nothing here has been executed.** This describes the mechanism, its downtime and its rollback, for authorization.

## The problem it solves

The activation plan needs a guaranteed write freeze before the additive migration. The flag-based freeze cannot deliver one, for a reason specific to this release:

`INGESTION_SCHEDULER_ENABLED` exists only in the release being prepared. **Production at `6936c99` does not read it.** So:

- Setting it and restarting leaves `docker exec op-backend printenv INGESTION_SCHEDULER_ENABLED` reporting `false` while the old scheduler stays armed. The gate **passes while the thing it gates is still running** — worse than a gate that blocks.
- Requiring its log line instead blocks activation permanently, because old code never emits it.
- Resolving it by rolling out the gate first would mean an extra, separately reviewed production rollout *before* the migration — which the sequence does not describe and which is more change, not less.

The flag is still correct for the *post-rollout* state, where the running code does read it. It is simply unusable as a *pre-migration* control.

## Options considered

| Option | Mechanism | Downtime | Extra prod changes | Reliability |
|---|---|---|---|---|
| **A (recommended)** | Stop `op-backend`, migrate via the isolated one-shot runner, start the new image | ~2–4 min, in one window | none before migration | **Highest** — the freeze is the absence of a running writer |
| B | Ship a "pause-control" release first (adds the gate), pause, migrate, then ship the real release | Two rollouts, each with its own restart | **One extra production rollout of unreviewed-in-prod code** | Lower — depends on the new gate behaving, and doubles the change surface |
| C | Migrate with the app live | none | none | **Rejected** — the additive DDL would survive, but a concurrent scrape under the *old* parser can change `close_date`, destroying the "existing values unchanged" proof and the guarantee that the pilot is the first evidence write |

## Recommended: Option A

`op-backend` is the **only** container that runs application code. Compose services are `postgres`, `redis`, `backend`, `frontend`, `nginx`, `certbot`, `prometheus`, `grafana`, `backup` — of these only `backend` executes app code; `frontend` serves static assets, `backup` runs `pg_dump`, and the metrics services read.

Stopping it therefore prevents **every** write path simultaneously, with no route inventory required, because none of them has a process to run in:

- cron schedulers (bonfire scraper, generic ingestion, strategist, gov scoring, digests, research)
- the manual scraper trigger
- CSV / JSON ingest
- document upload and deep-vet
- rescoring and backfill scripts
- any admin API call

**The migration runner cannot restart any of that.** `backend/Dockerfile` declares `CMD ["scripts/docker-entrypoint.sh"]` and **no `ENTRYPOINT`**; that script ends in `exec node src/server.js`. `docker compose run --rm --no-deps -T backend npx sequelize-cli db:migrate` replaces `CMD`, so the entrypoint script — and therefore the server and every scheduler — never runs. `--no-deps` also stops Compose starting sibling services. `migrate.yml` asserts the image has no `ENTRYPOINT` rather than trusting this.

### Sequence

Build **before** the window so no image build happens during downtime.

1. *(serving)* `docker compose -f docker-compose.prod.yml build backend` — pre-build the release image.
2. *(serving)* `pg_dump` the database; record its SHA-256.
3. *(serving)* Dispatch nothing yet. Confirm the dump's SHA-256 is the value that will be passed to `migrate.yml`.
4. **Window opens:** `docker compose -f docker-compose.prod.yml stop backend`.
5. Verify the freeze: `op-backend` absent from `docker ps`, no stray `backend-run-*` containers, only non-writers up. *(`migrate.yml` does this and refuses otherwise.)*
6. Dispatch **`migrate.yml`** with the release SHA and the dump SHA-256. It restore-tests the dump into a scratch database, records the baseline, migrates via the one-shot runner, and proves the result.
7. Dispatch **`release.yml`** with the same SHA. It refuses if any migration is still pending, rolls out the pre-built image, waits on `/api/v1/health/ready`, then requires `ingestion_scheduler_disabled` in **this** container's startup logs and validates all four flags as exactly `false`.
8. **Window closes** when readiness passes.

Steps 6–7 are the only downtime. With the image pre-built, the window is the migration (additive DDL on ~5.3k rows — seconds) plus container start and readiness.

### Downtime implications

- **The live Enterprise v1 integration is unavailable for the window** — `/api/v1/bonfire/opportunities`, `/best-fit`, `/opportunities/:id`. Coordinate with Enterprise before opening it; their v2 credential has no fallback to v1, and v1 must keep working afterwards.
- The public frontend continues to serve static assets through nginx, but API-backed views will error for the window.
- Prometheus will record the gap; expect alerting noise. The ingestion failure-alerting preserved in PR #4 is itself inside `op-backend`, so it is also paused — it cannot alert on its own absence.

### Rollback implications

| Failure point | Action | Schema state | Data state |
|---|---|---|---|
| Freeze verification fails (step 5) | Nothing has changed; restart `op-backend` on the **old** image | untouched | untouched |
| Migration fails (step 6) | Restart `op-backend` on the **old** image. Service restored on `6936c99` | The migration runs inside a transaction, so a failure leaves the schema unchanged; if it partially applied, run its `down` | untouched — the migration writes no rows, and `migrate.yml` fails if the checksum moved |
| Rollout fails readiness (step 7) | Redeploy the previous image | **Additive columns and empty tables remain.** This is safe: the old code ignores them | untouched |
| Regression found after the window | `release.yml` with the previous SHA | Leave the evidence tables in place | **Never drop the evidence tables as routine rollback** — see handoff §19.6 |

Keeping the previous image available matters: tag or note `docker images` for the current backend image **before** step 1, so step 4's rollback has something to start.

## What the integrity checks do and do not prove

Corrected claim. The before/after comparison covers **selected state only**:

- `bonfire_opportunities` row count
- an md5 checksum over `(id, close_date)`
- `ingestion_logs` row count

It does **not** cover other columns (title, agency, enrichment), other tables, or anything written after the final comparison. It detects a change **after the fact**; it prevents nothing.

So it is a **tripwire that the freeze held**, not the freeze. Prevention is the stopped container. Both are kept because they fail independently: the container check can pass while something writes through a path nobody expected, and the tripwire would then catch it.
