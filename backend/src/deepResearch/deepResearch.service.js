// Deep Research Intelligence Engine — Phase 1.
//
// The orchestrator + data-aggregation layer. This service OWNS the report
// lifecycle but DELEGATES the AI work:
//   - strategySynthesis.service   → executive narrative, market stage, signals
//   - ventureIdeaGenerator.service → venture ideas, monetization, GTM
//
// It does NOT itself prompt the model. Its job is: pull cross-channel
// opportunity data, normalize it into a compact strategic context, run the
// two synthesis services over that context, and persist the result as a
// deep_research_report + venture_ideas rows.
//
// Failure-first: every AI step is wrapped. If synthesis or idea generation
// fails (e.g. the AI provider 429s), the report is still persisted with
// status 'partial' or 'failed' and whatever did succeed — never a half-write.

const { Op } = require('sequelize');
const {
  Opportunity, DeepResearchReport, VentureIdea, ProjectGenerationJob, AnalysisRun,
} = require('../models');
const channelsSvc = require('../oied/channels.service');
const logger = require('../logging/logger');
const strategySynthesis = require('./strategySynthesis.service');
const ventureIdeaGenerator = require('./ventureIdeaGenerator.service');

// How many opportunities to pull when a search term (not an explicit id
// list) drives the research. Wide enough to be cross-channel, capped so a
// single report never becomes an unbounded scan.
const MAX_CANDIDATES = 160;
// Per-channel cap in the normalized context handed to the AI — keeps the
// prompt bounded regardless of how lopsided the channel mix is.
const PER_CHANNEL_CONTEXT = 12;

// ---------------------------------------------------------------------------
// Data aggregation — pull + normalize cross-channel opportunity data.
// ---------------------------------------------------------------------------

// Normalize one opportunity row into the compact shape the synthesis
// services consume. Strips the heavy JSONB down to the few signals that
// actually matter for venture synthesis.
function normalizeOpp(opp) {
  const ai = opp.aiAnalysis || {};
  const sd = opp.sourceData || {};
  const summary = ai.research_summary || {};
  const ccm = (ai.cross_channel_matches && ai.cross_channel_matches.matches) || [];
  return {
    id: opp.id,
    title: opp.title || '',
    type: opp.type,
    channel: channelsSvc.getChannelKey(opp),
    value: opp.value != null ? Number(opp.value) : null,
    actionType: opp.actionType || null,
    publishedAt: opp.publishedAt || opp.createdAt || null,
    // Research-specific signals (present only on research opps).
    buildable: summary.buildable === true,
    marketTiming: summary.market_timing || null,
    githubRepo: sd.githubRepo || null,
    crossChannelLinks: ccm.length,
    // A short description excerpt — bounded so the prompt stays small.
    excerpt: String(opp.description || '').slice(0, 280),
  };
}

// Pull the candidate opportunity set for a research run. Two modes:
//   - explicit opportunityIds (the filtered results from My Opportunities)
//   - searchTerm fallback (title/description match across every channel)
async function fetchCandidates({ searchTerm, opportunityIds }) {
  if (Array.isArray(opportunityIds) && opportunityIds.length > 0) {
    const ids = opportunityIds
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_CANDIDATES);
    if (ids.length === 0) return [];
    return Opportunity.findAll({
      where: { id: { [Op.in]: ids } },
      limit: MAX_CANDIDATES,
    });
  }
  const term = String(searchTerm || '').trim();
  if (!term) return [];
  const needle = `%${term}%`;
  return Opportunity.findAll({
    where: {
      status: 'active',
      [Op.or]: [
        { title: { [Op.iLike]: needle } },
        { description: { [Op.iLike]: needle } },
      ],
    },
    order: [['published_at', 'DESC']],
    limit: MAX_CANDIDATES,
  });
}

