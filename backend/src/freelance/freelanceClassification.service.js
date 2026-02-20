const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const logger = require('../logging/logger');

const BATCH_SIZE = 10;

const CLASSIFICATION_SYSTEM_PROMPT = `You are a freelance project classifier for AI/ML opportunities. For each project, analyze the title and description to extract structured metadata.

Return JSON:
{
  "classifications": [
    {
      "id": <opportunity_id>,
      "skills": ["skill1", "skill2"],
      "complexity": "simple" | "moderate" | "complex" | "enterprise",
      "projectType": "one-off" | "ongoing" | "retainer" | "product-build",
      "saasConversionPotential": 0-100,
      "demandSignals": ["signal1", "signal2"],
      "verticalFit": ["industry1", "industry2"]
    }
  ]
}

Guidelines:
- skills: Extract specific technical skills (Python, TensorFlow, React, etc.), not generic terms
- complexity: simple (<$2k, well-defined), moderate ($2k-$10k), complex ($10k-$50k), enterprise (>$50k or org-wide)
- projectType: one-off (single deliverable), ongoing (multi-month), retainer (recurring work), product-build (building a product)
- saasConversionPotential: How likely this project pattern could become a reusable SaaS product (0-100)
- demandSignals: Patterns like "recurring need", "growing niche", "enterprise adoption", "automation trend"
- verticalFit: Industry verticals this fits (healthcare, fintech, e-commerce, etc.)`;

/**
 * Classify unprocessed freelance opportunities using LLM batch processing.
 * Stores results in aiAnalysis JSONB field.
 */
async function classifyFreelanceOpportunities() {
  const run = await AnalysisRun.create({
    type: 'freelance_classification',
    status: 'running',
    opportunityType: 'freelance',
    startedAt: new Date(),
  });

  try {
    const opportunities = await Opportunity.findAll({
      where: {
        type: 'freelance',
        status: 'active',
        [Op.or]: [
          { aiAnalysis: { [Op.is]: null } },
          { aiAnalysis: {} },
          { aiAnalysis: { classified: { [Op.is]: null } } },
        ],
      },
      order: [['created_at', 'DESC']],
      limit: BATCH_SIZE * 5,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No unclassified freelance opportunities found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let successCount = 0;
    let totalTokens = 0;
    const errors = [];

    // Process in batches
    for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
      const batch = opportunities.slice(i, i + BATCH_SIZE);

      try {
        const tokens = await classifyBatch(batch);
        totalTokens += tokens;
        successCount += batch.length;
      } catch (err) {
        logger.warn('Freelance classification batch failed', { error: err.message, batchStart: i });
        errors.push({ batchStart: i, error: err.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: opportunities.length,
      outputCount: successCount,
      tokensUsed: totalTokens,
      results: { classifiedCount: successCount },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('Freelance classification complete', {
      input: opportunities.length,
      classified: successCount,
      tokens: totalTokens,
    });

    return run;
  } catch (error) {
    logger.error('Freelance classification failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

async function classifyBatch(opportunities) {
  const aiClient = getAIClient();

  const userPrompt = JSON.stringify(
    opportunities.map((opp) => ({
      id: opp.id,
      title: opp.title,
      description: (opp.description || '').slice(0, 500),
      budget: opp.value || opp.sourceData?.budget || null,
      tags: opp.tags || [],
      platform: opp.sourceData?.platform || opp.source,
    }))
  );

  const { content, tokensUsed } = await aiClient.chat(
    CLASSIFICATION_SYSTEM_PROMPT,
    userPrompt,
    { maxTokens: 2000, temperature: 0.3 }
  );

  try {
    const parsed = JSON.parse(content);
    const classifications = parsed.classifications || [];

    for (const classification of classifications) {
      const opp = opportunities.find((o) => o.id === classification.id);
      if (!opp) continue;

      const existingAnalysis = opp.aiAnalysis || {};
      await opp.update({
        aiAnalysis: {
          ...existingAnalysis,
          classified: true,
          classifiedAt: new Date().toISOString(),
          skills: classification.skills || [],
          complexity: classification.complexity || 'moderate',
          projectType: classification.projectType || 'one-off',
          saasConversionPotential: classification.saasConversionPotential || 0,
          demandSignals: classification.demandSignals || [],
          verticalFit: classification.verticalFit || [],
        },
      });
    }
  } catch (err) {
    logger.warn('Failed to parse freelance classification response', { error: err.message });
  }

  return tokensUsed;
}

module.exports = { classifyFreelanceOpportunities };
