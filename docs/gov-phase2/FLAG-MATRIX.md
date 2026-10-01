# Flag matrix — Opportunity Pulse

Every flag the release verification reasons about, traced to its actual consumers in the codebase at `4df1e709`. Written because a release gate demanded a flag combination that would have disabled a live consumer's API, and two flags it asserted do not exist.

## The four control classes

These were previously treated as one list of "flags that must be false". They are not interchangeable.

| Class | What it controls | Verification rule |
|---|---|---|
| **Service availability** | Whether the v1 Bonfire API exists at all | Must match the **approved baseline**. Drift either way fails. |
| **Scraper capability** | Whether manual scraping is *reachable* | Must match the **approved baseline**. Held procedurally, not by config. |
| **Scheduled execution** | Whether anything runs on a timer | Must be **exactly `false`** for a paused release |
| **Phase 2 activation** | Whether gov evidence is written | **No flag exists.** Runtime capability probe. |

## The matrix

| Flag | Purpose | Consumers | Compose default | Paused-release state | v1 reads | Manual writes | Scheduled writes | Phase 2 |
|---|---|---|---|---|---|---|---|---|
| `BONFIRE_ENGINE_ENABLED` | Master gate for the v1 Bonfire surface | `bonfire.middleware.js:7` (404s every bonfire route except `/flag`), `server.js:259` mount, `bonfireStrategist.scheduler.js:16`, `config/environment.js:73` | `false` | **`true`** — service baseline | **Disabling 404s all v1 Bonfire routes** | Prerequisite (routes live under it) | Prerequisite for strategist | None |
| `BONFIRE_SCRAPER_ENABLED` | Scraper capability; mounts `/scrape/*` | `config/environment.js:75` → `isScraperEnabled()` → `scraper.routes.js:13` (404s `/scrape/*`) | `false` | **`true`** — capability baseline | **None** | **Enables `POST /scrape/run`** (admin+token) | Prerequisite for cron | None |
| `BONFIRE_SCRAPER_CRON_ENABLED` | Scheduled scraping | `config/environment.js:76` → `scraper.scheduler.js` (needs enabled **and** cronEnabled; re-read each fire) | `false` | **`false`** — pause control | None | None | **Blocks scheduled scraping** | Indirect |
| `BONFIRE_STRATEGIST_CRON_ENABLED` | Scheduled strategist runs | `bonfireStrategist.scheduler.js:17` (needs engine **and** this) | `false` | **`false`** — pause control | None | None | **Blocks strategist** | None |
| `INGESTION_SCHEDULER_ENABLED` | All three ingesting schedulers | `ingestionPause.js:21`, used by `ingestion/scheduler.js`, `freelance/freelance.scheduler.js` (cron **and** its 15s startup run), `ingestion/research.scheduler.js` | **`true`** | **`false`** — pause control | None | None | **Blocks all generic ingestion** | Indirect |

### Flags that do not exist

| Name | Status |
|---|---|
| `BONFIRE_GOV_EVIDENCE_ENABLED` | **No consumers in `backend/src`. Not wired into compose.** Referenced in earlier release notes as a Phase 2 control; it is not one. |
| `BONFIRE_DEADLINE_VERIFICATION_ENABLED` | **No consumers in `backend/src`. Not wired into compose.** Same. |

Asserting these would be asserting nothing. Release verification must not invent them.

## Phase 2 activation is not a flag

Gov evidence writing is gated by a **runtime capability probe**, `govEvidenceEnabled()` in `bonfire.service.js:293`:

1. Returns `false` if the `GovCanonicalOpportunity` / `GovSourceSnapshot` models are absent.
2. Otherwise runs a real query against `gov_canonical_opportunities` and caches the result.

Since the Phase 2 migration, the tables exist, so **the capability is `true`**. Evidence is written only on the ingestion upsert path (`bonfire.service.js:441`, `:449`).

**Its inactive semantics are therefore "no ingestion runs"** — which the pause controls enforce, and which the gov table counts confirm (all five at 0). There is no setting to assert, and none should be invented.

## What the pause does and does not cover

**Covers:** every scheduled execution path — the daily ingestion runner, the freelance scheduler including its 15-second post-startup run, the research tick loop, scheduled Bonfire scraping, and the strategist.

**Does not cover:**
- **Manual scraping.** `POST /scrape/run` stays reachable by an authenticated admin while `BONFIRE_SCRAPER_ENABLED=true`. Held procedurally.
- **Admin API writes.** Ordinary authenticated write endpoints are unaffected.

**The pause is not a write freeze.** A write freeze is achieved only by stopping the container, which is what the migration window does. Any statement that the pause flags constitute a freeze is wrong.

## Rollback implications

Whether a restored image honours the pause depends on which image it is:

| Image | Honours pause? |
|---|---|
| At or after `f8689d2d` | **Yes** — reads `INGESTION_SCHEDULER_ENABLED` across all three schedulers |
| `da3b986d` (Phase 2, pre-pause) | **No** — no gate; re-arms ingestion. No longer present locally. |
| `1a703bc5` (pre-Phase-2) | **No** — predates the gate entirely |

The blanket claim that "the previous image has no gate" was true when written and is now false for recent images. Check the image before restoring it.
