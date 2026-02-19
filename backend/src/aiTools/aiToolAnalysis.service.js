const { Op, fn, col } = require('sequelize');
const { AiTool, AiToolMention, Opportunity, AnalysisRun } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const {
  TOOL_EXTRACTION_SYSTEM_PROMPT,
  TOOL_TREND_SYSTEM_PROMPT,
  TOOL_CATEGORIZATION_SYSTEM_PROMPT,
  buildToolExtractionUserPrompt,
  buildToolTrendUserPrompt,
  buildToolCategorizationUserPrompt,
} = require('./aiTool.prompts');
const { invalidateCache } = require('../middleware/cache.middleware');
const logger = require('../logging/logger');

const EXTRACTION_BATCH_SIZE = 30;

// Valid enum values for AiTool model — used to sanitize AI categorization output
const VALID_CATEGORIES = ['LLM', 'Image Generation', 'Code Assistant', 'Audio/Speech', 'Video', 'Analytics', 'Automation', 'Search', 'Writing', 'Design', 'Data Science', 'Other'];
const VALID_PRICING_TIERS = ['free', 'freemium', 'paid', 'enterprise'];

/**
 * Sanitize AI categorization output to ensure it matches model validation rules.
 */
function sanitizeCategorization(cat) {
  if (!VALID_CATEGORIES.includes(cat.category)) cat.category = 'Other';
  if (cat.pricingTier && !VALID_PRICING_TIERS.includes(cat.pricingTier)) cat.pricingTier = 'freemium';
  return cat;
}

/**
 * Extract AI tool mentions from recent ai_news opportunities.
 * Scans opportunities that haven't been analyzed for tool mentions yet.
 *
 * Flow:
 * 1. Find ai_news opportunities from the last 14 days
 * 2. Filter out opportunities that have already been scanned (have AiToolMention records)
 * 3. Batch-process unscanned opportunities through the AI client
 * 4. Create AiToolMention records for each discovered tool mention
 * 5. Update 7-day mention counts for all tools
 *
 * @returns {Object} The AnalysisRun record tracking this extraction
 */
