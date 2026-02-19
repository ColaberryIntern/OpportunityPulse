const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { getActionTemplate } = require('./actionTemplates');
const { getAIClient } = require('../analysis/ai.client');
const { buildActionPlanPrompt } = require('./actionEngine.prompts');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;
const LLM_BATCH_SIZE = 10;

/**
 * Generate action recommendations for classified opportunities
 * that don't yet have an action plan.
 */
async function generateActionRecommendations({ useLLM = true } = {}) {
  const run = await AnalysisRun.create({
    type: 'action_recommendation',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // Find classified, non-IGNORE opportunities without an action plan
    const opportunities = await Opportunity.findAll({
      where: {
        actionType: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: 'IGNORE' }] },
        status: 'active',
      },
      order: [['ai_score', 'DESC NULLS LAST']],
      limit: BATCH_SIZE,
    });

    // Filter to only those without an existing actionPlan in aiAnalysis
    const needsPlan = opportunities.filter((opp) => {
      const analysis = opp.aiAnalysis || {};
      return !analysis.actionPlan;
    });

    if (needsPlan.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No opportunities need action plans.' },
        completedAt: new Date(),
      });
      return run;
    }

    let successCount = 0;
    let tokensUsed = 0;
    const errors = [];

    // Step 1: Generate deterministic templates for all
    const plans = needsPlan.map((opp) => ({
      opportunity: opp,
      plan: getActionTemplate(opp.actionType, opp),
    }));

    // Step 2: Optional LLM customization
    if (useLLM) {
      for (let i = 0; i < plans.length; i += LLM_BATCH_SIZE) {
        const batch = plans.slice(i, i + LLM_BATCH_SIZE);
        try {
          const tokens = await customizeWithLLM(batch);
          tokensUsed += tokens;
        } catch (err) {
          logger.warn('LLM action plan customization failed, keeping templates', { error: err.message });
        }
      }
    }

    // Step 3: Persist action plans
    for (const { opportunity, plan } of plans) {
      if (!plan) continue;
      try {
        const existingAnalysis = opportunity.aiAnalysis || {};
        await opportunity.update({
          aiAnalysis: {
            ...existingAnalysis,
            actionPlan: {
              ...plan,
              generatedAt: new Date().toISOString(),
              method: plan.llmCustomized ? 'template+llm' : 'template',
            },
          },
        });
        successCount++;
      } catch (err) {
        errors.push({ opportunityId: opportunity.id, error: err.message });
      }
    }

    await run.update({
      status: errors.length > 0 ? 'partial' : 'success',
      inputCount: needsPlan.length,
      outputCount: successCount,
      results: {
        generatedCount: successCount,
        usedLLM: useLLM,
      },
      errors: errors.length > 0 ? errors : [],
      tokensUsed,
      completedAt: new Date(),
    });

    logger.info('Action recommendation generation complete', {
      input: needsPlan.length,
      generated: successCount,
    });

    return run;
  } catch (error) {
    logger.error('Action recommendation generation failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

/**
 * Generate an action plan for a single opportunity on-demand.
 */
async function generateSingleActionPlan(opportunityId, { useLLM = true } = {}) {
  const opportunity = await Opportunity.findByPk(opportunityId);
  if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found`);

  if (!opportunity.actionType || opportunity.actionType === 'IGNORE') {
    throw new Error('Opportunity must be classified with a non-IGNORE action type first');
  }

  const plan = getActionTemplate(opportunity.actionType, opportunity);
  if (!plan) throw new Error(`No template for action type: ${opportunity.actionType}`);

  if (useLLM) {
    try {
      await customizeWithLLM([{ opportunity, plan }]);
    } catch (err) {
      logger.warn('LLM customization failed for single plan', { error: err.message });
    }
  }

  const existingAnalysis = opportunity.aiAnalysis || {};
  await opportunity.update({
    aiAnalysis: {
      ...existingAnalysis,
      actionPlan: {
        ...plan,
        generatedAt: new Date().toISOString(),
        method: plan.llmCustomized ? 'template+llm' : 'template',
      },
    },
  });

  return plan;
}

/**
 * Customize action plans using LLM.
 * Mutates plan objects in-place.
 */
async function customizeWithLLM(planBatch) {
  const aiClient = getAIClient();
  const { systemPrompt, userPrompt } = buildActionPlanPrompt(
    planBatch.map(({ opportunity, plan }) => ({
      id: opportunity.id,
      title: opportunity.title,
      type: opportunity.type,
      actionType: opportunity.actionType,
      description: (opportunity.description || '').slice(0, 400),
      value: opportunity.value,
      deadline: opportunity.expiresAt,
      category: opportunity.category,
      templateSummary: plan.summary,
    }))
  );

  const { content, tokensUsed } = await aiClient.chat(systemPrompt, userPrompt, {
    maxTokens: 2000,
    temperature: 0.4,
  });

  try {
    const parsed = JSON.parse(content);
    if (parsed.plans && Array.isArray(parsed.plans)) {
      for (const customPlan of parsed.plans) {
        const match = planBatch.find((p) => p.opportunity.id === customPlan.id);
        if (match) {
          if (customPlan.summary) match.plan.summary = customPlan.summary;
          if (customPlan.steps && Array.isArray(customPlan.steps)) {
            match.plan.steps = customPlan.steps;
          }
          if (customPlan.estimatedEffort) match.plan.estimatedEffort = customPlan.estimatedEffort;
          if (customPlan.riskLevel) match.plan.riskLevel = customPlan.riskLevel;
          if (customPlan.keyConsiderations) match.plan.keyConsiderations = customPlan.keyConsiderations;
          match.plan.llmCustomized = true;
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to parse LLM action plan response', { error: err.message });
  }

  return tokensUsed;
}

module.exports = {
  generateActionRecommendations,
  generateSingleActionPlan,
};
