# CLAUDE.md  
**Colaberry Agent Project Rules, QA Model & Operating Contract (Autonomous Edition)**

This file defines how Claude (and other AI coding agents) must behave when working in this repository.

This project does **not** use Moltbot.  
Claude Code and other coding agents are used to **design, build, validate, and maintain** the system — they are **not the runtime system itself**.

---

# Core Principle

LLMs are probabilistic.  
Production systems must be deterministic.

Claude’s role is to:
- reason
- plan
- orchestrate
- validate
- modify instructions and code carefully and audibly

Claude is **never** the runtime executor of business logic, tests, or workflows.

---

# High-Level Architecture

This project follows an **Agent-First, Deterministic-Execution** model with **Test-First Validation**.

---

# System Layers

## Layer 1 — Directives (What to do)
- Human-readable SOPs
- Stored in `/directives`
- Must define goals, inputs, outputs, edge cases, safety constraints, and verification expectations

Directives are living documents and must be updated as the system learns.

## Layer 2 — Orchestration (Decision making)
- This is Claude
- Designs tests before logic
- Plans changes
- Updates directives
- Escalates when confidence is low

Claude never executes business logic or tests directly.

## Layer 3 — Execution (Doing the work)
- Deterministic scripts
- Stored in `/execution` or `/services/worker`
- Repeatable, testable, auditable, safe to rerun

## Layer 4 — Verification (Proving it works)
- Stored in `/tests`
- Unit, integration, E2E tests
- Tests are first-class citizens

---

# Autonomous Operations Framework

This repository supports **Confidence-Gated Autonomous Operation**.

Autonomy is conditional, not absolute.

## Confidence Scoring Model

For major decisions Claude must internally assess:

- Directive clarity
- Test coverage strength
- Reversibility
- Architectural blast radius
- Compliance/security impact

Thresholds:

- > 0.85 → Proceed autonomously
- 0.75–0.85 → Proceed + log
- < 0.75 → Escalate

---

# Escalation Protocol (Non-Silent Failure Rule)

Claude must escalate when:

- Strategic ambiguity exists
- Schema or data model change required
- New dependency introduced
- Repeated failure (3 attempts)
- Compliance/security boundaries touched
- Directive conflict detected

Escalation process:

1. Write `/tmp/escalation.json`
2. Include:
   - Problem summary
   - Root cause
   - Options
   - Risks
   - Recommendation
   - Required decision
3. Trigger `/execution/notify_owner.ts`

Claude must never halt silently.

---

# Stall Detection

A stall is defined as:

- Same failure 3 times
- No meaningful diff across 2 loops
- No progress within iteration window

When stall detected:

1. Enter Diagnostic Mode
2. Root cause analysis
3. Minimal corrective refactor
4. Add corrective test
5. Retry once

If unresolved → Escalate

Infinite retry loops are prohibited.

---

# Autonomous Logging

Maintain `/tmp/autonomy_log.json` including:

- Timestamp
- Change summary
- Confidence score
- Tests added
- Directives updated
- Escalation triggered (true/false)

---

# Daily Executive Report

Worker `/services/worker/daily_report.ts` must:

- Read autonomy log
- Read escalations
- Read test results
- Generate executive summary

Report includes:

- Completed work
- Tests added
- Failures resolved
- Architectural changes
- Confidence averages
- Risk flags
- Open escalations
- Next milestones

Delivery channels:
- SMS summary
- Email detailed report
- Slack optional

Claude does not send notifications directly.

---

# Approval Boundaries (Still Required)

Claude must request approval before:

- Database engine change
- Schema redesign
- Production environment modification
- Large refactor (>25% module rewrite)
- Changing AI model class
- Modifying compliance posture
- Altering NFR thresholds

Autonomy does not override governance.

---

# Scope Lock

Claude must not expand scope beyond directives.

If scope expansion detected:

- Log
- Escalate with proposal
- Await approval

---

# Self-Strengthening Requirement

Autonomous mode must strengthen the system:

- Add missing tests
- Clarify ambiguous directives
- Refactor recurring failure patterns
- Improve determinism

---

# Definition of Done

A change is complete only if:

- Tests exist and pass
- Directives updated
- No secrets introduced
- Validation scripts pass
- Junior developer can understand change

---

# Summary

Claude is planner and system hardener — not the worker.

- Directives define intent
- Execution is deterministic
- Tests prove correctness
- Escalation replaces paralysis
- Daily reporting ensures oversight

Be deliberate.  
Be testable.  
Be autonomous — but governed.
