const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { classifyByRules } = require('./classification.rules');
const { getAIClient } = require('../analysis/ai.client');
const { buildClassificationPrompt } = require('./actionEngine.prompts');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;
const LLM_BATCH_SIZE = 10;

/**
 * Classify unclassified active opportunities in batches.
 * Deterministic rules first, optional LLM enrichment.
 */
async function classifyOpportunities({ useLLM = false, type = null } = {}) {
  const run = await AnalysisRun.create({
    type: 'classification',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const where = {
      actionType: { [Op.is]: null },
      status: 'active',
    };
    if (type) where.type = type;

    const opportunities = await Opportunity.findAll({
      where,
      order: [['published_at', 'DESC']],
      limit: BATCH_SIZE,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No unclassified opportunities found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let successCount = 0;
    let tokensUsed = 0;
    const errors = [];

    // Step 1: Deterministic classification for all
    const classifications = opportunities.map((opp) => ({
      opportunity: opp,
      result: classifyByRules(opp),
    }));

    // Step 2: Optional LLM enrichment for non-IGNORE classifications
    if (useLLM) {
      const enrichable = classifications.filter((c) => c.result.actionType !== 'IGNORE');
      for (let i = 0; i < enrichable.length; i += LLM_BATCH_SIZE) {
        const batch = enrichable.slice(i, i + LLM_BATCH_SIZE);
        try {
          const tokens = await enrichWithLLM(batch);
          tokensUsed += tokens;
        } catch (err) {
          logger.warn('LLM enrichment batch failed, keeping rule-based results', { error: err.message });
        }
      }
    }

    // Step 3: Persist classifications
    for (const { opportunity, result } of classifications) {
      try {
        const existingAnalysis = opportunity.aiAnalysis || {};
        await opportunity.update({
          actionType: result.actionType,
          aiAnalysis: {
            ...existingAnalysis,
            classification: {
              actionType: result.actionType,
              confidenceScore: result.confidenceScore,
              reasoning: result.reasoning,
              method: useLLM && result.llmEnriched ? 'rules+llm' : 'rules',
              classifiedAt: new Date().toISOString(),
            },
          },
        });
        successCount++;
      } catch (err) {
        errors.push({ opportunityId: opportunity.id, error: err.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: opportunities.length,
      outputCount: successCount,
      results: {
        classifiedCount: successCount,
        byType: countByActionType(classifications),
        usedLLM: useLLM,
      },
      errors: errors.length > 0 ? errors : [],
      tokensUsed,
      completedAt: new Date(),
    });

    logger.info('Classification batch complete', {
      input: opportunities.length,
      classified: successCount,
      errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Classification failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

/**
 * Classify a single opportunity on-demand.
 */
async function classifySingle(opportunityId, { useLLM = false } = {}) {
  const opportunity = await Opportunity.findByPk(opportunityId);
  if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found`);

  const result = classifyByRules(opportunity);

  if (useLLM && result.actionType !== 'IGNORE') {
    try {
      await enrichWithLLM([{ opportunity, result }]);
    } catch (err) {
      logger.warn('LLM enrichment failed for single classification', { error: err.message });
    }
  }

  const existingAnalysis = opportunity.aiAnalysis || {};
  await opportunity.update({
    actionType: result.actionType,
    aiAnalysis: {
      ...existingAnalysis,
      classification: {
        actionType: result.actionType,
        confidenceScore: result.confidenceScore,
        reasoning: result.reasoning,
        method: useLLM && result.llmEnriched ? 'rules+llm' : 'rules',
        classifiedAt: new Date().toISOString(),
      },
    },
  });

  return result;
}

/**
 * Enrich classification results with LLM reasoning.
 * Mutates result objects in-place with enhanced reasoning.
 */
async function enrichWithLLM(classificationBatch) {
  const aiClient = getAIClient();
  const { systemPrompt, userPrompt } = buildClassificationPrompt(
    classificationBatch.map(({ opportunity, result }) => ({
      id: opportunity.id,
      type: opportunity.type,
      title: opportunity.title,
      description: (opportunity.description || '').slice(0, 300),
      value: opportunity.value,
      score: opportunity.aiScore,
      tags: opportunity.tags,
      ruleAction: result.actionType,
      ruleReasoning: result.reasoning,
    }))
  );

  const { content, tokensUsed } = await aiClient.chat(systemPrompt, userPrompt, {
    maxTokens: 1500,
    temperature: 0.3,
  });

  try {
    const parsed = JSON.parse(content);
    if (parsed.enrichments && Array.isArray(parsed.enrichments)) {
      for (const enrichment of parsed.enrichments) {
        const match = classificationBatch.find((c) => c.opportunity.id === enrichment.id);
        if (match && enrichment.reasoning) {
          match.result.reasoning = enrichment.reasoning;
          match.result.llmEnriched = true;
          if (enrichment.actionType && enrichment.actionType !== match.result.actionType) {
            match.result.actionType = enrichment.actionType;
            match.result.confidenceScore = enrichment.confidence || match.result.confidenceScore;
          }
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to parse LLM classification enrichment', { error: err.message });
  }

  return tokensUsed;
}

function countByActionType(classifications) {
  const counts = {};
  for (const { result } of classifications) {
    counts[result.actionType] = (counts[result.actionType] || 0) + 1;
  }
  return counts;
}

module.exports = {
  classifyOpportunities,
  classifySingle,
};
