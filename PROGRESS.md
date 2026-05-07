# PROGRESS.md

Implementation progress log for the Opportunity Pulse repository.

This file is the hard-gate verification artifact required by `CLAUDE.md` (see "Logging, Reporting & Progress Tracking"). Every code-touching change to `/backend`, `/frontend`, `/scripts`, `/nginx`, or `/directives` must append an entry here with verification evidence on the same line as the `[x]` mark.

This file was created mid-stream on 2026-05-05; entries before that date are intentionally not back-filled. Forward from this date the gate is enforced.

---

## OIED v9.8 — Drill-down sub-cloud + true sentiment + channel-bucket strip

- [x] Three-pronged fix for the keyword cloud: (1) red→green gradient with gray for unknown — replaces the olive-everywhere look from v9.7; (2) per-channel breakdown card-strip on keyword search results so news matches surface in row 1 instead of being buried 18 pages deep; (3) drill-down sub-cloud above search results that recomputes a focused mini-cloud from the matching opps and lets a click append the sub-word to `q` (multi-needle AND filter).
  - Date: 2026-05-07
  - What changed: `keywordCloud.service` now tracks `sentSum` and `sentCount` separately so sentiment is averaged over sentiment-bearing samples only — non-news sources pass `sentiment: null` and don't dilute the score. New `getDrillDownCloud({q, max})` helper aggregates a sub-cloud from opps that match parent keyword(s) (AND semantics for comma-separated tokens). New endpoint `GET /api/v1/oied/keywords/drill?q=<word>(,<word>...)`. `myOpportunities.service` now: (a) accepts comma-separated `q` and ANDs each token at the SQL level, (b) emits `channelBuckets` (per-channel top-5, recency-sorted for news/talent, priority-sorted otherwise) when `q` is set. Controller threads `channelBuckets` through `paginatedResponse.pagination`. Frontend: new `KeywordDrillCloud` component (clickable refine-by-subword), new `ChannelBucketStrip` on `MyOpportunitiesPage`. `KeywordCloud.jsx` color function rewritten: hue 0→120 (no olive midpoint), gray when `sentiment_known === false`. Cloud read path emits `sentiment_known` from the persisted `sentiment_label === 'unknown'` marker (no schema migration — re-uses existing `VARCHAR(20)` column).
  - Verification: 5 new tests in `tests/oied/keywordDrillCloud.test.js` (empty q, multi-token AND, parent exclusion, sentiment_known true on news, sentiment_known false on non-news). Full OIED suite 33 suites / 459 tests pass. Backend syntax-checked via `node -c`; frontend (incl. new JSX component) syntax-checked via `@babel/parser`. Prod deploy + recompute below.
  - Notes: Re-uses the existing `keyword_trends.sentiment_label` column to mark "unknown" — no migration needed. Drill-down endpoint is read-only and bridge-gated. Multi-needle q is opaque to existing single-token callers (they keep working).

## OIED v9.7 — Trending keywords persistence (validated keyword cloud)

- [x] Replace live keyword-cloud aggregation with twice-daily persisted snapshot. Every word now passes a validation gate (`match_count >= 3` opp matches OR `tool_count >= 1` AI-tool matches) before it can appear in the cloud, so click-throughs are guaranteed to have results. Adds curated industry classification (~80 verticals, `is_industry` flag), a per-word display name (title-cased), and an industries-only UI toggle. Sidebar "Dashboard" link is hidden for admins (single-canonical Mission Control). Cross-channel keyword search now does a per-channel sub-pool (~80 rows × 7 channels) so a click on "healthcare" surfaces matches in news, capital, talent, etc. — not just the most-recently-updated bucket.
  - Date: 2026-05-07
  - What changed: New table `keyword_trends` (migration `20260509000001-oied-keyword-trends.js`) + Sequelize model `KeywordTrend.js` + compute service `keywordTrendCompute.service.js` (validates every candidate against `Opportunity.count` + `AiTool.count` ILIKE, drops zero-match words, persists via `bulkCreate updateOnDuplicate`, soft-retires prior-run rows). Twice-daily cron `keywordTrend.scheduler.js` (default `15 5,17 * * *` UTC) gated by `OIED_KEYWORD_TRENDS_ENABLED`. New admin endpoint `POST /api/v1/oied/keywords/recompute` for on-demand refresh. `getKeywordCloudHandler` now reads from `keyword_trends` first (fallback to live aggregator if empty / >36h stale / table missing), supports `industries_only=true`. `KeywordCloud.jsx` adds Industries-only checkbox, prefers `display_word`, shows "validated · updated <ts>" badge. `myOpportunities.service.js`: per-channel candidate sub-pool when `q` is set. `Sidebar.jsx`: standalone "Dashboard" link hidden for admins (Mission Control = single home). `docker-compose.prod.yml` passes through `OIED_KEYWORD_TRENDS_ENABLED` + `OIED_KEYWORD_TRENDS_CRON`.
  - Verification: 11 new tests in `tests/oied/keywordTrendCompute.test.js` (isIndustryPhrase, toDisplayWord, validateMatchCount, validateToolCount, runKeywordTrendCompute happy + tool-only-keep + zero-drop) + full OIED suite passes (32 suites, 454 tests). Syntax-checked all touched JS via `node -c` and the JSX via babel parser. Prod deploy + migration + cron arming below.
  - Notes: Cron defaults OFF (set `OIED_KEYWORD_TRENDS_ENABLED=true` in `.env.prod` and either wait for next 05:15/17:15 UTC slot or hit `/keywords/recompute` to seed). Read handler tolerates pre-migration state — falls through to live aggregator if `keyword_trends` table missing.

