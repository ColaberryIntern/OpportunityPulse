/**
 * GitHub Acceleration Tracker.
 *
 * Computes GitHub growth acceleration for AI tools by comparing current
 * star/fork counts with previously stored values in sourceData.github.
 * Creates ToolSignal records for historical tracking.
 */

const { Op } = require('sequelize');
const { AiTool, ToolSignal, AnalysisRun } = require('../models');
const logger = require('../logging/logger');

/**
 * Compute GitHub acceleration scores for all tools with GitHub data.
 * Compares current sourceData.github values with previous snapshot.
 */
async function computeGithubAcceleration() {
  const run = await AnalysisRun.create({
    type: 'tool_github_acceleration',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // Find tools that have GitHub source data
    const tools = await AiTool.findAll({
      where: {
        status: 'active',
        sourceData: { github: { [Op.ne]: null } },
      },
    });

    if (tools.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No tools with GitHub data found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let updatedCount = 0;
    const errors = [];

    for (const tool of tools) {
      try {
        const github = tool.sourceData?.github;
        if (!github || !github.stars) continue;

        // Get last GitHub signal to compute delta
        const lastSignal = await ToolSignal.findOne({
          where: {
            aiToolId: tool.id,
            signalType: 'github_growth',
          },
          order: [['created_at', 'DESC']],
        });

        const prevStars = lastSignal?.sourceData?.stars || github.stars;
        const currentStars = github.stars;

        // Compute growth rate
        const starGrowthRate = prevStars > 0
          ? (currentStars - prevStars) / prevStars
          : 0;

        // Compute acceleration score (0-100)
        // Weight: star growth * 0.7, absolute size bonus * 0.3
        const growthComponent = Math.min(50, starGrowthRate * 500); // 10% growth = 50 points
        const sizeBonus = Math.min(50, Math.log10(Math.max(currentStars, 1)) * 10);
        const accelerationScore = Math.min(100, Math.max(0, growthComponent + sizeBonus));

        // Create signal record
        await ToolSignal.create({
          aiToolId: tool.id,
          signalType: 'github_growth',
          signalValue: currentStars,
          signalDelta: currentStars - prevStars,
          source: 'github',
          sourceData: {
            stars: currentStars,
            prevStars,
            growthRate: starGrowthRate,
            accelerationScore,
          },
        });

        // Update tool's acceleration score
        await tool.update({
          githubAccelerationScore: accelerationScore,
          openSource: true,
          githubUrl: github.sourceUrl || tool.githubUrl,
        });

        updatedCount++;
      } catch (err) {
        errors.push({ toolId: tool.id, name: tool.name, error: err.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: tools.length,
      outputCount: updatedCount,
      results: { updatedCount },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('GitHub acceleration computation complete', {
      input: tools.length,
      updated: updatedCount,
      errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('GitHub acceleration computation failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

module.exports = { computeGithubAcceleration };
