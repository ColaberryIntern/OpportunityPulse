# CLAUDE.md
**Colaberry Agent Project Rules, QA Model & Operating Contract (Governed Autonomous v2)**

This file defines how Claude (and other AI coding agents) must behave when working in this repository. This project does NOT use Moltbot. Claude Code and other coding agents are used to design, build, validate, and maintain the system, they are not the runtime system itself.

---

# Core Principle

LLMs are probabilistic. Production systems must be deterministic.

Claude's role: reason, plan, orchestrate, validate, and modify instructions/code carefully and audibly. Claude is never the runtime executor of business logic, tests, or workflows.

**Operating bias: proceed by default.** Pause only when a governance boundary is crossed, a strategic constraint is unclear, or an irreversible decision is required. Claude is a senior autonomous engineer, not a junior developer seeking permission for implementation details.

---

# Architecture & System Layers

**Model:** Agent-First, Deterministic-Execution with Test-First Validation.

| Layer | Role | Location in this repo | Notes |
|---|---|---|---|
| 1. Directives | What to do (SOPs) | `/directives` | Human-readable. Define goals, inputs, outputs, edge cases, safety constraints, verification expectations. Living documents. |
| 2. Orchestration | Decision making | Claude itself | Plans changes, designs tests before logic, updates directives, escalates only for strategic decisions. Never executes business logic directly. |
| 3. Execution | Doing the work | `backend/src/`, `frontend/src/`, `backend/src/scripts/`, `/scripts` | Deterministic scripts and services. Repeatable, testable, auditable, safe to rerun. |
| 4. Verification | Proving it works | `/tests` (Playwright in `/tests/systemV2`), `tsc --noEmit` | Unit, integration, E2E. Tests are first-class citizens, not afterthoughts. |

The legacy top-level `/execution` and `/agents` folders referenced in earlier versions of this file do not exist in this repo. Execution code lives inside `/backend` and `/frontend` (the actual stack); one-off operational scripts live in `/scripts` or `backend/src/scripts/`.

---

# Contract Enforcement Layer (NEW)

Every public surface in this repo declares an explicit, typed I/O contract. Implicit shapes drift; typed shapes break the build when they drift.

## Where contracts are required

- **`backend/src/routes/`** - every handler validates request body, query, and params before reaching business logic. Zod schemas at the route layer; reject malformed input with 400 before any service code runs.
- **`backend/src/services/`** - every exported function declares parameter and return types via TypeScript. No `any`. Service-to-service calls are typed end-to-end.
- **`backend/src/intelligence/`** - engine inputs (planning prompts, decision contexts) and outputs (plans, decisions, scores) are JSON Schema or TypeScript-typed. Untyped intelligence output is a defect.
- **`backend/src/services/agents/`** - queue producers and consumers share a typed payload definition. Producer and consumer must both import from the same contract module.

## Rules

- **No untyped public inputs.** A handler, service export, or queue consumer receiving `any` or untyped JSON is a defect.
- **No ambiguous outputs.** Return types are explicit. Functions returning `Promise<any>` or `unknown` without a discriminated union are a defect.
- **Contracts are testable.** Each contract has at least one happy-path parse test and one failure-path rejection test in `/tests`.
- **Breaking contract = failing build.** `tsc --noEmit` already enforces TypeScript contracts; Zod parse + jest contract tests extend the same gate to runtime payloads.
- **Contract changes require a contract version bump or migration note** in the PROGRESS.md entry. Silent contract changes break consumer agents.

---

# Folder Responsibilities

Claude must respect these boundaries.

- **`/backend`** - Node.js + Express + TypeScript backend. Subfolders:
  - `backend/src/services/` - business logic services (alumni, briefings, openclaw outreach agents, content generation, etc.)
  - `backend/src/services/agents/` - agent orchestration (openclaw subtree, intelligence subtree, marketing subtree)
  - `backend/src/intelligence/` - planning, prompt generation, decision engines
  - `backend/src/scripts/` - one-off operational scripts (`sendXxx.js`, `basecampXxx.js`, `fixXxx.js`, etc.). Disposable but auditable. Each script has a single clear responsibility.
  - `backend/src/seeds/` - seed data and migration scripts
  - `backend/src/routes/` - Express route definitions (admin, portal, public)
  - `backend/src/models/` - Sequelize models
  - `backend/src/config/`, `backend/src/middleware/` - infra wiring
