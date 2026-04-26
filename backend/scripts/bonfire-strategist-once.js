#!/usr/bin/env node
// One-off Strategist run. Same code path as the cron callback. Useful for
// manual triggering (admin clicks 'Run' in the UI is the same call).
//
// Usage: node scripts/bonfire-strategist-once.js [--force]

require('dotenv').config();

const force = process.argv.includes('--force');

(async () => {
  const { runStrategist } = require('../src/bonfire/bonfireStrategist.service');
  console.log('=== Strategist: starting ===');
  console.log('  force:', force);
  const started = Date.now();
  try {
    const out = await runStrategist({ force });
    console.log('=== Strategist: complete ===');
    console.log(`  duration: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('=== Strategist: threw ===');
    console.error(e.stack || e.message);
    process.exit(1);
  }
})();
