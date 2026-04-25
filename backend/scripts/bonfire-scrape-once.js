#!/usr/bin/env node
// One-off Bonfire scrape runner. Same code path as the cron callback —
// useful for manual smoke runs and for verifying changes without spinning
// up the full backend.
//
// Usage:
//   node scripts/bonfire-scrape-once.js               # uses BONFIRE_SCRAPER_PHASE
//   node scripts/bonfire-scrape-once.js --phase=A
//   node scripts/bonfire-scrape-once.js --phase=A --dry-run
//   node scripts/bonfire-scrape-once.js --phase=B --agencies=dhantx
//
// Reads .env. Honors BONFIRE_SCRAPER_HEADLESS — set false in .env to watch
// the browser drive the multi-step login.

require('dotenv').config();

const args = process.argv.slice(2);
const opts = { phase: undefined, dryRun: false, agencies: undefined };
for (const a of args) {
  if (a === '--dry-run') opts.dryRun = true;
  else if (a.startsWith('--phase=')) opts.phase = a.slice('--phase='.length).toUpperCase();
  else if (a.startsWith('--agencies=')) opts.agencies = a.slice('--agencies='.length).split(',').filter(Boolean);
}

(async () => {
  const { runScrape } = require('../src/bonfire/scraper');
  console.log('=== Bonfire scrape: starting ===');
  console.log('  opts:', JSON.stringify(opts));
  const started = Date.now();
  try {
    const summary = await runScrape(opts);
    console.log('=== Bonfire scrape: complete ===');
    console.log(`  duration: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.escalated ? 1 : 0);
  } catch (e) {
    console.error('=== Bonfire scrape: threw ===');
    console.error(e.stack || e.message);
    process.exit(1);
  }
})();
