#!/usr/bin/env bash
#
# Measure the state a release must leave unchanged. Emits `label=value` lines,
# one per measurement, on stdout. Any failure is fatal: a missing measurement is
# not the same as an unchanged one, and silently skipping a query would turn a
# drift check into a no-op.
#
# Called twice by release.yml — once before rollout, once after — and paired by
# pair-baselines.sh. The same script is driven by the integration test with a
# mocked `docker`, so the path exercised in tests is the path production runs.
#
# The five gov_* counts are measured explicitly rather than assumed to be zero.
# Hardcoding zero would stop being true the moment Phase 2 is activated, and a
# check that is only correct before activation is a check that expires.

set -uo pipefail

PG_CONTAINER="${PG_CONTAINER:-op-postgres}"

die() {
  echo "BASELINE COLLECTION FAILED: $*" >&2
  exit 1
}

DBU="$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER 2>/dev/null)" \
  || die "cannot read POSTGRES_USER from ${PG_CONTAINER}"
DBN="$(docker exec "$PG_CONTAINER" printenv POSTGRES_DB 2>/dev/null)" \
  || die "cannot read POSTGRES_DB from ${PG_CONTAINER}"
[ -n "$DBU" ] && [ -n "$DBN" ] || die "empty database credentials from ${PG_CONTAINER}"

query() {
  docker exec "$PG_CONTAINER" psql -U "$DBU" -d "$DBN" -t -A -c "$1" 2>/dev/null
}

emit() {
  local label="$1" sql="$2" value
  value="$(query "$sql")"
  local rc=$?
  [ "$rc" -eq 0 ] || die "query error for ${label} (psql exit ${rc})"
  value="$(printf '%s' "$value" | tr -d '[:space:]')"
  [ -n "$value" ] || die "empty measurement for ${label}"
  printf '%s=%s\n' "$label" "$value"
}

emit ingestion_logs        "select count(*) from ingestion_logs;"
emit bonfire_opportunities "select count(*) from bonfire_opportunities;"
emit close_date_non_null   "select count(close_date) from bonfire_opportunities;"
emit deadline_checksum     "select coalesce(md5(string_agg(id::text || coalesce(close_date::text,'-'), ',' order by id)),'empty') from bonfire_opportunities;"

# All five Phase 2 tables, measured individually so drift names the table.
emit gov_canonical_opportunities "select count(*) from gov_canonical_opportunities;"
emit gov_source_aliases          "select count(*) from gov_source_aliases;"
emit gov_source_snapshots        "select count(*) from gov_source_snapshots;"
emit gov_solicitation_families   "select count(*) from gov_solicitation_families;"
emit gov_family_members          "select count(*) from gov_family_members;"