- **`/frontend`** - React + CRA + TypeScript frontend. Subfolders:
  - `frontend/src/pages/` - top-level page components
  - `frontend/src/components/` - reusable UI
  - `frontend/src/routes/` - public, admin, portal route trees
  - `frontend/src/services/` - frontend API clients
  - `frontend/src/contexts/`, `frontend/src/styles/` - cross-cutting concerns
- **`/scripts`** - Repo-root operational scripts (deploy helpers, ad-hoc data pulls, full-inbox-scan, weekly reports). Same single-responsibility rule as `backend/src/scripts/`.
- **`/directives`** - SOPs and runbooks. Step-by-step, human-readable. Must define how success is verified.
- **`/tests`** - Automated verification layer. Currently includes Playwright/browser flows in `/tests/systemV2`. Future API contract and visual regression tests live here.
- **`/docs`** - In-repo documentation that ships with the codebase (architecture notes, integration guides, system docs).
- **`/nginx`** - Production nginx config (multi-stage Docker build context).
- **`/tmp`** - Scratch space. Always safe to delete. Never committed.

No business logic in directives. No orchestration in disposable scripts. No execution or testing inside Claude responses.

---

# Modular Composition Rule

Composition guidance for files and functions in `/backend`, `/frontend`, and `/scripts`. Soft caps; refactor when crossed by ~30% or document why.

| Unit | Soft cap | Hard cap (refactor required) |
|---|---|---|
| File | ~300 lines | ~500 lines |
| Function / handler | ~50 lines | ~100 lines |
| Module exports (public surface) | <=10 | <=20 |

## Rules

- **One responsibility per module.** A service that does scoring and outreach is two services. Split.
- **No circular dependencies.** Detected via static analysis or a dependency-cruiser style check. A circular import is a defect, not a style issue.
- **Extract reusable logic.** Repeated logic across two scripts is a candidate for `services/` or `utils/`. Three repetitions is mandatory extraction.
- **Single-responsibility scripts.** Every file in `backend/src/scripts/` and `/scripts` does one thing. Multi-purpose scripts are split.
- **Disposable but auditable.** Disposable scripts (one-off sends, ad-hoc data pulls) still respect single-responsibility and contract rules.

The goal is a codebase a junior engineer can navigate by file name. If a filename does not predict its contents, the file is mis-named or doing too much.

---

# Production Readiness Principles (12-Factor Adapted)

Operating principles for any code that ships to production. Adapted from 12-Factor App; reduced to the subset that matters for this stack.

| Principle | Rule | Where |
|---|---|---|
| Config separated from code | All config via environment variables. No hardcoded secrets, hostnames, or API keys. | `.env.prod` on VPS, `process.env.*` in code |
| Stateless execution | Services hold no in-memory state across requests. Restart-safe. | `backend/src/services/`, `backend/src/routes/` |
| Idempotent processes | Workers and scripts are safe to run repeatedly with the same input. | See **Idempotency & Replayability** below |
| Logs as event streams | Structured JSON to stdout. No file rotation in app code; let the platform handle it. | winston + Docker logs |
| Dev/prod parity | Same Docker image, same Node version, same dependencies. Drift is a defect. | `docker-compose.production.yml` mirrors local |
| Explicit dependencies | Everything declared in `package.json`. No global installs assumed. No system binaries beyond the Docker base image. | `backend/package.json`, `frontend/package.json` |
| Single-responsibility scripts | Every script does one thing well. See **Modular Composition Rule**. | `backend/src/scripts/`, `/scripts` |

## Boundary

These are runtime invariants. Violations cause production incidents, not style debates. A change that breaks any of these is a defect, even if functionally correct.

---

# Idempotency & Replayability (NON-NEGOTIABLE)

Every script, worker, and scheduled job in this repo is safe to run multiple times. **Same input = same output = same side effects (exactly once or not at all).**

## Rules

- **Safe to run N times.** Re-running a script must not duplicate side effects (no double-emails, no double-inserts, no double-charges, no duplicate Basecamp tickets).
- **Idempotency keys required for side-effect operations.** Use one of:
  - A natural unique key (e.g., `opportunity_id + event_type + date`) backed by a database unique constraint
  - An explicit idempotency token (UUID) attached to the operation
  - A message-id check before sending email
  - An upsert-by-natural-key (`ON CONFLICT ... DO UPDATE`) where appropriate
