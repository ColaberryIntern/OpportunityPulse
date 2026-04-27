#!/usr/bin/env node
// One-off backfill: mirror all enriched bonfire_opportunities into the unified
// opportunities table. Idempotent — safe to re-run.
//
// Useful after the migration that adds 'bonfire' to the opportunities.type
// validator, to backfill the rows that existed before the sync was wired in.

require('dotenv').config();

(async () => {
  const { syncBonfireToOpportunities } = require('../src/bonfire/bonfireSync.service');
  // Look back a long way — backfill should pick up everything.
  const since = new Date(0);
  console.log('=== Bonfire sync (backfill mode) ===');
  const out = await syncBonfireToOpportunities({ since });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
