/**
 * Momentum Scoring Service.
 *
 * Computes composite momentum score from the 4 sub-scores
 * and classifies each tool into a momentum stage.
 *
 * Composite formula:
 *   (0.35 * github_acceleration) + (0.25 * funding) + (0.20 * enterprise) + (0.20 * social_velocity)
 *
 * Stages:
 *   < 30 → emerging
 *   30-60 → accelerating
 *   60-80 → dominant
 *   > 80 → explosive
 *   Previous > current by 10+ → declining
 */

const { AiTool, AnalysisRun } = require('../models');
const logger = require('../logging/logger');

/**
 * Compute composite momentum scores for all active tools.
 */
async function computeMomentumScores() {
  const run = await AnalysisRun.create({
    type: 'tool_momentum_scoring',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const tools = await AiTool.findAll({
      where: { status: 'active' },
      attributes: [
        'id', 'name',
        'githubAccelerationScore', 'fundingScore',
        'enterpriseSignalScore', 'socialVelocityScore',
        'compositeMomentumScore', 'momentumStage',
      ],
    });

    if (tools.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No active tools found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let updatedCount = 0;
    const errors = [];
    const stageCounts = { emerging: 0, accelerating: 0, dominant: 0, explosive: 0, declining: 0 };

    for (const tool of tools) {
      try {
        const github = parseFloat(tool.githubAccelerationScore) || 0;
        const funding = parseFloat(tool.fundingScore) || 0;
        const enterprise = parseFloat(tool.enterpriseSignalScore) || 0;
        const social = parseFloat(tool.socialVelocityScore) || 0;

        const composite = (0.35 * github) + (0.25 * funding) + (0.20 * enterprise) + (0.20 * social);
        const previousComposite = parseFloat(tool.compositeMomentumScore) || 0;

        // Classify stage
        let stage;
        if (previousComposite > composite + 10) {
          stage = 'declining';
        } else if (composite > 80) {
          stage = 'explosive';
        } else if (composite > 60) {
          stage = 'dominant';
        } else if (composite > 30) {
          stage = 'accelerating';
        } else {
          stage = 'emerging';
        }

        stageCounts[stage]++;

        await tool.update({
          compositeMomentumScore: Math.round(composite * 100) / 100,
          momentumStage: stage,
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
      results: { updatedCount, stageCounts },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('Momentum scoring complete', {
      input: tools.length,
      updated: updatedCount,
      stages: stageCounts,
      errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Momentum scoring failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

module.exports = { computeMomentumScores };