async function extractToolMentionsFromNews() {
  const run = await AnalysisRun.create({
    type: 'ai_tool_mention_extraction',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // Find which opportunity IDs have already been scanned for tool mentions.
    // We group by opportunityId to get unique IDs only.
    const scannedIds = await AiToolMention.findAll({
      attributes: ['opportunityId'],
      where: { opportunityId: { [Op.ne]: null } },
      group: ['opportunityId'],
      raw: true,
    });
    const scannedIdSet = new Set(scannedIds.map(r => r.opportunityId));

    // Fetch recent ai_news opportunities from the last 14 days
    const recentNews = await Opportunity.findAll({
      where: {
        type: 'ai_news',
        status: 'active',
        publishedAt: { [Op.gte]: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      attributes: ['id', 'title', 'description', 'source', 'publishedAt'],
      order: [['publishedAt', 'DESC']],
      limit: 100,
    });

    // Filter out already-scanned opportunities
    const unscanned = recentNews.filter(o => !scannedIdSet.has(o.id));

    if (unscanned.length === 0) {
      run.status = 'success';
      run.inputCount = 0;
      run.outputCount = 0;
      run.completedAt = new Date();
      await run.save();
      logger.info('No new ai_news to scan for tool mentions');
      return run;
    }

    // Process in batches to respect token limits
    const aiClient = getAIClient();
    let totalMentions = 0;
    let totalTokens = 0;
    const errors = [];

    for (let i = 0; i < unscanned.length; i += EXTRACTION_BATCH_SIZE) {
      const batch = unscanned.slice(i, i + EXTRACTION_BATCH_SIZE);
      const articles = batch.map(o => ({
        id: o.id,
        title: o.title,
        description: o.description,
        source: o.source,
        publishedAt: o.publishedAt,
      }));

      try {
        const userPrompt = buildToolExtractionUserPrompt(articles);
        const { content, tokensUsed } = await aiClient.chat(
          TOOL_EXTRACTION_SYSTEM_PROMPT,
          userPrompt,
          { maxTokens: 3000, temperature: 0.2 }
        );
        totalTokens += tokensUsed;

        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (parseErr) {
          errors.push({ batch: i, error: `JSON parse error: ${parseErr.message}` });
          logger.warn('Tool extraction JSON parse error', { batch: i, error: parseErr.message });
          continue;
        }

        if (!parsed.mentions || !Array.isArray(parsed.mentions)) {
          continue;
        }

        // Process each mention from the AI response
        for (const mention of parsed.mentions) {
          try {
            // Look up the tool in our database by canonical name (case-insensitive)
            const tool = await AiTool.findOne({
              where: { name: { [Op.iLike]: mention.toolName } },
            });

            if (!tool) {
              // Tool not in our database — skip for now.
              // Future enhancement: auto-categorize and create new tools.
              continue;
            }

            // Find the matching opportunity from our batch
            const opp = batch.find(b => b.id === mention.articleId);

            // Use findOrCreate with opportunityId to prevent duplicate mentions.
            // The unique constraint on [ai_tool_id, source, source_url] doesn't
            // help when source_url is null (Postgres treats nulls as distinct),
            // so we use opportunityId + aiToolId as the deduplication key.
            await AiToolMention.findOrCreate({
              where: {
                aiToolId: tool.id,
                opportunityId: mention.articleId,
              },
              defaults: {
                aiToolId: tool.id,
                opportunityId: mention.articleId,
                source: opp?.source || 'ai_news',
                sourceUrl: null,
                title: opp?.title || '',
                snippet: mention.snippet || '',
                sentiment: mention.sentiment || 'neutral',
                significance: mention.significance || 'mention',
                mentionedAt: opp?.publishedAt || new Date(),
              },
            });
            totalMentions++;
          } catch (mentionErr) {
            errors.push({ toolName: mention.toolName, error: mentionErr.message });
          }
        }
      } catch (batchErr) {
        errors.push({ batch: i, error: batchErr.message });
        logger.error('Tool extraction batch error', { batch: i, error: batchErr.message });
      }
    }

    // Refresh the rolling 7-day mention counts for all tools
    await updateMentionCounts();

    run.status = errors.length > 0 ? 'partial' : 'success';
    run.inputCount = unscanned.length;
    run.outputCount = totalMentions;
    run.tokensUsed = totalTokens;
    run.errors = errors.length > 0 ? errors : null;
    run.completedAt = new Date();
    await run.save();

    logger.info('Tool mention extraction complete', {
      articlesScanned: unscanned.length,
      mentionsFound: totalMentions,
      tokensUsed: totalTokens,
    });

    return run;
  } catch (error) {
    run.status = 'failed';
    run.errors = [{ error: error.message }];
    run.completedAt = new Date();
    await run.save();
    logger.error('Tool mention extraction failed', { error: error.message });
    throw error;
  }
}

/**
 * Update the 7-day rolling mention count for all AI tools.
 * Resets all counts to 0, then sets the actual count for tools with recent mentions.
 */
async function updateMentionCounts() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const counts = await AiToolMention.findAll({
    attributes: [
      'aiToolId',
      [fn('COUNT', col('id')), 'count'],
    ],
    where: { mentionedAt: { [Op.gte]: sevenDaysAgo } },
    group: ['aiToolId'],
    raw: true,
  });

  // Reset all tool mention counts to 0
  await AiTool.update({ mentionCount7d: 0 }, { where: {} });

  // Set the actual count for each tool that has recent mentions
  for (const { aiToolId, count } of counts) {
    await AiTool.update(
      { mentionCount7d: parseInt(count, 10) },
      { where: { id: aiToolId } }
    );
  }
}

/**
 * Run AI-powered trend analysis on all active tools.
 * Computes trending scores based on mention data from the past 7 days.
 *
 * Flow:
 * 1. Aggregate mention data (sentiment, significance) per tool
 * 2. Send aggregations to AI for scoring
 * 3. Update each tool's trendingScore, trendDirection, sentimentScore, etc.
 * 4. Store industry trends in the AnalysisRun results
 * 5. Invalidate caches
 *
 * @returns {Object} The AnalysisRun record tracking this analysis
 */
async function runToolTrendAnalysis() {
  const run = await AnalysisRun.create({
    type: 'ai_tool_trend_analysis',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get all active tools (include sourceData for GitHub star counts)
    const tools = await AiTool.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name', 'industries', 'trendingScore', 'sourceData'],
    });

    // Get all mentions from the last 7 days
    const mentions = await AiToolMention.findAll({
      where: { mentionedAt: { [Op.gte]: sevenDaysAgo } },
      attributes: ['aiToolId', 'sentiment', 'significance'],
      raw: true,
    });

    // Build aggregations: group mentions by tool, counting sentiment and significance
    const mentionsByTool = {};
    for (const m of mentions) {
      if (!mentionsByTool[m.aiToolId]) {
        mentionsByTool[m.aiToolId] = {
          sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
          significanceBreakdown: { major_update: 0, review: 0, comparison: 0, mention: 0 },
          count: 0,
        };
      }
      const agg = mentionsByTool[m.aiToolId];
      agg.count++;
      if (agg.sentimentBreakdown[m.sentiment] !== undefined) {
        agg.sentimentBreakdown[m.sentiment]++;
      }
      if (agg.significanceBreakdown[m.significance] !== undefined) {
        agg.significanceBreakdown[m.significance]++;
      }
    }

    // Build prompt data: include tools that have mentions, high scores, or significant GitHub stars
    // (so the AI can mark previously-trending tools as declining if mentions dropped)
    const toolAggregations = tools
      .filter(t => mentionsByTool[t.id] || t.trendingScore > 50 || (t.sourceData?.github?.stars > 1000))
      .map(t => {
        const agg = mentionsByTool[t.id] || {
          sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
          significanceBreakdown: { major_update: 0, review: 0, comparison: 0, mention: 0 },
          count: 0,
        };
        const result = {
          name: t.name,
          mentionCount: agg.count,
          sentimentBreakdown: agg.sentimentBreakdown,
          significanceBreakdown: agg.significanceBreakdown,
          industries: t.industries || [],
        };
        // Include GitHub star data if available
        if (t.sourceData?.github?.stars) {
          result.githubStars = t.sourceData.github.stars;
        }
        // Include Product Hunt votes if available
        if (t.sourceData?.productHunt?.votesCount) {
          result.productHuntVotes = t.sourceData.productHunt.votesCount;
        }
        return result;
      });

    if (toolAggregations.length === 0) {
      // No tools to analyze — keep existing scores unchanged
      run.status = 'success';
      run.inputCount = 0;
      run.outputCount = 0;
      run.completedAt = new Date();
      await run.save();
      return run;
    }

    const aiClient = getAIClient();
    const userPrompt = buildToolTrendUserPrompt(toolAggregations);
    const { content, tokensUsed } = await aiClient.chat(
      TOOL_TREND_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 4000, temperature: 0.3 }
    );

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      throw new Error(`Failed to parse AI trend response: ${parseErr.message}`);
    }

    // Update tool records with their new scores
    let updated = 0;
    if (parsed.toolScores && Array.isArray(parsed.toolScores)) {
      for (const score of parsed.toolScores) {
        const tool = tools.find(t => t.name.toLowerCase() === score.toolName.toLowerCase());
        if (!tool) continue;

        const updateData = {
          trendingScore: Math.min(100, Math.max(0, Math.round(score.trendingScore))),
          trendDirection: score.trendDirection || 'stable',
          sentimentScore: score.sentimentScore != null ? score.sentimentScore : null,
          aiAnalysis: {
            whyTrending: score.whyTrending || '',
            lastAnalysis: new Date().toISOString(),
          },
          lastAnalyzedAt: new Date(),
        };

        // If a major update was detected, record it
        if (score.majorUpdate) {
          updateData.lastMajorUpdate = new Date();
          updateData.lastMajorUpdateSummary = score.majorUpdate;
        }

        await AiTool.update(updateData, { where: { id: tool.id } });
        updated++;
      }
    }

    // Store industry trends and tool scores in the run results
    run.status = 'success';
    run.inputCount = toolAggregations.length;
    run.outputCount = updated;
    run.tokensUsed = tokensUsed;
    run.results = {
      toolScores: parsed.toolScores || [],
      industryTrends: parsed.industryTrends || [],
      analyzedAt: new Date().toISOString(),
    };
    run.completedAt = new Date();
    await run.save();

    // Invalidate cached AI tools data so API consumers see fresh scores
    await invalidateCache('cache:aitools:*');

    logger.info('Tool trend analysis complete', {
      toolsAnalyzed: toolAggregations.length,
      toolsUpdated: updated,
      tokensUsed,
    });

    return run;
  } catch (error) {
    run.status = 'failed';
    run.errors = [{ error: error.message }];
    run.completedAt = new Date();
    await run.save();
    logger.error('Tool trend analysis failed', { error: error.message });
    throw error;
  }
}

