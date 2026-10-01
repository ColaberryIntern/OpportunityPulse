#!/usr/bin/env bash
#
# Post-rollout release verification for Opportunity Pulse.
#
# WHY THIS IS A SCRIPT AND NOT INLINE YAML
# This logic used to live inside release.yml, where the only available checks
# were "does the YAML parse" and "does bash -n pass". Both are satisfied by
# assertions that can never be true. That is not hypothetical: between
# 2026-09-30 and 2026-10-01 this repository shipped an ENTRYPOINT gate that was
# unconditionally false, a readiness probe pointed at an unpublished port, a
# flag the container never received, an assertion that read logs the logger
# never wrote, and a flag check that demanded a state production must not be in.
# Every one of them linted clean. Extracting the logic lets tests drive it with
# a mocked `docker` and assert the exit status, which is the only thing that
# would have caught any of them.
#
# CONTROL CLASSES — these are deliberately NOT one list.
#
#   pause controls      scheduled execution. MUST be exactly false for a paused
#                       release. Verified by equality, not by "not true".
#   service baseline    existing v1 service and scraper capability. Verified
#                       against the APPROVED BASELINE, and drift in EITHER
#                       direction fails. These are not forced to false: doing so
#                       would 404 the v1 Bonfire surface that a live consumer
#                       reads.
#   phase 2             has no environment flag at all. Activation is a runtime
#                       capability probe over the gov_* tables
#                       (bonfire.service.js govEvidenceEnabled). Its inactive
#                       semantics are "no ingestion runs", which the pause
#                       controls above enforce. No setting is invented here.
#
# SCOPE OF THE PAUSE — stated so it is not mistaken for more than it is.
# The pause controls stop SCHEDULED execution. They do not constitute a write
# freeze. Manual scraping remains reachable by an authenticated admin while
# BONFIRE_SCRAPER_ENABLED is true, and admin API writes remain possible. A true
# write freeze is achieved only by stopping the container, which is what the
# migration window does.
#
# Exit status: 0 when every check passes, 1 otherwise. All failures are
# reported before exiting, so one run shows every problem rather than the first.

set -uo pipefail

CONTAINER="${CONTAINER:-op-backend}"

# Scheduled-execution controls. Exactly false, each one.
PAUSE_FLAGS="${PAUSE_FLAGS:-INGESTION_SCHEDULER_ENABLED BONFIRE_SCRAPER_CRON_ENABLED BONFIRE_STRATEGIST_CRON_ENABLED}"

# Existing service/capability flags, as name=expected pairs. Checked against the
# approved baseline rather than forced to a value.
SERVICE_BASELINE="${SERVICE_BASELINE:-BONFIRE_ENGINE_ENABLED=true BONFIRE_SCRAPER_ENABLED=true}"

# Schedulers that ingest. Each must report itself disabled from THIS boot.
SCHEDULERS="${SCHEDULERS:-ingestion freelance research}"

# Optional pure-comparison baselines: space-separated label:expected:actual.
BASELINE_PAIRS="${BASELINE_PAIRS:-}"

FAILURES=0

fail() {
  echo "VERIFY FAILED: $*" >&2
  FAILURES=$((FAILURES + 1))
}

ok() { echo "  OK   $*"; }

lower() { printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'; }

flag_value() {
  docker exec "$CONTAINER" printenv "$1" 2>/dev/null || echo unset
}

# ---------------------------------------------------------------------------
echo "--- pause controls (scheduled execution) ---"
for name in $PAUSE_FLAGS; do
  value="$(flag_value "$name")"
  if [ "$(lower "$value")" = "false" ]; then
    ok "${name}=false"
  else
    # Covers true, unset, empty, and typos such as 'flase' identically.
    fail "pause control ${name}=${value} — must be exactly false"
  fi
done

# ---------------------------------------------------------------------------
echo "--- existing service flags (verified against the approved baseline) ---"
for pair in $SERVICE_BASELINE; do
  name="${pair%%=*}"
  want="${pair#*=}"
  value="$(flag_value "$name")"
  if [ "$(lower "$value")" = "$(lower "$want")" ]; then
    ok "${name}=${value} matches approved baseline"
  else
    fail "service flag ${name}=${value} — approved baseline is ${want} (drift in either direction is a failure)"
  fi
done

# ---------------------------------------------------------------------------
echo "--- phase 2 activation ---"
echo "  no environment flag exists; activation is the gov_* capability probe."
echo "  inactive semantics are enforced by the pause controls above."

# ---------------------------------------------------------------------------
echo "--- scheduler evidence, scoped to the CURRENT container boot ---"
started_at="$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null)"
container_id="$(docker inspect -f '{{.Id}}' "$CONTAINER" 2>/dev/null | cut -c1-12)"

if [ -z "$started_at" ]; then
  fail "cannot read StartedAt for ${CONTAINER} — cannot scope evidence to this boot"
else
  echo "  container ${container_id} started at ${started_at}"
  boot_logs="$(docker logs --since "$started_at" "$CONTAINER" 2>&1)"

  for scheduler in $SCHEDULERS; do
    # BOTH markers must appear in the SAME record. Matching the scheduler name
    # alone would accept any unrelated line mentioning it; matching the event
    # alone would let one scheduler's record satisfy all three.
    if printf '%s\n' "$boot_logs" \
         | grep '"event":"ingestion_scheduler_disabled"' \
         | grep -q "\"scheduler\":\"${scheduler}\""; then
      ok "scheduler=${scheduler} reported disabled in this boot"
    else
      fail "no ingestion_scheduler_disabled record for scheduler=${scheduler} in this container's boot"
    fi
  done
fi

# ---------------------------------------------------------------------------
if [ -n "$BASELINE_PAIRS" ]; then
  echo "--- data baselines (drift is a failure) ---"
  for triple in $BASELINE_PAIRS; do
    label="${triple%%:*}"
    rest="${triple#*:}"
    expected="${rest%%:*}"
    actual="${rest#*:}"
    if [ "$expected" = "$actual" ]; then
      ok "${label}=${actual} unchanged"
    else
      fail "baseline drift: ${label} expected ${expected}, got ${actual}"
    fi
  done
fi

# ---------------------------------------------------------------------------
echo
if [ "$FAILURES" -eq 0 ]; then
  echo "RELEASE VERIFICATION PASSED"
  exit 0
fi
echo "RELEASE VERIFICATION FAILED (${FAILURES} check(s))" >&2
exit 1
