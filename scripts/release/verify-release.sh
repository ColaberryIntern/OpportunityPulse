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
# Every one of them linted clean.
#
# CONTROL CLASSES — deliberately NOT one list.
#
#   pause controls     scheduled execution. MUST be exactly false. Verified by
#                      equality, not by "not true".
#   observed baseline  existing service and capability flags. Compared against
#                      the values production was OBSERVED to have. This is a
#                      drift detector, not a statement that the configuration
#                      was reviewed or approved.
#   phase 2            has no environment flag. See the reporting note below.
#   data stability     measured before and after rollout and compared.
#
# WHAT THE PAUSE CONTROLS DO NOT DO — stated because the earlier wording of this
# script overclaimed it. They stop SCHEDULED execution. They do not:
#   * make Phase 2 inactive. The gov evidence capability is a runtime probe over
#     the gov_* tables and has been AVAILABLE since the migration. A manual
#     ingestion run would write evidence with the pause controls set.
#   * constitute a write freeze. Manual scraping stays reachable by an
#     authenticated admin while BONFIRE_SCRAPER_ENABLED is true, and ordinary
#     admin API writes are unaffected.
# Those are held procedurally. The only evidence that nothing was written is the
# measured data stability section, which is why it must actually run.
#
# Exit status: 0 when every check passes, 1 otherwise. All failures are reported
# before exiting, so one run shows every problem rather than the first.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CONTAINER="${CONTAINER:-op-backend}"
PAUSE_FLAGS="${PAUSE_FLAGS:-INGESTION_SCHEDULER_ENABLED BONFIRE_SCRAPER_CRON_ENABLED BONFIRE_STRATEGIST_CRON_ENABLED}"
OBSERVED_BASELINE="${OBSERVED_BASELINE:-${SERVICE_BASELINE:-BONFIRE_ENGINE_ENABLED=true BONFIRE_SCRAPER_ENABLED=true}}"
SCHEDULERS="${SCHEDULERS:-ingestion freelance research}"
BASELINE_PAIRS="${BASELINE_PAIRS:-}"
REQUIRE_BASELINES="${REQUIRE_BASELINES:-1}"
# Overridable so the missing-interpreter guard can be exercised by tests
# without PATH surgery. Production leaves it at the default.
PYTHON_BIN="${PYTHON_BIN:-python3}"

FAILURES=0
fail() { echo "VERIFY FAILED: $*" >&2; FAILURES=$((FAILURES + 1)); }
ok()   { echo "  OK   $*"; }
lower() { printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'; }

flag_value() { docker exec "$CONTAINER" printenv "$1" 2>/dev/null || echo unset; }

# ---------------------------------------------------------------------------
echo "--- scheduled execution: pause controls ---"
for name in $PAUSE_FLAGS; do
  value="$(flag_value "$name")"
  if [ "$(lower "$value")" = "false" ]; then
    ok "${name}=false"
  else
    fail "pause control ${name}=${value} — must be exactly false"
  fi
done

# ---------------------------------------------------------------------------
echo "--- observed configuration baseline (drift detector, not an approval) ---"
for pair in $OBSERVED_BASELINE; do
  name="${pair%%=*}"
  want="${pair#*=}"
  value="$(flag_value "$name")"
  if [ "$(lower "$value")" = "$(lower "$want")" ]; then
    ok "${name}=${value} matches the observed baseline"
  else
    fail "configuration drift: ${name}=${value}, observed baseline is ${want}"
  fi
done

# ---------------------------------------------------------------------------
echo "--- manual write capability (NOT disabled by the pause controls) ---"
scraper_capability="$(flag_value BONFIRE_SCRAPER_ENABLED)"
if [ "$(lower "$scraper_capability")" = "true" ]; then
  echo "  BONFIRE_SCRAPER_ENABLED=true: POST /scrape/run is reachable by an"
  echo "  authenticated admin. Not scheduled, not authorized by this release,"
  echo "  and not prevented by configuration — held procedurally."
else
  echo "  BONFIRE_SCRAPER_ENABLED=${scraper_capability}: /scrape/* is not mounted."
fi
echo "  Ordinary authenticated admin API writes are unaffected either way."

# ---------------------------------------------------------------------------
echo "--- phase 2 ---"
echo "  No environment flag exists. Activation is the gov_* capability probe in"
echo "  bonfire.service.js, which has been AVAILABLE since the migration."
echo "  The pause controls do NOT make Phase 2 inactive: a manual ingestion run"
echo "  would write evidence. Absence of writes is evidenced only by the"
echo "  measured data stability section below."

# ---------------------------------------------------------------------------
echo "--- scheduler evidence, scoped to the CURRENT container boot ---"
started_at=""
container_id=""

if ! started_at="$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null)"; then
  fail "docker inspect failed for ${CONTAINER} — cannot scope evidence to this boot"
elif [ -z "$started_at" ]; then
  fail "docker inspect returned an empty StartedAt for ${CONTAINER}"
else
  container_id="$(docker inspect -f '{{.Id}}' "$CONTAINER" 2>/dev/null | cut -c1-12)"
  echo "  container ${container_id:-unknown} started at ${started_at}"

  if ! boot_logs="$(docker logs --since "$started_at" "$CONTAINER" 2>&1)"; then
    fail "docker logs failed for ${CONTAINER} — cannot read this boot's evidence"
  elif ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    # Checked explicitly so a missing interpreter reports ITSELF. Without this
    # the pipeline below simply exits non-zero and the failure reads as
    # "scheduler evidence incomplete" — a check describing something other than
    # what actually went wrong, which is the exact defect class this script
    # exists to prevent. See also the pre-rollout guard in release.yml.
    fail "python3 not found on this host (looked for '${PYTHON_BIN}') — scheduler evidence cannot be validated"
  else
    # Parsed as JSON, top-level fields only. Substring matching accepted the
    # scheduler name alone, markers split across records, and nested lookalikes.
    if ! printf '%s\n' "$boot_logs" \
         | "$PYTHON_BIN" "${HERE}/check_scheduler_evidence.py" $SCHEDULERS; then
      fail "scheduler evidence incomplete for this container's boot"
    fi
  fi
fi

# ---------------------------------------------------------------------------
echo "--- measured data stability (before vs after rollout) ---"
if [ -z "$BASELINE_PAIRS" ]; then
  if [ "$REQUIRE_BASELINES" = "1" ]; then
    # Previously this section was simply skipped when unset, which is how a
    # release came to verify nothing about the data while its tests passed.
    fail "no measurements supplied — data stability was not verified. Invoke via post-rollout-verify.sh"
  else
    echo "  skipped (REQUIRE_BASELINES=0)"
  fi
else
  for triple in $BASELINE_PAIRS; do
    # Field count first. `label:value` with a field missing would otherwise parse
    # as expected==actual and report "unchanged" — a malformed measurement
    # silently passing is the exact failure mode this whole script exists to
    # prevent. Caught by test: "fails on a malformed measurement triple".
    colons="${triple//[^:]/}"
    label="${triple%%:*}"
    rest="${triple#*:}"
    expected="${rest%%:*}"
    actual="${rest#*:}"
    if [ "${#colons}" -ne 2 ]; then
      fail "malformed measurement '${triple}' — expected exactly label:before:after"
    elif [ -z "$label" ] || [ -z "$expected" ] || [ -z "$actual" ]; then
      fail "malformed measurement '${triple}' — empty field in label:before:after"
    elif [ "$expected" = "$actual" ]; then
      ok "${label}=${actual} unchanged"
    else
      fail "data drift: ${label} was ${expected}, now ${actual}"
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
