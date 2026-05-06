# PROGRESS.md

Implementation progress log for the Opportunity Pulse repository.

This file is the hard-gate verification artifact required by `CLAUDE.md` (see "Logging, Reporting & Progress Tracking"). Every code-touching change to `/backend`, `/frontend`, `/scripts`, `/nginx`, or `/directives` must append an entry here with verification evidence on the same line as the `[x]` mark.

This file was created mid-stream on 2026-05-05; entries before that date are intentionally not back-filled. Forward from this date the gate is enforced.

---

## Governance & docs

- [x] CLAUDE.md hardening: add 9 production-grade sections (Contract Enforcement, Modular Composition, Production Readiness 12-Factor, Idempotency & Replayability, Failure-First Design, Build-Break-Harden Loop, Test Strategy Framework, Observability Framework, Security Enforcement Layer)
  - Date: 2026-05-05
  - What changed: Additive-only edits to `CLAUDE.md`. 14 existing H1 sections preserved; 9 new H1 sections inserted at planned anchors. File grew 383 -> 639 lines.
  - Verification: section-count check (23 H1 headers in expected order); manual cross-section consistency check (Failure-First retries vs Stall infinite-retry-prohibited reconciled via explicit bounded backoff)
  - Notes: Created `PROGRESS.md` itself in the same session per the catch-up rule (Logging section). Prior commits (5d16d5c initial release through c3cc622 OIED v8) are not back-filled.

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
