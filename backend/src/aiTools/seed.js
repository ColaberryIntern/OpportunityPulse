const { AiTool } = require('../models');
const seedTools = require('./data/seedTools.json');
const logger = require('../logging/logger');

/**
 * Idempotent seed script for AI tools.
 * Uses findOrCreate by slug to avoid duplicates on repeated runs.
 */
async function seedAiTools() {
  let created = 0;
  let skipped = 0;

  for (const tool of seedTools) {
    const [record, wasCreated] = await AiTool.findOrCreate({
      where: { slug: tool.slug },
      defaults: tool,
    });
    if (wasCreated) created++;
    else skipped++;
  }

  logger.info('AI Tools seeded', { created, skipped, total: seedTools.length });
  return { created, skipped };
}

module.exports = { seedAiTools };