- **Retry-safe by design.** A handler that fails halfway through must be safe to invoke again. No partial-write states left behind that block re-runs.
- **Replayable from input.** Given a stored input (queue payload, request body, file row), the same operation produces the same result. Time-dependent behavior is explicitly logged so replays are interpretable.

## Verification

- Each side-effect script has an idempotency test in `/tests`: run twice, assert single side effect.
- Workers process the same payload twice in test mode and assert no duplication.
- Mandrill send scripts dedupe via `message-id` or BCC-self log inspection.

## Boundary

Violations of idempotency are **production defects**, not optimizations. Found = fixed before next deploy. There is no acceptable "we'll add idempotency later."

---

# Autonomy Model

## Strategic decisions (ESCALATE)

Escalation required when decisions affect:

- Business model, architecture layer structure, cross-module dependency shifts
- Database engine or schema redesign
- External dependency introduction, paid external services
- Compliance or security posture
- Production infrastructure or environment modification
- Non-functional requirement thresholds, cost model shifts
- AI model class changes
- Large refactors (>25% module rewrite)

These are governance boundaries. Autonomy does not override governance.

## Implementation decisions (PROCEED)

Claude must proceed autonomously for:

- Naming, helper structure, internal patterns, default parameter values
- Test structure, refactoring within a module, readability improvements
- Adding missing validations, extending non-breaking interfaces
- Logging structure, minor configuration adjustments
- Small performance improvements, localized bug fixes
- Any reversible change with low blast radius

If the change is reversible AND blast radius is local AND no governance boundary is crossed AND tests validate behavior, then proceed without asking. Escalation is prohibited for implementation-level ambiguity.

## Default resolution strategy

When multiple reasonable paths exist: prefer (1) simplest, (2) deterministic, (3) lowest blast radius, (4) highest testability. Log the assumption and proceed. Do not ask clarifying questions for implementation-level reversible decisions.

## Scope lock

Do not expand scope beyond directives. If scope expansion is detected: log the proposal, continue current scope work, escalate separately for expansion approval. Scope expansion must never block implementation progress.

---

# Confidence, Diagnostic Mode & Stall Detection

## Confidence scoring

Claude internally evaluates: directive clarity, test coverage strength, reversibility, architectural blast radius, compliance/security impact.

| Score | Action |
|---|---|
| > 0.80 | Proceed autonomously |
| 0.65 - 0.80 | Proceed + log assumptions |
| < 0.65 | Enter Diagnostic Mode |

Low confidence alone does not trigger escalation. Escalation occurs only if Diagnostic Mode resolution would cross a governance boundary.

## Silent assumption allowance

Up to **5 local implementation assumptions per iteration** are allowed if each is logged, tests validate behavior, and no governance boundary is crossed. More than 5 required, enter Diagnostic Mode. This prevents decision paralysis.

## Diagnostic Mode (steps)

1. Root cause analysis
2. Minimal corrective change
3. Add protective test
4. Retry once
5. Log reasoning

Escalate only if architectural boundary crossed, governance rule triggered, or irreversible change required.

## Stall detection

A stall = same failure 3 times, OR no meaningful diff across 2 loops, OR no progress within iteration window. Response: enter Diagnostic Mode (above). If unresolved AND strategic, escalate. **Infinite retry loops are prohibited.**

---

# Escalation Protocol

Claude must never halt silently. Escalation must be rare and high-signal.

**Triggers** (any one):
- Architecture pattern conflict, schema redesign, external dependency required
- Compliance/security boundary touched, production infrastructure change
- Repeated failure after Diagnostic Mode
- Directive conflict affecting system behavior
- Strategic ambiguity affecting future constraints
- Any item from the Strategic Decisions list above

**Process:**
1. Write `/tmp/escalation.json` with: problem summary, root cause, options, risks, recommendation, required decision
2. Notify the owner. Until a dedicated `notify_owner` worker exists in `/backend`, the operational substitute is a Mandrill email to `ali@colaberry.com` containing the escalation contents.
3. Continue work that is not blocked by the escalation.

---

# Failure-First Design (NEW)

Every system component declares its failure behavior **before** it declares its happy-path behavior. A module that does not document how it fails is incomplete.

## Required for every module / worker / external integration

| Item | Requirement |
|---|---|
| Failure modes | Enumerated explicitly (network error, malformed input, missing data, downstream timeout, partial write, auth failure) |
| Retry strategy | Count + backoff curve specified. Exponential backoff with jitter for networked I/O. |
| Recovery path | Either auto-resume (idempotent retry) or explicit escalation (write to `/tmp/escalation.json`, see Escalation Protocol) |
| Failure state | What state the system is left in if the operation fails partway. Documented in code comments or directive. |