/**
 * Categorize a newly discovered tool using AI.
 * Takes basic tool info and returns a full categorization with category,
 * industries, description, vendor, pricing tier, and tags.
 *
 * @param {{name: string, context?: string, source?: string}} toolInfo
 * @returns {Object} Parsed categorization result from AI
 */
async function categorizeNewTool(toolInfo) {
  const aiClient = getAIClient();
  const userPrompt = buildToolCategorizationUserPrompt(toolInfo);
  const { content, tokensUsed } = await aiClient.chat(
    TOOL_CATEGORIZATION_SYSTEM_PROMPT,
    userPrompt,
    { maxTokens: 1000, temperature: 0.2 }
  );

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (parseErr) {
    throw new Error(`Failed to parse AI categorization response: ${parseErr.message}`);
  }

  logger.info('Tool categorized', { toolName: parsed.name, tokensUsed });
  return parsed;
}

/**
 * Discover and update AI tools from GitHub Trending.
 * Fetches trending AI/ML repositories, creates new tools or updates existing ones.
 *
 * For existing tools: updates sourceData.github with fresh star counts.
 * For new tools: uses AI categorization to classify them, then creates the tool record.
 *
 * @returns {Object} The AnalysisRun record tracking this discovery
 */
async function discoverAndUpdateToolsFromGithub() {
  const { fetchGithubTrendingAiTools } = require('./adapters/githubTrending.adapter');

  const run = await AnalysisRun.create({
    type: 'ai_tool_github_discovery',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const repos = await fetchGithubTrendingAiTools();
    logger.info('GitHub discovery: fetched repos', { count: repos.length });

    if (repos.length === 0) {
      run.status = 'success';
      run.inputCount = 0;
      run.outputCount = 0;
      run.completedAt = new Date();
      await run.save();
      return run;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    let totalTokens = 0;

    for (const repo of repos) {
      try {
        // Generate a slug from the repo name
        const slug = repo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Check if this tool already exists (by slug or by GitHub sourceId)
        let existingTool = await AiTool.findOne({ where: { slug } });

        if (!existingTool) {
          // Also check by name (case-insensitive)
          existingTool = await AiTool.findOne({
            where: { name: { [Op.iLike]: repo.name } },
          });
        }

        if (existingTool) {
          // Update existing tool with fresh GitHub data
          const sourceData = existingTool.sourceData || {};
          sourceData.github = {
            stars: repo.stars,
            fullName: repo.fullName,
            language: repo.language,
            topics: repo.topics,
            sourceUrl: repo.sourceUrl,
            lastChecked: new Date().toISOString(),
          };

          await existingTool.update({
            sourceData,
            // Update website if tool doesn't have one
            ...((!existingTool.website && repo.website) ? { website: repo.website } : {}),
          });
          updated++;
        } else {
          // New tool — use AI to categorize it
          let categorization;
          try {
            categorization = sanitizeCategorization(await categorizeNewTool({
              name: repo.name,
              context: `${repo.description}. GitHub repo: ${repo.fullName}, Stars: ${repo.stars}, Language: ${repo.language}, Topics: ${repo.topics?.join(', ')}`,
              source: 'github',
            }));
            totalTokens += 500; // approximate tokens per categorization
          } catch (catErr) {
            // Fallback categorization if AI fails
            logger.warn('AI categorization failed for GitHub tool, using defaults', {
              name: repo.name,
              error: catErr.message,
            });
            categorization = {
              category: 'Other',
              subcategory: repo.language || 'General',
              industries: ['Technology'],
              description: repo.description || `${repo.name} - an AI/ML tool from GitHub.`,
              vendor: repo.vendor,
              pricingTier: 'free',
              tags: repo.topics?.slice(0, 5) || [],
            };
          }

          // Create the new tool record
          await AiTool.create({
            name: categorization.name || repo.name,
            slug,
            description: categorization.description || repo.description,
            website: repo.website || repo.sourceUrl,
            vendor: categorization.vendor || repo.vendor,
            category: categorization.category || 'Other',
            subcategory: categorization.subcategory || null,
            industries: categorization.industries || ['Technology'],
            tags: categorization.tags || [],
            pricingTier: categorization.pricingTier || 'free',
            trendingScore: Math.min(100, Math.round((repo.stars / 1000) * 10)),
            trendDirection: 'rising',
            sourceData: {
              github: {
                stars: repo.stars,
                fullName: repo.fullName,
                language: repo.language,
                topics: repo.topics,
                sourceUrl: repo.sourceUrl,
                discoveredAt: new Date().toISOString(),
                lastChecked: new Date().toISOString(),
              },
            },
            status: 'active',
          });
          created++;
        }
      } catch (repoErr) {
        skipped++;
        errors.push({ repo: repo.name, error: repoErr.message });
        logger.warn('GitHub discovery: failed to process repo', {
          repo: repo.name,
          error: repoErr.message,
        });
      }
    }

    run.status = errors.length > 0 ? 'partial' : 'success';
    run.inputCount = repos.length;
    run.outputCount = created + updated;
    run.tokensUsed = totalTokens;
    run.results = { created, updated, skipped };
    run.errors = errors.length > 0 ? errors : null;
    run.completedAt = new Date();
    await run.save();

    await invalidateCache('cache:aitools:*');

    logger.info('GitHub discovery complete', { created, updated, skipped, repos: repos.length });
    return run;
  } catch (error) {
    run.status = 'failed';
    run.errors = [{ error: error.message }];
    run.completedAt = new Date();
    await run.save();
    logger.error('GitHub discovery failed', { error: error.message });
    throw error;
  }
}

/**
 * Discover and update AI tools from Product Hunt.
 * Fetches trending AI products, creates new tools or updates existing ones.
 *
 * @returns {Object} The AnalysisRun record tracking this discovery
 */
async function discoverAndUpdateToolsFromProductHunt() {
  const { fetchProductHuntAiTools } = require('./adapters/productHunt.adapter');

  const run = await AnalysisRun.create({
    type: 'ai_tool_producthunt_discovery',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const products = await fetchProductHuntAiTools();
    logger.info('Product Hunt discovery: fetched products', { count: products.length });

    if (products.length === 0) {
      run.status = 'success';
      run.inputCount = 0;
      run.outputCount = 0;
      run.completedAt = new Date();
      await run.save();
      return run;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    let totalTokens = 0;

    for (const product of products) {
      try {
        const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        let existingTool = await AiTool.findOne({ where: { slug } });
        if (!existingTool) {
          existingTool = await AiTool.findOne({
            where: { name: { [Op.iLike]: product.name } },
          });
        }

        if (existingTool) {
          const sourceData = existingTool.sourceData || {};
          sourceData.productHunt = {
            votesCount: product.votesCount,
            sourceUrl: product.sourceUrl,
            topics: product.topics,
            lastChecked: new Date().toISOString(),
          };
          await existingTool.update({
            sourceData,
            ...((!existingTool.website && product.website) ? { website: product.website } : {}),
          });
          updated++;
        } else {
          let categorization;
          try {
            categorization = sanitizeCategorization(await categorizeNewTool({
              name: product.name,
              context: `${product.description}. Product Hunt product by ${product.vendor}. Votes: ${product.votesCount}. Topics: ${product.topics?.join(', ')}`,
              source: 'product_hunt',
            }));
            totalTokens += 500;
          } catch (catErr) {
            logger.warn('AI categorization failed for PH tool, using defaults', {
              name: product.name,
              error: catErr.message,
            });
            categorization = {
              category: 'Other',
              subcategory: 'General',
              industries: ['Technology', 'Startups'],
              description: product.description || `${product.name} - an AI tool from Product Hunt.`,
              vendor: product.vendor,
              pricingTier: 'freemium',
              tags: product.topics?.slice(0, 5) || [],
            };
          }

          await AiTool.create({
            name: categorization.name || product.name,
            slug,
            description: categorization.description || product.description,
            website: product.website || product.sourceUrl,
            vendor: categorization.vendor || product.vendor,
            category: categorization.category || 'Other',
            subcategory: categorization.subcategory || null,
            industries: categorization.industries || ['Technology'],
            tags: categorization.tags || [],
            pricingTier: categorization.pricingTier || 'freemium',
            trendingScore: Math.min(100, Math.round((product.votesCount / 100) * 10)),
            trendDirection: 'rising',
            sourceData: {
              productHunt: {
                votesCount: product.votesCount,
                sourceUrl: product.sourceUrl,
                topics: product.topics,
                discoveredAt: new Date().toISOString(),
                lastChecked: new Date().toISOString(),
              },
            },
            status: 'active',
          });
          created++;
        }
      } catch (productErr) {
        skipped++;
        errors.push({ product: product.name, error: productErr.message });
        logger.warn('Product Hunt discovery: failed to process product', {
          product: product.name,
          error: productErr.message,
        });
      }
    }

    run.status = errors.length > 0 ? 'partial' : 'success';
    run.inputCount = products.length;
    run.outputCount = created + updated;
    run.tokensUsed = totalTokens;
    run.results = { created, updated, skipped };
    run.errors = errors.length > 0 ? errors : null;
    run.completedAt = new Date();
    await run.save();

    await invalidateCache('cache:aitools:*');

    logger.info('Product Hunt discovery complete', { created, updated, skipped, products: products.length });
    return run;
  } catch (error) {
    run.status = 'failed';
    run.errors = [{ error: error.message }];
    run.completedAt = new Date();
    await run.save();
    logger.error('Product Hunt discovery failed', { error: error.message });
    throw error;
  }
}

/**
 * Run the full tool discovery pipeline.
 * Always runs GitHub discovery. Runs Product Hunt if PRODUCT_HUNT_TOKEN is configured.
 *
 * @returns {Object} Combined results from all discovery sources
 */
async function runToolDiscoveryPipeline() {
  const results = { github: null, productHunt: null };

  // Always run GitHub discovery (no token required)
  try {
    results.github = await discoverAndUpdateToolsFromGithub();
    logger.info('Discovery pipeline: GitHub complete', {
      status: results.github.status,
      output: results.github.outputCount,
    });
  } catch (err) {
    logger.error('Discovery pipeline: GitHub failed', { error: err.message });
    results.github = { status: 'failed', error: err.message };
  }

  // Run Product Hunt discovery only if token is configured
  if (process.env.PRODUCT_HUNT_TOKEN) {
    try {
      results.productHunt = await discoverAndUpdateToolsFromProductHunt();
      logger.info('Discovery pipeline: Product Hunt complete', {
        status: results.productHunt.status,
        output: results.productHunt.outputCount,
      });
    } catch (err) {
      logger.error('Discovery pipeline: Product Hunt failed', { error: err.message });
      results.productHunt = { status: 'failed', error: err.message };
    }
  } else {
    results.productHunt = { status: 'skipped', reason: 'PRODUCT_HUNT_TOKEN not configured' };
  }

  return results;
}

module.exports = {
  extractToolMentionsFromNews,
  runToolTrendAnalysis,
  categorizeNewTool,
  updateMentionCounts,
  discoverAndUpdateToolsFromGithub,
  discoverAndUpdateToolsFromProductHunt,
  runToolDiscoveryPipeline,
};
