// Deep Research Intelligence Engine — orchestrator + data aggregation.
//
// Phase 1 established the report lifecycle (aggregate → synthesize →
// generate ideas → persist). Phase 2 turns it into real strategic
// intelligence by wiring in four engines the orchestrator delegates to:
//
//   strategySynthesis        → executive narrative                 [AI · hard gate]
//   crossChannelCorrelation  → signal convergence + acceleration    [deterministic]
//   marketTiming             → lifecycle stage classification       [deterministic]
//   ventureIdeaGenerator     → venture idea shortlist               [AI · soft]
//   monetizationIntelligence → monetization models                  [AI · soft]
//   ventureScoring           → 8-dimension venture scores           [deterministic]
//
// The orchestrator still OWNS the report lifecycle and does no prompting
// itself. Failure-first: the AI hard gate is synthesis; the deterministic
// engines never fail; the soft AI steps (ideas, monetization) degrade the
// report to 'partial' rather than failing it.
//
// Phase 2 also adds report management: listReports (the index page),
// reRunReport (versioned re-run preserving history), and favorite/archive.

const { Op } = require('sequelize');
const {
  Opportunity, DeepResearchReport, VentureIdea, ProjectGenerationJob, AnalysisRun,
  SignalCorrelation, MonetizationModel, ReportVersion,
} = require('../models');
const channelsSvc = require('../oied/channels.service');
const logger = require('../logging/logger');
const strategySynthesis = require('./strategySynthesis.service');
const ventureIdeaGenerator = require('./ventureIdeaGenerator.service');
const crossChannelCorrelation = require('./crossChannelCorrelation.service');
const marketTiming = require('./marketTiming.service');
const monetizationIntelligence = require('./monetizationIntelligence.service');
const ventureScoring = require('./ventureScoring.service');

const MAX_CANDIDATES = 160;
const PER_CHANNEL_CONTEXT = 12;
// Recency windows for the correlation + timing engines.
const RECENT_WINDOW_DAYS = 90;
const PRIOR_WINDOW_DAYS = 180;

// ---------------------------------------------------------------------------
// Data aggregation.
// ---------------------------------------------------------------------------

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
    buildable: summary.buildable === true,
    marketTiming: summary.market_timing || null,
    githubRepo: sd.githubRepo || null,
    crossChannelLinks: ccm.length,
    excerpt: String(opp.description || '').slice(0, 280),
  };
}