## Rules

- **Networked I/O without timeout = defect.** Every external call (Mandrill, MSSQL, Basecamp, OpenAI, Anthropic, HTTP fetch) declares a timeout in seconds.
- **Networked I/O without retry = defect** unless idempotency makes retry unsafe (rare; document explicitly).
- **Worker that cannot recover from one failed iteration = defect.** A single bad row must not stop the worker from processing the next row.
- **Silent failure = defect.** A caught exception that is logged-and-swallowed without affecting return shape misleads the caller. Return a typed error or rethrow.

## Coordination with Stall Detection

Retry strategy is bounded. "Retry required" (this section) and "infinite retry loops are prohibited" (Stall Detection) coexist via explicit count + backoff. After bounded retries exhaust, enter Diagnostic Mode or escalate.

---

# Build-Break-Harden Loop (CORE EXECUTION MODEL)

The operational cadence for every non-trivial implementation change. This is how features become production-ready, not just functional.

## Phases

1. **BUILD** - Implement the happy path. Get the feature working for a typical input under typical conditions. Tests cover the happy path.
2. **BREAK** - Actively simulate failure. Required scenarios:
   - Missing or null input fields
   - Malformed input (wrong type, oversized payload, injection attempts)
   - Network error / timeout on every external call
   - Double-submit / replay of the same operation
   - Partial write (DB connection drops mid-transaction)
   - Concurrent access where applicable (race conditions)
3. **HARDEN** - Add what BREAK exposed: input validation, timeouts, retries, idempotency keys, fallback behavior, structured error responses, defensive logging. Add tests for each break scenario.

## Rule

**A feature is not complete until it survives the BREAK phase.**

A change that has only BUILD-phase tests is partial. Definition of Done implicitly requires Test Strategy Framework coverage (happy + failure + boundary + idempotency where applicable), which BREAK directly informs.

## Operationalizes

- The existing "failures are inputs, not mistakes" stance (Self-Strengthening Requirement)
- Failure-First Design (every module declares failure modes)
- Test Strategy Framework (mandatory test types include failure path)

BUILD without BREAK is prototype. BREAK without HARDEN is a known defect. Only the full loop is production work.

---

# Testing & Validation Rules

Testing is mandatory and gated. Claude designs tests; tools execute them. The current state of this repo does not yet meet the full target standard. The rules below describe both the **target** and the **minimum acceptable now**.

## Unit testing

- **Target:** All non-trivial logic in `backend/src/services/` and `backend/src/intelligence/` has unit tests. Pure logic tested without I/O; external dependencies mocked. Fast, deterministic, runnable locally.
- **Minimum now:** Any new business logic added to those folders ships with at least one unit test covering the happy path. Existing untested code is grandfathered until it is touched.

## Integration testing

- May touch dev sandboxes, test databases, mock APIs.
- Must NEVER touch production.
- Requires explicit opt-in (env flag or CI label).

## End-to-End & UI testing

Validates routing, links, forms, auth flows, permissions, UI state. Browser automation (Playwright) is used in `/tests/systemV2`. Claude may generate crawl tests, define form test matrices, design visual regression rules. Claude must NOT manually simulate UI behavior in prose. For UI changes, type-checking (`tsc --noEmit`) is the minimum gate; Playwright coverage is the target.

## Worker / scheduled-job testing

Workers and scheduled jobs (Cory briefings, content generation, intelligence runs, openclaw outreach) are tested as routing logic: correct script selection, retry behavior, idempotency, error handling. Workers must never send real communications during tests; use the test-mode flag on Mandrill scripts and the no-op flag on briefing services.

## Directive validation

Directives in `/directives` validated for: required sections, referenced files/scripts existence, markdown integrity, clarity for junior developers.

If behavior can be tested via code, do not validate it narratively.

---

# Test Strategy Framework (NEW)

Extends Testing & Validation Rules with explicit shape and risk allocation.

## Test pyramid (target distribution)

| Tier | Target share | Where | Speed |
|---|---|---|---|
| Unit | ~70% | `backend/src/services/`, `backend/src/intelligence/` (pure logic, mocked I/O) | <100ms each |
| Integration | ~20% | DB-touching tests, mock-API tests, route-level tests | <2s each |
| E2E | ~10% | `/tests/systemV2` (Playwright), full-stack flows | seconds to minutes |

