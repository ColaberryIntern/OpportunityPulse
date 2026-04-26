#!/usr/bin/env node
// One-off: backfill source_hash on existing bonfire_strategic_opportunities.
// Run once after the source_hash column migration; safe to re-run (idempotent).

require('dotenv').config();

(async () => {
  const {
    BonfireStrategicOpportunity,
    BonfireOpportunity,
    sequelize,
  } = require('../src/models');
  const { computeSourceHash } = require('../src/bonfire/bonfireStrategist.service');

  const rows = await BonfireStrategicOpportunity.findAll({
    where: { sourceHash: null },
  });
  console.log(`Backfilling ${rows.length} strategic opps...`);

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const ids = row.sourceOpportunityIds || [];
    if (!ids.length) { skipped++; continue; }
    const opps = await BonfireOpportunity.findAll({
      where: { id: ids },
      attributes: ['id', 'enrichmentHash'],
    });
    if (!opps.length) { skipped++; continue; }
    row.sourceHash = computeSourceHash(opps);
    await row.save();
    updated++;
  }

  console.log(JSON.stringify({ updated, skipped, total: rows.length }, null, 2));
  await sequelize.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