async function fetchCandidates({ searchTerm, opportunityIds }) {
  if (Array.isArray(opportunityIds) && opportunityIds.length > 0) {
    const ids = opportunityIds
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, MAX_CANDIDATES);
    if (ids.length === 0) return [];
    return Opportunity.findAll({ where: { id: { [Op.in]: ids } }, limit: MAX_CANDIDATES });
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

// Days between a date and now (large number if the date is missing).
function ageDays(dateValue) {
  if (!dateValue) return 99999;
  const t = new Date(dateValue).getTime();
  if (Number.isNaN(t)) return 99999;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

// Aggregate the candidate set into a normalized, channel-grouped context.
// Phase 2: each channel also carries recentCount / priorCount (the recency
// windows the correlation + timing engines need) computed over ALL of the
// channel's opportunities, not just the sampled items.
function aggregateContext(searchTerm, opps) {
  const normalized = opps.map(normalizeOpp);
  const byChannel = {};
  for (const n of normalized) {
    if (!byChannel[n.channel]) {
      const ch = channelsSvc.getChannelByKey(n.channel);
      byChannel[n.channel] = {
        key: n.channel,
        label: ch.label,
        count: 0,
        totalValue: 0,
        recentCount: 0,
        priorCount: 0,
        items: [],
      };
    }
    const b = byChannel[n.channel];
    b.count += 1;
    if (n.value) b.totalValue += n.value;
    const age = ageDays(n.publishedAt);
    if (age <= RECENT_WINDOW_DAYS) b.recentCount += 1;
    else if (age <= PRIOR_WINDOW_DAYS) b.priorCount += 1;
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
// Report assembly.
// ---------------------------------------------------------------------------

// Assemble the structured report_json from every engine's output.
function assembleReportJson(context, synthesis, intel) {
  const { correlation, timing, monetizationModels } = intel;
  return {
    search_term: context.searchTerm,
    totals: context.totals,
    channel_breakdown: context.channels.map((c) => ({
      key: c.key, label: c.label, count: c.count, total_value: c.totalValue,
      recent_count: c.recentCount, prior_count: c.priorCount,
    })),
    // Phase 1 narrative fields.
    market_timing_narrative: synthesis.market_timing_narrative || '',
    opportunity_signals: synthesis.opportunity_signals || [],
    government_alignment: synthesis.government_alignment || '',
    research_highlights: synthesis.research_highlights || [],
    suggested_mvps: synthesis.suggested_mvps || [],
    monetization_strategy: synthesis.monetization_strategy || '',
    build_recommendation: synthesis.build_recommendation || '',
    trend_summary: synthesis.trend_summary || '',
    // Phase 2 — the intelligence engines.
    correlation,
    market_timing: timing,
    monetization_models: monetizationModels,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// The pipeline — shared by runDeepResearch (fresh) and reRunReport (existing).
// ---------------------------------------------------------------------------

// Runs the full synthesis pipeline against an already-created report + run
// row. Mutates both to their terminal state. Returns the persisted report.
async function runPipeline(report, run, { searchTerm, opportunityIds }) {
  try {
    const opps = await fetchCandidates({ searchTerm, opportunityIds });
    const context = aggregateContext(report.searchTerm, opps);

    let tokensUsed = 0;
    let degraded = false;

    // Step 1 — strategic narrative. AI hard gate.
    const synthOut = await strategySynthesis.synthesize(context);
    const synthesis = synthOut.synthesis;
    tokensUsed += synthOut.tokensUsed || 0;

    // Step 2 — cross-channel correlation. Deterministic.
    const correlation = crossChannelCorrelation.analyzeCorrelations(context);

    // Step 3 — market timing. Deterministic, consumes the correlation.
    const timing = marketTiming.classifyTiming(correlation, context);

    // Step 4 — venture ideas. AI soft.
    let ideas = [];
    try {
      const ideaOut = await ventureIdeaGenerator.generateVentureIdeas(context, synthesis);
      ideas = ideaOut.ideas || [];
      tokensUsed += ideaOut.tokensUsed || 0;
    } catch (e) {
      degraded = true;
      logger.warn('deepResearch: venture idea generation failed — degrading to partial', {
        reportId: report.id, error: e.message,
      });
    }

    // Step 5 — monetization models. AI soft.
    let monetizationModels = [];
    try {
      const monOut = await monetizationIntelligence.generateMonetizationModels(context, synthesis);
      monetizationModels = monOut.models || [];
      tokensUsed += monOut.tokensUsed || 0;
    } catch (e) {
      degraded = true;
      logger.warn('deepResearch: monetization generation failed — degrading to partial', {
        reportId: report.id, error: e.message,
      });
    }

    // Step 6 — score + persist venture ideas (deterministic scoring).
    const ideaRows = [];
    for (let i = 0; i < ideas.length; i += 1) {
      const idea = ideas[i];
      const scored = ventureScoring.scoreVenture(idea, { context, correlation, timing });
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
        compositeScore: scored.composite_score,
        recommendationLevel: scored.recommendation_level,
        scores: scored.scores,
      });
      ideaRows.push(row);
    }

    // Persist the correlation + monetization models.
    await SignalCorrelation.create({
      reportId: report.id,
      correlationStrength: correlation.correlation_strength,
      acceleration: correlation.acceleration,
      convergenceType: correlation.convergence_type,
      signalBreakdown: correlation.signal_breakdown,
      supportingEvidence: correlation.supporting_evidence,
    });
    for (const model of monetizationModels) {
      // eslint-disable-next-line no-await-in-loop
      await MonetizationModel.create({
        reportId: report.id,
        modelType: model.model_type,
        pricingSuggestion: model.pricing_suggestion,
        idealIcp: model.ideal_icp,
        revenueModel: model.revenue_model,
        implementationComplexity: model.implementation_complexity,
        fitScore: model.fit_score,
        metadata: model.metadata || {},
      });
    }

    // Report-level rollup scores.
    const commercializationScore = ideaRows.length
      ? Number((ideaRows.reduce((s, r) => s + Number(r.compositeScore || 0), 0) / ideaRows.length)
        .toFixed(2))
      : null;

    const reportJson = assembleReportJson(context, synthesis, {
      correlation, timing, monetizationModels,
    });
    const status = degraded ? 'partial' : 'success';
    await report.update({
      status,
      executiveSummary: synthesis.executive_summary || '',
      // Phase 2: the deterministic timing engine is authoritative for stage.
      marketStage: timing.stage || 'emerging',
      confidenceScore: timing.confidence != null ? timing.confidence : synthesis.confidence_score,
      reportJson,
      sourceCount: context.totals.sourceCount,
      timingScore: timing.timing_score,
      commercializationScore,
      correlationStrength: correlation.correlation_strength,
    });
    await run.update({
      status,
      inputCount: context.totals.sourceCount,
      outputCount: ideaRows.length,
      tokensUsed,
      results: {
        reportId: report.id,
        ventureIdeas: ideaRows.length,
        monetizationModels: monetizationModels.length,
        convergenceType: correlation.convergence_type,
        marketStage: timing.stage,
        channelCount: context.totals.channelCount,
      },
      completedAt: new Date(),
    });
    logger.info('deepResearch pipeline complete', {
      reportId: report.id, status, sources: context.totals.sourceCount,
      ideas: ideaRows.length, stage: timing.stage, convergence: correlation.convergence_type,
    });
    return getReport(report.id);
  } catch (error) {
    logger.error('deepResearch pipeline failed', { reportId: report.id, error: error.message });
    await report.update({ status: 'failed', error: error.message });
    await run.update({
      status: 'failed',
      errors: [{ error: error.message }],
      completedAt: new Date(),
    });
    throw error;
  }
}

// Run a fresh deep research synthesis.
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
    type: 'deep_research', status: 'running', startedAt: new Date(),
  });
  const report = await DeepResearchReport.create({
    searchTerm: term || `(${(opportunityIds || []).length} selected opportunities)`,
    status: 'running',
    origin,
    organizationId,
    createdBy: userId,
    analysisRunId: run.id,
  });
  return runPipeline(report, run, { searchTerm: term, opportunityIds });
}

// Re-run an existing report. Snapshots the current state into
// report_versions, bumps the version, clears the prior intelligence rows,
// and re-runs the pipeline on the SAME report row — so the URL is stable
// and the history is preserved.
async function reRunReport(id, { userId = null } = {}) {
  const existing = await DeepResearchReport.findByPk(id);
  if (!existing) {
    const err = new Error(`Deep research report ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  // Snapshot the current full report into an immutable version row.
  const snapshot = await getReport(id);
  await ReportVersion.create({
    reportId: id,
    version: existing.version,
    snapshot,
  });
  // Clear the prior run's child rows — the pipeline regenerates them.
  await VentureIdea.destroy({ where: { reportId: id } });
  await MonetizationModel.destroy({ where: { reportId: id } });
  await SignalCorrelation.destroy({ where: { reportId: id } });

  const run = await AnalysisRun.create({
    type: 'deep_research', status: 'running', startedAt: new Date(),
  });
  await existing.update({
    status: 'running',
    version: existing.version + 1,
    analysisRunId: run.id,
    error: null,
    createdBy: userId || existing.createdBy,
  });
  return runPipeline(existing, run, { searchTerm: existing.searchTerm });
}

// ---------------------------------------------------------------------------
// Reads + management.
// ---------------------------------------------------------------------------

async function getReport(id) {
  const report = await DeepResearchReport.findByPk(id, {
    include: [
      { model: VentureIdea, as: 'ventureIdeas' },
      { model: MonetizationModel, as: 'monetizationModels' },
      { model: SignalCorrelation, as: 'signalCorrelation' },
    ],
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
  const versionCount = await ReportVersion.count({ where: { reportId: id } });
  const json = report.toJSON();
  json.ventureIdeas = (json.ventureIdeas || [])
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({ ...v, generationJobs: jobsByIdea[v.id] || [] }));
  json.monetizationModels = (json.monetizationModels || [])
    .sort((a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0));
  json.versionCount = versionCount;
  return json;
}

async function getReportStatus(id) {
  const report = await DeepResearchReport.findByPk(id, {
    attributes: ['id', 'status', 'searchTerm', 'sourceCount', 'error', 'version', 'updatedAt'],
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
    version: report.version,
    error: report.error || null,
    updated_at: report.updatedAt,
  };
}

// The reports index — searchable + filterable list. Lightweight: report
// fields + a venture idea count, no heavy child includes.
async function listReports({
  search, marketStage, minConfidence, favorite, archived,
  limit = 30, offset = 0,
} = {}) {
  const where = {};
  // Archived reports are hidden unless explicitly asked for.
  where.isArchived = archived === true || archived === 'true';
  if (favorite === true || favorite === 'true') where.isFavorite = true;
  if (search && String(search).trim()) {
    where.searchTerm = { [Op.iLike]: `%${String(search).trim()}%` };
  }
  if (marketStage && marketTiming.STAGES.includes(marketStage)) {
    where.marketStage = marketStage;
  }
  if (minConfidence != null && minConfidence !== '') {
    where.confidenceScore = { [Op.gte]: Number(minConfidence) };
  }
  const cappedLimit = Math.min(Number(limit) || 30, 100);
  const { rows, count } = await DeepResearchReport.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: cappedLimit,
    offset: Number(offset) || 0,
  });
  const reportIds = rows.map((r) => r.id);
  // One grouped count query for venture ideas across the page.
  const ideaCounts = {};
  if (reportIds.length) {
    const ideas = await VentureIdea.findAll({
      where: { reportId: { [Op.in]: reportIds } },
      attributes: ['reportId'],
    });
    for (const v of ideas) ideaCounts[v.reportId] = (ideaCounts[v.reportId] || 0) + 1;
  }
  return {
    rows: rows.map((r) => {
      const j = r.toJSON();
      j.ventureIdeaCount = ideaCounts[r.id] || 0;
      return j;
    }),
    total: count,
  };
}

// Favorite / archive toggles.
async function setReportFlag(id, flag, value) {
  const report = await DeepResearchReport.findByPk(id);
  if (!report) {
    const err = new Error(`Deep research report ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const field = flag === 'favorite' ? 'isFavorite' : 'isArchived';
  await report.update({ [field]: value === true || value === 'true' });
  return { id: report.id, [field]: report[field] };
}

// Version history for a report (snapshots only — metadata, not full payloads).
async function getReportVersions(id) {
  const versions = await ReportVersion.findAll({
    where: { reportId: id },
    order: [['version', 'DESC']],
  });
  return versions.map((v) => ({
    version: v.version,
    created_at: v.createdAt,
    status: v.snapshot && v.snapshot.status,
    market_stage: v.snapshot && v.snapshot.marketStage,
    venture_idea_count: v.snapshot && Array.isArray(v.snapshot.ventureIdeas)
      ? v.snapshot.ventureIdeas.length : 0,
  }));
}

module.exports = {
  // exported for direct unit testing
  normalizeOpp,
  aggregateContext,
  assembleReportJson,
  // public API
  runDeepResearch,
  reRunReport,
  getReport,
  getReportStatus,
  listReports,
  setReportFlag,
  getReportVersions,
};