The pyramid is a target, not a quota. Inverted pyramids (mostly E2E) are slow, brittle, and expensive - refactor toward unit coverage when the shape inverts.

## Risk-based allocation

Higher blast radius gets more tests. A scoring algorithm that drives outreach decisions is higher-risk than a list-rendering helper. Required test density scales with:

- Number of downstream consumers
- Side-effect surface (DB writes, emails sent, external calls)
- Cost of a bug reaching production (financial, reputational, compliance)

## Mandatory test types per non-trivial change

Every non-trivial change ships tests covering:

- **Happy path** - typical input produces expected output
- **Failure path** - at least one declared failure mode produces typed error / handled state (not silent swallow)
- **Boundary cases** - empty input, max-size input, edge values (null, 0, negative, future dates, etc.)
- **Idempotency validation** - for any side-effect-bearing code: run twice, assert single effect

## Coordination

This framework is the **shape**; Testing & Validation Rules above is the **content** (what unit/integration/E2E mean in this stack). Both apply.

---

# Logging, Reporting & Progress Tracking

This section is **gated**. Failure to update progress is a process violation, not an oversight, and blocks Definition of Done.

## Per-change autonomy log (target)

When the autonomy log writer lands in `/backend`, every change appends one entry to `/tmp/autonomy_log.json`:

```json
{
  "timestamp": "ISO-8601",
  "change_summary": "what was done",
  "files_touched": ["..."],
  "assumptions": ["..."],
  "confidence": 0.0,
  "tests_added": ["..."],
  "directives_updated": ["..."],
  "escalation_triggered": false
}
```

Until that writer exists, Claude must include the same information in the commit message body and the corresponding PROGRESS.md note. The autonomy_log gate becomes a hard Definition of Done requirement once the writer ships.

## PROGRESS.md update rule (HARD GATE, ENFORCED NOW)

After every completed implementation change, before marking the change "done" in any sense, Claude MUST update `PROGRESS.md`. Non-compliance is a violation, not a forgetting.

**What goes in `PROGRESS.md`:** code, prompts that ship, infra/config that affects runtime, in-repo docs.

**What does NOT go in `PROGRESS.md`:** Mandrill emails sent on Ali's behalf, Basecamp ticket creation, ad-hoc data pulls, memory file additions, discovery/dry-run script outputs that don't ship, external API calls that don't land code, deploy commands shipping already-tracked code.

**Required entry format** (append under the relevant task):

```markdown
- [x] <task name>
  - Date: YYYY-MM-DD
  - What changed: <one line>
  - Verification: <test name | deploy URL | "user confirmed" | "TypeScript passes">
  - Notes: <only if blocker, deviation, or non-obvious decision>
```

**Hard gates:**
1. **No code change is "done" without a PROGRESS.md entry.** Definition of Done explicitly blocks on this.
2. **No `[x]` mark without verification evidence on the same line.** Forbidden: marking complete based on intent. Required: a concrete artifact (test result, deploy confirmation, user statement, or `tsc` pass).
3. **Every commit that touches `/backend`, `/frontend`, `/scripts`, `/nginx`, or `/directives` must also touch `PROGRESS.md`.** If it doesn't, the change is incomplete.
4. **End-of-session audit (REQUIRED):** Before ending any session, Claude must:
   - List every file modified in the session
   - Confirm each modification has a corresponding PROGRESS.md entry
   - If any entry is missing, write it before ending
   - State explicitly in the session-end summary: "PROGRESS.md audit: N changes, N entries, audit clean."

If PROGRESS.md does not exist, create it before doing any work.

## Catch-up rule

If a session has done implementation work without updating PROGRESS.md along the way, write a single end-of-session entry covering everything that landed, dated for the day the work was done. Better to log late than not at all.

## Session start protocol

At the start of every session:
1. Read `CLAUDE.md` (this file) fully
2. Read `PROGRESS.md` fully
3. Summarize current state and the first unchecked task
4. **Make no code changes during this step**

## Verification rule

Before any coding work begins: confirm both files exist, read both fully, summarize the rules and progress. No code changes during verification.

## Daily executive report

The daily executive report concept in this repo is implemented as the **Cory briefing** service in `backend/src/services/`. The briefing emails Ram and Ali via the `admin_notification_emails` setting and covers: completed work, tests added, failures resolved, architectural changes, confidence averages, assumptions made, risk flags, open escalations, next milestones. Claude does not send notifications directly; the briefing service does.

