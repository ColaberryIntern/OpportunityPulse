/**
 * Social Velocity Engine.
 *
 * Computes how fast a tool's mention frequency is changing.
 * Compares 7-day mention counts against the prior 7-day window
 * to detect acceleration in social/media signals.
 */

const { Op, fn, col } = require('sequelize');
const { AiTool, AiToolMention, ToolSignal, AnalysisRun } = require('../models');
const logger = require('../logging/logger');

/**
 * Compute social velocity scores for all active tools.
 * Formula:
 *   article_density = min(1, count_7d / 20) * 50
 *   delta_bonus = min(50, mention_growth * 50)
 *   social_velocity_score = article_density + delta_bonus
 */
async function computeSocialVelocity() {
  const run = await AnalysisRun.create({
    type: 'tool_social_velocity',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    // Count mentions per tool for last 7 days
    const recentCounts = await AiToolMention.findAll({
      attributes: [
        'aiToolId',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { mentionedAt: { [Op.gte]: sevenDaysAgo } },
      group: ['aiToolId'],
      raw: true,
    });
    const recentMap = new Map(recentCounts.map(r => [r.aiToolId, parseInt(r.count, 10)]));

    // Count mentions per tool for the 7 days before that (days 8-14)
    const priorCounts = await AiToolMention.findAll({
      attributes: [
        'aiToolId',
        [fn('COUNT', col('id')), 'count'],
      ],
      where: {
        mentionedAt: {
          [Op.gte]: fourteenDaysAgo,
          [Op.lt]: sevenDaysAgo,
        },
      },
      group: ['aiToolId'],
      raw: true,
    });
    const priorMap = new Map(priorCounts.map(r => [r.aiToolId, parseInt(r.count, 10)]));

    // Get all tools that have any mentions
    const toolIds = new Set([...recentMap.keys(), ...priorMap.keys()]);

    if (toolIds.size === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No tools with mentions found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let updatedCount = 0;
    const errors = [];

    for (const toolId of toolIds) {
      try {
        const count7d = recentMap.get(toolId) || 0;
        const countPrior = priorMap.get(toolId) || 0;

        // Compute growth rate
        const mentionGrowth = countPrior > 0
          ? (count7d - countPrior) / countPrior
          : (count7d > 0 ? 1 : 0);

        // Compute velocity score
        const articleDensity = Math.min(1, count7d / 20) * 50;
        const deltaBonus = Math.min(50, Math.max(0, mentionGrowth * 50));
        const velocityScore = Math.min(100, articleDensity + deltaBonus);

        // Create signal record
        await ToolSignal.create({
          aiToolId: toolId,
          signalType: 'social_velocity',
          signalValue: velocityScore,
          signalDelta: count7d - countPrior,
          source: 'mention_analysis',
          sourceData: {
            count7d,
            countPrior,
            mentionGrowth,
            articleDensity,
            deltaBonus,
          },
        });

        // Update tool's social velocity score
        await AiTool.update(
          { socialVelocityScore: velocityScore },
          { where: { id: toolId } }
        );

        updatedCount++;
      } catch (err) {
        errors.push({ toolId, error: err.message });
      }
    }

    // Reset velocity to 0 for tools with no recent mentions
    await AiTool.update(
      { socialVelocityScore: 0 },
      {
        where: {
          id: { [Op.notIn]: [...toolIds] },
          socialVelocityScore: { [Op.gt]: 0 },
        },
      }
    );

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: toolIds.size,
      outputCount: updatedCount,
      results: { updatedCount, toolsWithMentions: toolIds.size },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('Social velocity computation complete', {
      toolsAnalyzed: toolIds.size,
      updated: updatedCount,
      errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Social velocity computation failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

module.exports = { computeSocialVelocity };
