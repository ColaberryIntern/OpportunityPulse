#!/usr/bin/env bash
#
# The single post-rollout entry point release.yml invokes.
#
# It exists so that the data comparisons are part of the path production runs,
# not something a test supplies by hand. The previous arrangement called
# verify-release.sh with no BASELINE_PAIRS, so the drift checks the unit tests
# exercised never executed during an actual release — the tests passed and the
# release verified nothing about the data.
#
# usage: BASELINE_BEFORE=<file> post-rollout-verify.sh

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE_BEFORE="${BASELINE_BEFORE:-}"
BASELINE_AFTER="${BASELINE_AFTER:-/tmp/op-baseline-after.txt}"

die() {
  echo "POST-ROLLOUT VERIFICATION FAILED: $*" >&2
  exit 1
}

[ -n "$BASELINE_BEFORE" ] || die "BASELINE_BEFORE is not set; pre-rollout measurements are required"
[ -f "$BASELINE_BEFORE" ] || die "pre-rollout measurements not found at ${BASELINE_BEFORE}"

echo "--- measuring state after rollout ---"
bash "${HERE}/collect-baselines.sh" > "$BASELINE_AFTER" \
  || die "could not measure state after rollout"

PAIRS="$(bash "${HERE}/pair-baselines.sh" "$BASELINE_BEFORE" "$BASELINE_AFTER")" \
  || die "could not pair before/after measurements"

[ -n "$PAIRS" ] || die "paired measurement set is empty"

export BASELINE_PAIRS="$PAIRS"
exec bash "${HERE}/verify-release.sh"