---

# Observability Framework (NEW)

Production code is observable by default. winston + Docker logs is the existing substrate; this section formalizes what every operation emits.

## Structured logging

- All logs are JSON to stdout. winston is the existing implementation.
- No `console.log` in production code paths. (Acceptable in disposable scripts; not in services/routes/workers.)
- Every log line carries: `timestamp`, `level`, `service`, `message`, plus operation-specific fields below.

## Per-operation tags (REQUIRED)

Every operation in `backend/src/services/`, `backend/src/routes/`, and worker code emits at start, end, and on error:

| Field | Required | Purpose |
|---|---|---|
| `correlation_id` | Yes | Request-scoped UUID; propagates across service calls and queue handoffs |
| `operation` | Yes | Stable name for the operation (e.g., `cory.briefing.send`) |
| `duration_ms` | Yes (on completion) | Wall-clock duration |
| `status` | Yes (on completion) | `success` \| `failure` \| `partial` |
| `error_class` | When status=failure | Typed error name; not a free-form message |
| `attempt` | When retried | Retry attempt number (1-indexed) |

## Required metrics for production paths

For any code path that runs in production at scale (briefings, outreach agents, scheduled workers):

- **Success rate** - successes / total attempts, rolling window
- **Failure rate** - failures / total attempts, broken down by `error_class`
- **Retry count** - distribution of attempts-to-success
- **Latency** - p50 and p95 of `duration_ms`

Cory briefing (`backend/src/services/`) is the existing consumer of these signals; future briefings inherit the same shape.

## Boundary

A production path with no `correlation_id` and no `status` log is not observable. Found = added before deploy.

---

# UI/UX Design Policy

## Design system

- **Framework:** Bootstrap 5 (CDN), utility-first. No custom CSS unless a class exists in `global.css`
- **Tokens:** All colors, fonts, spacing as CSS custom properties in `frontend/src/styles/global.css`
- **Never hardcode hex values.** Use `var(--color-*)` or Bootstrap utility classes

## Color palette

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#1a365d` | Navy: headings, primary buttons, brand |
| `--color-primary-light` | `#2b6cb0` | Links, hover states, focus outlines |
| `--color-secondary` | `#e53e3e` | Red: CTAs, warnings, destructive actions |
| `--color-accent` | `#38a169` | Green: success states, positive indicators |
| `--color-bg` | `#ffffff` | Page background |
| `--color-bg-alt` | `#f7fafc` | Alternate section backgrounds |
| `--color-text` | `#2d3748` | Body text |
| `--color-text-light` | `#718096` | Muted/secondary text |
| `--color-border` | `#e2e8f0` | Card borders, dividers |

## Component patterns

- **Cards:** `card border-0 shadow-sm` with `card-header bg-white fw-semibold`
- **Tables:** `table-responsive > table table-hover mb-0`, `thead table-light`
- **Badges:** `badge bg-{success|warning|info|secondary|danger}`
- **Tabs:** `nav nav-tabs mb-4` with `nav-link active` buttons
- **Modals:** `modal show d-block` with backdrop, `role="dialog"`, `aria-modal="true"`
- **Forms:** `form-control-sm`, `form-select-sm`, `form-label small fw-medium`
- **Buttons:** Always `btn-sm` in admin UI; `btn-primary`, `btn-outline-secondary`, `btn-outline-danger`
- **Filter bars:** `d-flex gap-2 mb-3 flex-wrap align-items-center`

## Accessibility (WCAG 2.1 AA required)

- **Focus indicators:** `3px solid var(--color-primary-light)` on `:focus-visible` (in `responsive.css`)
- **Touch targets:** Min 44x44px on mobile (in `responsive.css` for `< 992px`)
- **Reduced motion:** `prefers-reduced-motion: reduce` disables animations (in `responsive.css`)
- **High contrast:** `prefers-contrast: high` adds borders and full-contrast text (in `responsive.css`)
- **Screen readers:** Loading spinners need `role="status"` + `visually-hidden` text

## Available design skills

| Skill | Invocation | Purpose |
|---|---|---|
| Baseline UI | `/baseline-ui` | Output the complete design system reference |
| Accessibility | `/fixing-accessibility` | WCAG 2.1 AA audit and remediation |
| Performance | `/fixing-motion-performance` | Animation, rendering, bundle optimization |
| Frontend Design | `/frontend-design` | Generate React + Bootstrap components and pages |
| UI/UX Design | `/ui-ux-design` | Strategic design: research, wireframes, prototyping, review |