// Aggregate the candidate set into a normalized, channel-grouped strategic
// context. This is the single input both AI services consume — pure data,
// no model calls.
function aggregateContext(searchTerm, opps) {
  const normalized = opps.map(normalizeOpp);
  const byChannel = {};
  for (const n of normalized) {
    if (!byChannel[n.channel]) {
      const ch = channelsSvc.getChannelByKey(n.channel);
      byChannel[n.channel] = { key: n.channel, label: ch.label, count: 0, totalValue: 0, items: [] };
    }
    const b = byChannel[n.channel];
    b.count += 1;
    if (n.value) b.totalValue += n.value;
    if (b.items.length < PER_CHANNEL_CONTEXT) b.items.push(n);
  }
  const channels = Object.values(byChannel).sort((a, b) => b.count - a.count);
  const buildableResearch = normalized.filter((n) => n.channel === 'research' && n.buildable);
  const withDemandSignal = normalized.filter((n) => n.crossChannelLinks > 0);
  return {
    searchTerm,
    totals: {
      sourceCount: normalized.length,
      channelCount: channels.length,
      totalValue: normalized.reduce((s, n) => s + (n.value || 0), 0),
      buildableResearchCount: buildableResearch.length,
      withDemandSignalCount: withDemandSignal.length,
    },
    channels,
  };
}

// ---------------------------------------------------------------------------
// Orchestration — the report lifecycle.
// ---------------------------------------------------------------------------

// Assemble the structured report_json from the synthesis output. Kept as a
// pure function so the persisted shape is easy to test + evolve.
function assembleReportJson(context, synthesis) {
  return {
    search_term: context.searchTerm,
    totals: context.totals,
    channel_breakdown: context.channels.map((c) => ({
      key: c.key, label: c.label, count: c.count, total_value: c.totalValue,
    })),
    market_timing_narrative: synthesis.market_timing_narrative || '',
    opportunity_signals: synthesis.opportunity_signals || [],
    government_alignment: synthesis.government_alignment || '',
    research_highlights: synthesis.research_highlights || [],
    suggested_mvps: synthesis.suggested_mvps || [],
    monetization_strategy: synthesis.monetization_strategy || '',
    build_recommendation: synthesis.build_recommendation || '',
    trend_summary: synthesis.trend_summary || '',
    generated_at: new Date().toISOString(),
  };
}

