# Pre-migration write freeze — approved approach, operational detail

**Nothing here has been executed.** Approach accepted in principle: a stopped-backend maintenance window, no separate pause-control release.

## Why the freeze is a stopped container, not a flag

`INGESTION_SCHEDULER_ENABLED` exists only in this release. **Production at `6936c99` does not read it.** Setting it would leave `docker exec op-backend printenv` reporting `false` while the old scheduler stayed armed — a gate that *passes while the thing it gates is still running*. Requiring its log line instead would block activation permanently.

`op-backend` is the only container running application code (`frontend` serves static assets, `backup` runs `pg_dump`, metrics services read). Stopping it prevents every write path at once — cron schedulers, the manual scraper trigger, CSV/JSON ingest, document upload, rescoring, deep-vet, any admin API call — with no route inventory required, because none of them has a process to run in.

**The migration runner cannot restart any of it.** `backend/Dockerfile` declares `CMD ["scripts/docker-entrypoint.sh"]` and **no `ENTRYPOINT`**; that script ends in `exec node src/server.js`. `docker compose run --rm --no-deps -T backend npx sequelize-cli db:migrate` replaces `CMD`, so the server and every scheduler never start. `migrate.yml` asserts the image has no `ENTRYPOINT` rather than trusting it.

---

## 1. Drain before stopping — and abort rather than force-stop

**Draining is an operator step performed while the backend is still up.** Order matters: you cannot drain a stopped process.

1. Stop *new* work from starting, then watch until nothing is in flight:
   `select count(*) from ingestion_logs where status = 'running';` must read **0**, and stay 0 across two reads a minute apart.
2. Only then stop the container, and stop it **gracefully** with room to finish:
   `docker compose -f docker-compose.prod.yml stop -t 60 backend`.
3. **Never** `kill`, and never `stop -t 0`. If a run will not finish, leave it alone and reschedule the window.

**`migrate.yml` enforces the outcome.** By the time it runs the writer is already stopped, so any row still in `status='running'` can only mean a run was *interrupted*. That is an **abort**, not a warning:

```
ABORT: N ingestion run(s) still marked running while op-backend is stopped.
  A writer was force-stopped mid-run. Do NOT migrate.
  Restart op-backend on the previous image, let the run reach a terminal
  status, drain again, then stop it gracefully and re-dispatch.
```

Migrating over a half-written ingestion run would bake its partial state into the baseline that every later comparison trusts.

## 2. The freeze persists between the two approvals

Migration and release are **separately approved**, so the window spans a human gate.

- `migrate.yml` never starts the backend. It uses `compose run --rm --no-deps` only, and **asserts at the end** that `op-backend` is still absent from `docker ps`, failing if anything restarted it.
- `release.yml` **asserts at the start** that `op-backend` is not running, so it cannot be dispatched into a half-recovered state.
- Both workflows share one serialization group — `concurrency: { group: production-release, cancel-in-progress: false }` — so a migration and a release can never interleave, and two releases cannot race.
- `ci.yml` has no deploy path at all after PR #7, so no merge can restart or replace the container.

**What this does not cover:** a human running `docker compose up -d` on the server by hand. The concurrency group serializes *workflows*, not people. Announce the window and keep off the box.

### Outage duration is an estimate, not a guarantee

**The outage runs from the stop until the approved release completes readiness.** Because the release needs its own approval, that span includes human response time and is **not bounded by the technical work**.

- *Technical work*, with the image pre-built outside the window: roughly **2–4 minutes** — additive DDL on ~5.3k rows (seconds), plus container start and readiness polling.
- *Actual outage*: technical work **plus** however long the release approval takes.

Treat 2–4 minutes as the machine time only. If the release approval will not be immediate, do not open the window.

## 3. Recovery — precise

### The rollback anchor

Both workflows capture the **immutable image ID** the running container was created from, **before** any candidate build, and print it:

```
PREV_IMAGE="$(docker inspect -f '{{.Image}}' op-backend 2>/dev/null || echo none)"
```

Recovery uses **that ID**, never a tag: `backend:latest` moves when the candidate is built. `migrate.yml` also writes it to the run evidence.

### What is and is not restored

