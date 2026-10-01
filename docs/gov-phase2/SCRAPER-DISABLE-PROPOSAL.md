# Proposal: disable `BONFIRE_SCRAPER_ENABLED` while preserving v1 reads

**Status: proposed, not applied.** No configuration change is authorized by the work that produced this document.

## Why consider it

`BONFIRE_SCRAPER_ENABLED=true` makes `POST /api/v1/bonfire/scrape/run` reachable by any authenticated admin. During a paused release that is the one remaining write path into the Bonfire and Phase 2 surfaces, and it is held **procedurally** — by instruction — rather than by configuration. The scheduled paths are already off.

Setting it `false` converts a procedural hold into a configuration one.

## It does not affect v1 reads

Verified by tracing, not inferred from the shared `BONFIRE_` prefix:

- `BONFIRE_ENGINE_ENABLED` gates the v1 surface. `bonfire.middleware.js:7` 404s every bonfire route when it is off, and `server.js:259` mounts the router under it. **This flag is not touched by this proposal.**
- `BONFIRE_SCRAPER_ENABLED` is read only by `scraper/config.js:105` (`isScraperEnabled`), consumed in `scraper.routes.js:13`, `scraper.controller.js:13,17`, and the scraper scheduler. **It gates nothing outside `/scrape/*`.**

Enterprise's v1 consumer reads opportunity data through the v1 Bonfire API. It does not call `/scrape/*`.

## Affected endpoints

| Endpoint | Today | After | Notes |
|---|---|---|---|
| `GET /api/v1/bonfire/scrape/flag` | `200 {"enabled": true}` | `200 {"enabled": false}` | Mounted **before** the gate; stays reachable by design so callers can probe |
| `POST /api/v1/bonfire/scrape/run` | admin-only, runs a scrape | **404** | Also has a second `503` guard inside `triggerRun` |
| `GET /api/v1/bonfire/scrape/status` | admin-only | **404** | |

**No other endpoint changes.** Every other `/api/v1/bonfire/*` route is unaffected.

## Affected UI

**None.** No frontend code calls `/scrape/*`. The only two frontend files mentioning the scraper are `BonfireDetailPanel.jsx` (a comment describing attachments as scraper-fed) and `BonfirePortalScreenshotZone.jsx` (user-facing copy explaining that Cloudflare blocks the scraper). Both are text; neither issues a request.

Scraped data already in the database continues to display normally — this disables *collection*, not *reading*.

## Restart requirement

**A container recreate is required.** The flag reaches the container through the compose `environment` map, which is evaluated at container creation, so a running container cannot observe a change to `.env.prod`.

The scheduler re-reads the flag on every cron fire, but that only matters for a process whose environment can change — not a Docker container. Expect a short interruption equal to a recreate, not a rebuild, since the image does not change.

The pause controls must be preserved through the recreate and read back from the new container afterwards, exactly as the ingestion pause was.

## Verification after applying

1. `docker exec op-backend printenv BONFIRE_SCRAPER_ENABLED` → `false`
2. All three pause controls still `false` in the new container
3. `GET /api/v1/bonfire/scrape/flag` → `200` with `{"enabled": false}`
4. `POST /api/v1/bonfire/scrape/run` without authentication → `404` (gate precedes auth)
5. **v1 preserved:** `GET /api/v1/bonfire/flag` → `200`, and the Enterprise read-only v1 regression still returns `source=live, count=10`
6. `GET /api/v1/health/ready` → `200`, container health `healthy`
7. Data baselines unchanged across the recreate — the same nine measurements the release path compares
8. Boot logs show `Bonfire scraper disabled — scheduler not started` rather than the cron-disabled variant

The release workflow's observed-baseline check would need its expected value updated in the same change, or it will correctly report drift. That is the drift detector working, not a fault.

## Rollback

Set `BONFIRE_SCRAPER_ENABLED=true` in `.env.prod` and recreate. No image change, no migration, no data change — the flag is read at startup and gates routing only, so reverting restores the previous surface exactly.

A `.env.prod` backup at mode 600 should be taken before the edit, as was done for the ingestion pause.

## What it does not achieve

- **It is not a write freeze.** Ordinary authenticated admin API writes elsewhere are unaffected.
- **It does not make Phase 2 inactive.** The gov evidence capability is a runtime probe over the `gov_*` tables and has been available since the migration. Disabling the scraper removes the most likely trigger, not the capability.
- **It does not stop ingestion generally.** Generic ingestion is governed by `INGESTION_SCHEDULER_ENABLED`, already `false`.

## Recommendation

Worth doing, with one caveat: it trades a procedural hold for a configuration hold at the cost of a container recreate and a brief interruption. If a manual scrape is expected to be authorized soon, the recreate cost will be paid twice. If the hold is open-ended, applying it removes a standing write path that currently depends on nobody invoking it.

**Not applied. Requires explicit authorization**, and should be sequenced with any credential rotation, since rotating the Bonfire passwords is easiest while the scraper cannot run.
