/**
 * RSS Intelligence Enrichment Service.
 *
 * Extracts structured signals (budget, actor, enterprise, compliance)
 * from opportunity text using deterministic extractors first, LLM fallback second.
 * Follows the domainClassifier.service.js pattern: AnalysisRun tracking, batch processing.
 */

const { Op } = require('sequelize');
const { Opportunity, AnalysisRun } = require('../models');
const logger = require('../logging/logger');
const { extractAllSignals, hasEnrichmentPotential } = require('./rssSignalExtractors');
const { buildRssEnrichmentPrompt } = require('./rssEnrichment.prompts');

const BATCH_SIZE = 50;
const LLM_BATCH_SIZE = 10;

/**
 * Run RSS signal enrichment on unenriched opportunities.
 * 1. Fetch active opportunities without rssSignals in aiAnalysis
 * 2. Run deterministic extractors on each
 * 3. For promising articles with no deterministic signals, batch LLM calls
 * 4. Store results in Opportunity.aiAnalysis.rssSignals
 */
async function enrichRssSignals({ batchSize = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'rss_signal_enrichment',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // Find active opportunities not yet enriched
    const opportunities = await Opportunity.findAll({
      where: {
        status: 'active',
        [Op.or]: [
          { aiAnalysis: null },
          { aiAnalysis: { rssSignals: null } },
        ],
      },
      order: [['published_at', 'DESC']],
      limit: batchSize,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success',
        inputCount: 0,
        outputCount: 0,
        results: { message: 'No unenriched opportunities found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let deterministicCount = 0;
    let llmCount = 0;
    let totalTokens = 0;
    const errors = [];
    const llmCandidates = [];

    // Phase 1: Deterministic extraction
    for (const opp of opportunities) {
      try {
        const signals = extractAllSignals(opp.title, opp.description);

        if (signals) {
          // Deterministic extraction found signals — store immediately
          await storeSignals(opp, signals, 'deterministic');
          deterministicCount++;
        } else if (hasEnrichmentPotential(opp.title, opp.description)) {
          // No deterministic signals, but text looks promising → queue for LLM
          llmCandidates.push(opp);
        } else {
          // Mark as enriched with empty signals so we don't re-process
          await storeSignals(opp, {}, 'deterministic');
        }
      } catch (err) {
        errors.push({ opportunityId: opp.id, phase: 'deterministic', error: err.message });
      }
    }

    // Phase 2: LLM fallback for promising articles
    if (llmCandidates.length > 0) {
      const llmResult = await processLlmBatch(llmCandidates);
      llmCount = llmResult.enrichedCount;
      totalTokens = llmResult.tokensUsed;
      if (llmResult.errors.length > 0) {
        errors.push(...llmResult.errors);
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: opportunities.length,
      outputCount: deterministicCount + llmCount,
      tokensUsed: totalTokens,
      results: {
        deterministicCount,
        llmCount,
        llmCandidates: llmCandidates.length,
        skipped: opportunities.length - deterministicCount - llmCandidates.length,
      },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('RSS signal enrichment complete', {
      input: opportunities.length,
      deterministic: deterministicCount,
      llm: llmCount,
      llmCandidates: llmCandidates.length,
      tokens: totalTokens,
      errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('RSS signal enrichment failed', { error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

/**
 * Process LLM candidates in batches of LLM_BATCH_SIZE.
 * @param {Array} candidates - Opportunities to send to LLM
 * @returns {{ enrichedCount: number, tokensUsed: number, errors: Array }}
 */
async function processLlmBatch(candidates) {
  let enrichedCount = 0;
  let tokensUsed = 0;
  const errors = [];

  // Process in chunks of LLM_BATCH_SIZE
  for (let i = 0; i < candidates.length; i += LLM_BATCH_SIZE) {
    const batch = candidates.slice(i, i + LLM_BATCH_SIZE);

    try {
      const { getAIClient } = require('../analysis/ai.client');
      const aiClient = getAIClient();

      const articles = batch.map((opp, idx) => ({
        index: idx,
        title: opp.title,
        description: (opp.description || '').slice(0, 800),
      }));

      const { systemPrompt, userPrompt } = buildRssEnrichmentPrompt(articles);
      const { content, tokensUsed: batchTokens } = await aiClient.chat(systemPrompt, userPrompt, {
        maxTokens: 2000,
        temperature: 0.2,
      });

      tokensUsed += batchTokens;

      // Parse LLM response
      const parsed = JSON.parse(content);
      const articleResults = parsed.articles || [];

      for (const result of articleResults) {
        const opp = batch[result.index];
        if (!opp) continue;

        const signals = {};
        if (result.budget) signals.budget = result.budget;
        if (result.actor) signals.actor = result.actor;
        if (result.enterprise) signals.enterprise = result.enterprise;
        if (result.compliance) signals.compliance = result.compliance;

        const method = Object.keys(signals).length > 0 ? 'deterministic+llm' : 'deterministic+llm';
        await storeSignals(opp, signals, method);

        if (Object.keys(signals).length > 0) {
          enrichedCount++;
        }
      }
    } catch (err) {
      logger.error('LLM enrichment batch failed', { error: err.message, batchStart: i });
      errors.push({
        phase: 'llm',
        batchStart: i,
        batchSize: batch.length,
        error: err.message,
      });

      // Mark failed batch as enriched with empty signals to avoid re-processing
      for (const opp of batch) {
        try {
          await storeSignals(opp, {}, 'llm_failed');
        } catch (storeErr) {
          // Swallow — already logging the primary error
        }
      }
    }
  }

  return { enrichedCount, tokensUsed, errors };
}

/**
 * Store enrichment signals in Opportunity.aiAnalysis.rssSignals.
 * Merges with existing aiAnalysis JSONB data.
 */
async function storeSignals(opportunity, signals, method) {
  const existing = opportunity.aiAnalysis || {};
  const updated = {
    ...existing,
    rssSignals: {
      ...signals,
      enrichedAt: new Date().toISOString(),
      method,
    },
  };

  await opportunity.update({ aiAnalysis: updated });
}

module.exports = { enrichRssSignals };