| Failure point | Action | Schema | Data |
|---|---|---|---|
| Drain or freeze check fails | Nothing has run. Restart `PREV_IMAGE` | untouched | untouched |
| Migration fails **before commit** | Restart `PREV_IMAGE` | untouched — the migration runs in a transaction | untouched |
| Migration **committed**, later problem | Restart `PREV_IMAGE` | **The additive schema REMAINS.** 23 nullable columns + 5 empty tables + trigger persist. Safe: the old code ignores them | untouched |
| Rollout fails readiness | Redeploy `PREV_IMAGE` | additive schema remains | untouched |
| Regression after the window | `release.yml` with the previous SHA | **Never drop the evidence tables as routine rollback** | preserved |

So "schema and data untouched" applies **only where the migration did not commit**. After a successful migration the additive schema is permanent until deliberately reversed, and reversing it is its own authorized action requiring the three evidence tables to be exported first.

### Restarting the old image RE-ARMS ingestion

This is the part not to gloss over. The previous image has **no `INGESTION_SCHEDULER_ENABLED` gate**, so starting it re-arms its generic ingestion scheduler.

**Ingestion resumes on recovery unless you prevent it separately.** Consequences:

- The **old parser** can rewrite `close_date` on re-scrape. Existing-values-unchanged proofs taken during the window stop holding the moment the old code runs.
- No evidence rows are written (the old image has no evidence writer), so the gov tables stay empty — but the pilot can no longer be described as the first write to `close_date` since the migration.
- **The pilot-only freeze does not survive this restart.** Do not claim it does. If a rollback happens, the one-record pilot must be re-planned from a fresh baseline.

What you *can* control on the old image:

| Flag | Read by old code? | Effect |
|---|---|---|
| `BONFIRE_SCRAPER_ENABLED=false` | **yes** | Bonfire scraper stays off |
| `BONFIRE_SCRAPER_CRON_ENABLED=false` | **yes** | its cron stays unarmed |
| `BONFIRE_ENGINE_ENABLED=false` | **yes** | engine + strategist scheduler stay off |
| `INGESTION_SCHEDULER_ENABLED=false` | **no** | ignored — the generic ingestion scheduler still arms |

The only flag-level lever against the generic scheduler on the old image is an **invalid** `INGESTION_SCHEDULE`, which makes `startScheduler` log an error and return null. That is a configuration hack, not a designed switch; the designed switch ships in this release.

**Therefore, state the choice explicitly in the recovery decision:**

- **(a)** Restart `PREV_IMAGE` and **accept that ingestion resumes** (with the three readable flags set false to limit it to the generic scheduler), or
- **(b)** Restart `PREV_IMAGE` with an intentionally invalid `INGESTION_SCHEDULE` to keep the generic scheduler unarmed, or
- **(c)** Leave the backend **stopped** — an extended outage — until the problem is fixed and the intended release can go out.

(c) is the only option that preserves a true freeze, and it trades availability for it.

---

## Sequence

Build **before** the window; no image build happens during downtime.

| # | Step | Serving? |
|---|---|---|
| 1 | Record `PREV_IMAGE` (immutable ID) | yes |
| 2 | `docker compose -f docker-compose.prod.yml build backend` — pre-build the candidate | yes |
| 3 | `pg_dump`; record its SHA-256 | yes |
| 4 | **Drain**: `status='running'` reads 0 twice, a minute apart | yes |
| 5 | **Window opens**: `docker compose stop -t 60 backend` | **no** |
| 6 | Dispatch **`migrate.yml`** (release SHA + dump SHA-256). Verifies the freeze, aborts on an interrupted run, restore-tests the dump into a scratch database, migrates via the one-shot runner, proves the result, and asserts the backend is still stopped | **no** |
| 7 | *(separate approval)* Dispatch **`release.yml`** (same SHA). Refuses if any migration is pending, rolls out the pre-built image, waits on `/api/v1/health/ready`, then requires `ingestion_scheduler_disabled` in **this** container's startup logs and validates all four flags as exactly `false` | **no** |
| 8 | **Window closes** when readiness passes | yes |

Enterprise stays on v1 throughout and is unavailable only for steps 5–8. Coordinate before opening.