// Run a full deep research synthesis. Creates the report row + AnalysisRun
// up front (status 'running') so an in-flight run is observable, then fills
// them in. Returns the persisted report with its venture ideas.
async function runDeepResearch({
  searchTerm, opportunityIds, organizationId = null, userId = null, origin = 'manual',
} = {}) {
  const term = String(searchTerm || '').trim();
  if (!term && !(Array.isArray(opportunityIds) && opportunityIds.length)) {
    const err = new Error('A search term or opportunity id list is required');
    err.code = 'BAD_INPUT';
    throw err;
  }

  const run = await AnalysisRun.create({
    type: 'deep_research',
    status: 'running',
    startedAt: new Date(),
  });
  const report = await DeepResearchReport.create({
    searchTerm: term || `(${(opportunityIds || []).length} selected opportunities)`,
    status: 'running',
    origin,
    organizationId,
    createdBy: userId,
    analysisRunId: run.id,
  });

  try {
    const opps = await fetchCandidates({ searchTerm: term, opportunityIds });
    const context = aggregateContext(report.searchTerm, opps);

    let synthesis;
    let ideas = [];
    let tokensUsed = 0;
    let degraded = false;

    // Step 1 — strategic narrative. If this fails we cannot produce a
    // meaningful report, so it's the hard gate.
    const synthOut = await strategySynthesis.synthesize(context);
    synthesis = synthOut.synthesis;
    tokensUsed += synthOut.tokensUsed || 0;

    // Step 2 — venture ideas. If THIS fails the narrative is still useful,
    // so we degrade to 'partial' rather than failing the whole report.
    try {
      const ideaOut = await ventureIdeaGenerator.generateVentureIdeas(context, synthesis);
      ideas = ideaOut.ideas || [];
      tokensUsed += ideaOut.tokensUsed || 0;
    } catch (e) {
      degraded = true;
      logger.warn('deepResearch: venture idea generation failed — report degraded to partial', {
        reportId: report.id, error: e.message,
      });
    }

    // Persist venture ideas as their own rows.
    const ideaRows = [];
    for (let i = 0; i < ideas.length; i += 1) {
      const idea = ideas[i];
      // eslint-disable-next-line no-await-in-loop
      const row = await VentureIdea.create({
        reportId: report.id,
        title: idea.title,
        description: idea.description,
        monetizationStrategy: idea.monetization_strategy,
        marketTiming: idea.market_timing,
        buildabilityScore: idea.buildability_score,
        revenuePotential: idea.revenue_potential,
        mvpScope: idea.mvp_scope,
        gtmSummary: idea.gtm_summary,
        metadata: idea.metadata || {},
        sortOrder: i,
      });
      ideaRows.push(row);
    }

    const reportJson = assembleReportJson(context, synthesis);
    const status = degraded ? 'partial' : 'success';
    await report.update({
      status,
      executiveSummary: synthesis.executive_summary || '',
      marketStage: synthesis.market_stage || 'unknown',
      confidenceScore: synthesis.confidence_score != null ? synthesis.confidence_score : null,
      reportJson,
      sourceCount: context.totals.sourceCount,
    });
    await run.update({
      status,
      inputCount: context.totals.sourceCount,
      outputCount: ideaRows.length,
      tokensUsed,
      results: {
        reportId: report.id,
        ventureIdeas: ideaRows.length,
        channelCount: context.totals.channelCount,
      },
      completedAt: new Date(),
    });
    logger.info('deepResearch run complete', {
      reportId: report.id, status, sources: context.totals.sourceCount, ideas: ideaRows.length,
    });

    return getReport(report.id);
  } catch (error) {
    logger.error('deepResearch run failed', { reportId: report.id, error: error.message });
    await report.update({ status: 'failed', error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    // Re-throw so the caller (controller / scheduler) can surface it, but
    // the report row is already persisted as 'failed' — observable, no
    // half-write.
    throw error;
  }
}

// Fetch a report with its venture ideas and any project generation jobs.
async function getReport(id) {
  const report = await DeepResearchReport.findByPk(id, {
    include: [{ model: VentureIdea, as: 'ventureIdeas' }],
  });
  if (!report) {
    const err = new Error(`Deep research report ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const ideaIds = (report.ventureIdeas || []).map((v) => v.id);
  const jobs = ideaIds.length
    ? await ProjectGenerationJob.findAll({ where: { ventureIdeaId: { [Op.in]: ideaIds } } })
    : [];
  const jobsByIdea = {};
  for (const j of jobs) {
    if (!jobsByIdea[j.ventureIdeaId]) jobsByIdea[j.ventureIdeaId] = [];
    jobsByIdea[j.ventureIdeaId].push(j);
  }
  const json = report.toJSON();
  json.ventureIdeas = (json.ventureIdeas || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({ ...v, generationJobs: jobsByIdea[v.id] || [] }));
  return json;
}

// Lightweight status poll — no joins, just the report's own lifecycle
// fields. Used by the UI's loading state.
async function getReportStatus(id) {
  const report = await DeepResearchReport.findByPk(id, {
    attributes: ['id', 'status', 'searchTerm', 'sourceCount', 'error', 'updatedAt'],
  });
  if (!report) {
    const err = new Error(`Deep research report ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const ideaCount = await VentureIdea.count({ where: { reportId: id } });
  return {
    id: report.id,
    status: report.status,
    search_term: report.searchTerm,
    source_count: report.sourceCount,
    venture_idea_count: ideaCount,
    error: report.error || null,
    updated_at: report.updatedAt,
  };
}

module.exports = {
  // exported for direct unit testing
  normalizeOpp,
  aggregateContext,
  assembleReportJson,
  // public API
  runDeepResearch,
  getReport,
  getReportStatus,
};