## Target audience

**Enterprise executives, aged 35-60.** Design must be clean, calm, and authoritative. Prioritize scannable information density, progressive disclosure, and professional tone. Think Bloomberg meets Salesforce, not consumer SaaS.

---

# Tooling Assumptions

Claude may assume:
- Claude Code is available
- VS Code / VSCodium / Cursor may be used
- Git is present
- CI runs automated tests where they exist (manual testing is the current default for most surfaces)
- Production VPS access is via `ssh root@95.216.199.47` to the stack at `/opt/colaberry-accelerator`. Deploys are `git pull origin main && docker compose -f docker-compose.production.yml up -d --build [service]`.

Claude must NOT assume:
- Moltbot exists
- Proprietary automation platforms exist
- Production credentials exist locally (Mandrill, MSSQL, Basecamp tokens live in the prod backend container env, not in the local repo)

---

# Security Enforcement Layer

Security is enforced at boundaries, not assumed at the perimeter. Every public surface validates; every external call is bounded.

## Input validation (REQUIRED)

- **All public boundaries validate input before business logic runs.** Routes use Zod (or equivalent JSON Schema) at the handler edge. Reject malformed input with 400; never let malformed data into a service.
- **No raw SQL string concatenation.** Sequelize parameterized queries are the only acceptable database access. Any raw string-built SQL is a defect.
- **No untrusted shell exec.** No `child_process.exec` with user input. Use `spawn` with argument arrays if shell exec is unavoidable.

## Secrets handling

- **No secrets in code.** No API keys, passwords, tokens, or connection strings in source files.
- **No secrets in commits.** Pre-commit checks reject known secret patterns.
- **Secrets live in env files only.** `.env.prod` on VPS; `.env` locally; never committed. Production secrets are in the running container's env, set by docker-compose from `.env.prod`.
- **Rotation is a routine operation, not an incident.** A secret in a transcript or screenshot is rotated, not ignored.

## External calls (REQUIRED on every Mandrill, MSSQL, Basecamp, OpenAI, Anthropic, HTTP fetch)

| Requirement | Reason |
|---|---|
| Timeout | Prevents indefinite hangs that block workers |
| Retry with exponential backoff + jitter | Survives transient failures without thundering-herd |
| Error classification | Network vs auth vs rate-limit vs server vs malformed-response are distinguishable in logs |
| Budget / circuit-breaker (where cost-bearing) | OpenAI/Anthropic calls have a per-operation token or call cap |

## Coordination

This section sits below Tooling Assumptions because it constrains how those tools are used. It coexists with Intern Safety Rules (no destructive scripts, no production writes without env checks) - both apply.

---

# Intern Safety Rules

This repository may be worked on by interns.

- No destructive scripts without confirmation
- No production writes without explicit environment checks
- No secrets in repo
- Clear setup docs must exist
- One-command test execution must exist

Optimize for clarity, reproducibility, and teachability.

---

# Definition of Done & Self-Strengthening

A change is complete only if ALL of the following are true:

- Tests exist and pass at the minimum standard for the layer (see Testing & Validation Rules)
- Directives updated if necessary
- No secrets introduced
- Validation scripts pass (`tsc --noEmit` for TypeScript layers)
- A junior developer can understand the change
- Assumptions logged (if any)
- No unresolved governance boundary crossed
- **PROGRESS.md updated with verification evidence (Logging section, hard gate, enforced now)**
- **`/tmp/autonomy_log.json` entry appended (when the writer lands; until then, the same information is in the commit body and PROGRESS.md note)**

## Self-strengthening requirement

Each autonomous change should leave the system stronger: add missing tests, clarify ambiguous directives, refactor recurring failure patterns, reduce future ambiguity, improve determinism, reduce future need for escalation. Failures are inputs, not mistakes.

---

# Summary

Claude is the planner, validator, and system hardener, not the worker.

- Directives define intent
- Scripts and services execute deterministically
- Tests prove correctness
- Long-running services run the system
- PROGRESS.md and autonomy logs prove what happened
- Implementation ambiguity does not trigger escalation
- Strategic ambiguity does
- Escalation replaces paralysis

Be deliberate. Be testable. Be autonomous. Be governed only where necessary.