## Governance & docs

- [x] CLAUDE.md hardening: add 9 production-grade sections (Contract Enforcement, Modular Composition, Production Readiness 12-Factor, Idempotency & Replayability, Failure-First Design, Build-Break-Harden Loop, Test Strategy Framework, Observability Framework, Security Enforcement Layer)
  - Date: 2026-05-05
  - What changed: Additive-only edits to `CLAUDE.md`. 14 existing H1 sections preserved; 9 new H1 sections inserted at planned anchors. File grew 383 -> 639 lines.
  - Verification: section-count check (23 H1 headers in expected order); manual cross-section consistency check (Failure-First retries vs Stall infinite-retry-prohibited reconciled via explicit bounded backoff)
  - Notes: Created `PROGRESS.md` itself in the same session per the catch-up rule (Logging section). Prior commits (5d16d5c initial release through c3cc622 OIED v8) are not back-filled.

## OIED v9.1 UX bundle - dashboard, drill-down modals, lifecycle-aware actions, rendered drafts (commit 3f92cf0)

- [x] Address all 6 themed fixes from Ali's round-1 walkthrough feedback: new /admin/oied dashboard, sidebar restructure (Discover/Pursue/Operate), reusable OpportunityDetailModal wired into 3 list pages, lifecycle-aware OpportunityActionButtons (hide proposal/offer when blocked + Review Queue link on success), markdown->HTML rendering in Review Queue with sanitized custom renderer, briefing recipient + daily cron config
  - Date: 2026-05-06
  - What changed: 3 new frontend files (OIEDDashboardPage, OpportunityDetailModal, safeMarkdown util) + 6 modified (App.jsx route, Sidebar.jsx restructure, ActionButtons lifecycle gate, ExecutionQueue/MyOpps/Recommendations modal wiring, ReviewQueue markdown render, index.css review-prose styles). docker-compose.prod.yml passes through OIED_BRIEFING_* and OIED_AUTO_TRIGGERS_* env vars; .env.prod sets OIED_BRIEFING_TO=ali@colaberry.com and arms both crons (BRIEFING_CRON 0 7 * * *, AUTO_TRIGGERS_CRON 0 6 * * *).
  - Verification: react-scripts build compiled clean (+27.94 KB JS, +1.65 KB CSS gzipped); container env vars confirmed via `docker exec op-backend node -e "process.env.OIED_BRIEFING_TO"`; backend logs confirmed both schedulers started ("OIED briefing scheduler started cron=0 7 * * *", "OIED trigger engine scheduler started cron=0 6 * * *"); /admin/oied dashboard route returns HTTP 200; v2 walkthrough HTML at docs/oied-feature-walkthrough-v2.html with 8 fix sections, 32 checkboxes, 0 broken anchors, 0 broken images, V2 AUDIT CLEAN.
  - Notes: The "Email me this" briefing button takes 30-60s on prod due to AI compose; nginx times out at 60s but Mandrill delivery completes async. Trigger engine cron defaults to dryRun=true; flip OIED_AUTO_TRIGGERS_DRY_RUN=false later if real-action mode is wanted.

## OIED documentation - feature walkthrough HTML for Ali

