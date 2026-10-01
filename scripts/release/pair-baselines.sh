#!/usr/bin/env bash
#
# Pair two baseline files into the `label:before:after` form verify-release.sh
# consumes. Fails if a label is present in one file and not the other, so a
# measurement that silently stopped being collected is caught rather than
# quietly dropping its comparison.
#
# usage: pair-baselines.sh <before-file> <after-file>

set -uo pipefail

BEFORE="${1:-}"
AFTER="${2:-}"

die() {
  echo "BASELINE PAIRING FAILED: $*" >&2
  exit 1
}

[ -n "$BEFORE" ] && [ -n "$AFTER" ] || die "usage: pair-baselines.sh <before> <after>"
[ -f "$BEFORE" ] || die "before-measurements file not found: ${BEFORE}"
[ -f "$AFTER" ]  || die "after-measurements file not found: ${AFTER}"

[ -s "$BEFORE" ] || die "before-measurements file is empty: ${BEFORE}"
[ -s "$AFTER" ]  || die "after-measurements file is empty: ${AFTER}"

pairs=""
count=0

while IFS='=' read -r label before_value; do
  [ -n "$label" ] || continue
  after_value="$(grep -m1 "^${label}=" "$AFTER" | cut -d'=' -f2-)"
  [ -n "$after_value" ] || die "label '${label}' measured before rollout but missing after"
  # The verifier splits on ':' so no measurement may contain one.
  case "${before_value}${after_value}" in
    *:*) die "label '${label}' has a value containing ':', which the pair format cannot carry" ;;
  esac
  pairs="${pairs}${label}:${before_value}:${after_value} "
  count=$((count + 1))
done < "$BEFORE"

# The reverse direction: a label that appeared only AFTER rollout.
while IFS='=' read -r label _; do
  [ -n "$label" ] || continue
  grep -q "^${label}=" "$BEFORE" || die "label '${label}' measured after rollout but missing before"
done < "$AFTER"

[ "$count" -gt 0 ] || die "no measurements to compare"

printf '%s\n' "${pairs% }"
