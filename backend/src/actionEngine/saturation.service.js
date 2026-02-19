const { Op, fn, col, literal } = require('sequelize');
const { Opportunity, AnalysisRun, sequelize } = require('../models');
const { OPPORTUNITY_QUADRANTS } = require('../config/constants');
const logger = require('../logging/logger');

/**
 * Compute saturation index for all active opportunities.
 * Entirely heuristic — zero external API calls.
 *
 * Groups opportunities by (type, category), computes demand and competition
 * signals, normalizes to 0-100, assigns quadrant labels.
 */
async function computeSaturationIndex() {
  const run = await AnalysisRun.create({
    type: 'saturation_computation',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get all active opportunities grouped by type + category
    const activeOpps = await Opportunity.findAll({
      where: { status: 'active' },
      attributes: ['id', 'type', 'category', 'source', 'aiScore', 'value', 'publishedAt', 'expiresAt', 'createdAt'],
      raw: true,
    });

    if (activeOpps.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No active opportunities for saturation analysis.' },
        completedAt: new Date(),
      });
      return run;
    }

    // Group by (type, category)
    const groups = {};
    for (const opp of activeOpps) {
      const key = `${opp.type}::${opp.category || 'uncategorized'}`;
      if (!groups[key]) {
        groups[key] = { type: opp.type, category: opp.category || 'uncategorized', opps: [] };
      }
      groups[key].opps.push(opp);
    }

    // Compute signals per group
    const groupSignals = {};
    for (const [key, group] of Object.entries(groups)) {
      const opps = group.opps;
      const recentCount = opps.filter((o) => new Date(o.publishedAt || o.createdAt) >= thirtyDaysAgo).length;
      const priorCount = opps.filter((o) => {
        const d = new Date(o.publishedAt || o.createdAt);
        return d >= sixtyDaysAgo && d < thirtyDaysAgo;
      }).length;

      const growthRate = priorCount > 0 ? (recentCount - priorCount) / priorCount : recentCount > 0 ? 1 : 0;
      const avgValue = opps.reduce((sum, o) => sum + (parseFloat(o.value) || 0), 0) / opps.length;
      const highScoreRatio = opps.filter((o) => parseFloat(o.aiScore) >= 60).length / opps.length;
      const uniqueSources = new Set(opps.map((o) => o.source)).size;
      const nearExpiryRatio = opps.filter((o) => o.expiresAt && new Date(o.expiresAt) <= sevenDaysFromNow).length / opps.length;

      // Demand signals (higher = more demand)
      const demandScore = normalizeScore([
        { value: recentCount, weight: 0.3, max: 50 },
        { value: growthRate, weight: 0.25, max: 2 },
        { value: avgValue, weight: 0.2, max: 500000 },
        { value: highScoreRatio, weight: 0.25, max: 1 },
      ]);

      // Competition signals (higher = more competition)
      const competitionScore = normalizeScore([
        { value: opps.length, weight: 0.35, max: 100 },
        { value: uniqueSources, weight: 0.3, max: 10 },
        { value: 1 - nearExpiryRatio, weight: 0.35, max: 1 },
      ]);

      // Floor of 20 for groups with < 5 opportunities (insufficient data)
      const floor = opps.length < 5 ? 20 : 0;

      const saturationIndex = Math.max(floor, Math.round(
        competitionScore * 0.6 + (100 - demandScore) * 0.4
      ));

      const quadrant = getQuadrant(demandScore, competitionScore);

      groupSignals[key] = {
        ...group,
        demandScore: Math.round(demandScore),
        competitionScore: Math.round(competitionScore),
        saturationIndex,
        quadrant,
        recentCount,
        growthRate: Math.round(growthRate * 100) / 100,
        uniqueSources,
      };
    }

    // Update each opportunity with its group's saturation data
    let updatedCount = 0;
    const errors = [];

    for (const [key, group] of Object.entries(groupSignals)) {
      const oppIds = group.opps.map((o) => o.id);

      try {
        await Opportunity.update(
          {
            saturationIndex: group.saturationIndex,
            opportunityQuadrant: group.quadrant,
          },
          { where: { id: { [Op.in]: oppIds } } }
        );
        updatedCount += oppIds.length;
      } catch (err) {
        errors.push({ group: key, error: err.message });
      }
    }

    // Also store detailed saturation data in aiAnalysis for a sample
    // (Bulk update for JSONB merge is complex, so we do top opportunities)
    const topOpps = await Opportunity.findAll({
      where: { status: 'active', actionType: { [Op.ne]: null } },
      order: [['ai_score', 'DESC']],
      limit: 100,
    });

    for (const opp of topOpps) {
      const key = `${opp.type}::${opp.category || 'uncategorized'}`;
      const group = groupSignals[key];
      if (group) {
        const existingAnalysis = opp.aiAnalysis || {};
        await opp.update({
          aiAnalysis: {
            ...existingAnalysis,
            saturation: {
              index: group.saturationIndex,
              quadrant: group.quadrant,
              demandScore: group.demandScore,
              competitionScore: group.competitionScore,
              groupSize: group.opps.length,
              computedAt: new Date().toISOString(),
            },
          },
        });
      }
    }

    const groupSummary = Object.values(groupSignals).map((g) => ({
      type: g.type,
      category: g.category,
      count: g.opps.length,
      saturationIndex: g.saturationIndex,
      quadrant: g.quadrant,
      demandScore: g.demandScore,
      competitionScore: g.competitionScore,
    }));

    await run.update({
      status: errors.length > 0 ? 'partial' : 'success',
      inputCount: activeOpps.length,
      outputCount: updatedCount,
      results: {
        groupCount: Object.keys(groupSignals).length,
        updatedOpportunities: updatedCount,
        groups: groupSummary,
      },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('Saturation computation complete', {
      groups: Object.keys(groupSignals).length,
      updated: updatedCount,
    });

    return run;
  } catch (error) {
    logger.error('Saturation computation failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

/**
 * Normalize weighted signals to a 0-100 score.
 */
function normalizeScore(signals) {
  let score = 0;
  for (const { value, weight, max } of signals) {
    const normalized = Math.min(1, Math.max(0, value / max));
    score += normalized * weight * 100;
  }
  return Math.min(100, Math.max(0, score));
}

/**
 * Determine the quadrant based on demand and competition scores.
 */
function getQuadrant(demandScore, competitionScore) {
  const highDemand = demandScore >= 50;
  const highCompetition = competitionScore >= 50;

  if (highDemand && !highCompetition) return OPPORTUNITY_QUADRANTS.HD_LC;
  if (highDemand && highCompetition) return OPPORTUNITY_QUADRANTS.HD_HC;
  if (!highDemand && !highCompetition) return OPPORTUNITY_QUADRANTS.LD_LC;
  return OPPORTUNITY_QUADRANTS.LD_HC;
}

module.exports = { computeSaturationIndex };