- [x] Add docs/oied-feature-walkthrough.html: self-contained HTML walkthrough documenting v1-v9 features with embedded screenshots, per-feature feedback boxes, status checkboxes, end-to-end use-case flows, External AI Bridge contract, and localStorage-backed feedback persistence with copy-to-clipboard
  - Date: 2026-05-06
  - What changed: New `docs/oied-feature-walkthrough.html` (single self-contained file, embedded CSS, no CDN, sticky TOC, executive navy/white styling). 18 PNGs in `docs/oied-walkthrough-assets/` (17 captured pages + 1 final HTML render). New `backend/scripts/capture-oied-walkthrough.js` reuses the existing oied-strategy-screenshot.js login pattern to grab 12 routes + 3 single-opp detail fixtures (16645 direct_submit, 13283 partner_required + send_outreach, 11048 grounding + lifecycle precedence) + bundle disclosures. New `backend/scripts/validate-oied-walkthrough.js` opens the HTML in headless Chromium and asserts DOM counts.
  - Verification: validation script run output --
      Feature sections: 20, use-case sections: 5, textareas: 26, checkboxes: 80 (= 4 per feature x 20),
      TOC links: 29, sections with id: 29, broken anchors: 0, failed image loads: 0, network broken images: 0,
      final screenshot: docs/oied-walkthrough-assets/walkthrough-final.png (10371.4 KB),
      AUDIT CLEAN
  - Notes: Read-only browsing of prod for screenshot capture (no form submits / no POSTs). No real API key in the HTML -- placeholder only. localStorage persistence is per-browser, not server-backed; "Copy all feedback" generates a markdown dump for sharing.

## OIED v9 - partner-based execution mode (commits 62d9e57, 4c6d4de)

- [x] Add execution_mode classifier + partner_profile + outreach_ready to the OIED context envelope; gate proposal-generation recommendations behind capability-fit so opportunities Colaberry can't deliver as prime route to a teaming-partner path instead
  - Date: 2026-05-06
  - What changed: New `executionMode.service.js` (pure decision rule based on operational-blocker / support-layer / direct-fit keyword matching plus profile-service overlap), new `partner.service.js` + `partner.controller.js` (findCandidatePartners + composeOutreachDraft), two new bridge-gated routes (POST /partner-search, POST /partner-outreach), v9 fields threaded through `intelligence.context.js` envelope and both single-row + list endpoints. Two new `recommended_action` values (`find_partner`, `send_outreach`) override the baseline action for pre-draft opps only; lifecycle states (draft, approved, submitted, responded, won, lost) are not touched. v9.1 patch added a profile-services baseline support signal (>=3 services in profile = +2 baseline support) so real-world operational-copy RFPs classify as `partner_required` instead of `ignore`.
  - Verification: 388 OIED tests passing (+40 net new for v9); 1203 backend tests across 98 suites passing; 4 prod smoke scenarios passed (opp 11048 waste -> partner_required/Utah/waste_management/outreach_ready=true, opp 11038 roofing -> partner_required/construction, recommendations endpoint surfaces v9 fields per row with `find_partner` override firing on pre-draft "Armed Security Guards" opp, direct-fit opps unchanged)
  - Notes: schema_version stays at 1 (additive). No migration. No partner_candidates registry yet -- v1 returns empty candidates list and outreach drafting takes a human-supplied prime_name. Sending stays human-gated via accelerator-backend Mandrill.

## OIED v8 - grounded, lifecycle-aware proposal generation (commit c3cc622)

- [x] Add `backend/src/oied/grounding.service.js` and `backend/src/oied/approvedAssets.service.js`; restructure `actionGenerator.service.js` to gate on grounding + lifecycle before AI call
  - Date: 2026-05-05
  - What changed: Proposal generation now derives agency_name + solicitation_id + scope_summary + submission_requirements from opp data, blocks on terminal events (submitted/responded/won/lost), and rejects with 422 needs_context when required fields are missing. Banned-term scan post-generation. `metadata.template_used = 'proposal-v8'`. Additive `context.grounding` sub-object on single-row opportunity endpoint.
  - Verification: 348 OIED tests passing (40 net new); full backend suite 1165 tests across 96 suites passing; 5/5 prod smoke scenarios passed (single-row context grounding visible, lifecycle gate blocks regen, 422 needs_context, happy path content cites U3P + MP26040, post mark-submitted regen blocks)
  - Notes: Schema version stayed at 1 (additive). No migration. Initial deploy used wrong compose file (dev `docker-compose.yml` instead of `docker-compose.prod.yml`); recovered via teardown + bring-up via prod compose with `--env-file .env.prod`. ~4 min prod downtime, no data loss.
