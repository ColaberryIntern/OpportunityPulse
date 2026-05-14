// Deep Research Intelligence Engine — AI Project Architect bridge.
//
// FOUNDATION (Phase 1). This service owns the project_generation_jobs
// lifecycle: a venture idea is handed off for requirements generation, and
// the job is walked through phases with persisted progress so the UI can
// poll it (and a future build can switch to SSE without changing the data
// model).
//
// The actual handoff to Agent Foundry (the "AI Project Architect") is a
// SINGLE clearly-marked seam: `_dispatchToAgentFoundry`. There is no Agent
// Foundry API contract yet, so Phase 1 generates a structured requirements
// scaffold deterministically from the venture idea itself. When the real
// integration lands, only that one function changes — the job model, the
// phase walker, the progress tracking, and the polling API all stay.

const {
  VentureIdea, ProjectGenerationJob, DeepResearchReport, MonetizationModel, SignalCorrelation,
} = require('../models');
const logger = require('../logging/logger');
const projectArchitectClient = require('./projectArchitectClient.service');

// The phase sequence every requirements-generation job walks. Persisted
// onto the job row so the UI renders a phase tracker.
const PHASES = [
  { key: 'analyzing_venture', label: 'Analyzing venture idea' },
  { key: 'drafting_requirements', label: 'Drafting product requirements' },
  { key: 'structuring_architecture', label: 'Structuring system architecture' },
  { key: 'handoff_to_architect', label: 'Handing off to AI Project Architect' },
  { key: 'finalizing', label: 'Finalizing project scaffold' },
];

// Per-phase pacing. Short in production so the polling UI sees real
// progression; zero in test so the suite stays fast.
const PHASE_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 600;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// kebab-case slug from a venture idea title — used as the project slug.
function slugify(title) {
  return String(title || 'venture')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'venture';
}

// Fresh phase log — every phase pending.
function scaffoldPhases() {
  return PHASES.map((p) => ({
    key: p.key, label: p.label, status: 'pending', started_at: null, completed_at: null,
  }));
}

// Deep-copy the phase array before persisting. Sequelize does not detect
// in-place mutation of a JSONB array (same reference → "unchanged" → the
// column write is skipped), so every job.update that carries phases must
// hand it a fresh object.
function clonePhases(phases) {
  return phases.map((p) => ({ ...p }));
}

// ---------------------------------------------------------------------------
// THE SEAM — Agent Foundry handoff.
// ---------------------------------------------------------------------------
// Pull the full venture-aware context for a venture idea: its parent
// report, the report's monetization models, and the cross-channel
// correlation. Returns nulls gracefully if a piece is missing.
async function _loadVentureContext(ventureIdea) {
  if (!ventureIdea.reportId) return { report: null, monetizationModels: [], correlation: null };
  const [report, monetizationModels, correlation] = await Promise.all([
    DeepResearchReport.findByPk(ventureIdea.reportId),
    MonetizationModel.findAll({ where: { reportId: ventureIdea.reportId } }),
    SignalCorrelation.findOne({ where: { reportId: ventureIdea.reportId } }),
  ]);
  return { report, monetizationModels: monetizationModels || [], correlation };
}

// Phase 1 foundation: there is no Agent Foundry API wired up yet, so this
// produces a structured requirements scaffold deterministically from the
// venture idea. It is real, useful output — not a fake. When Agent Foundry
// exposes an API, replace the body with the HTTP handoff; the return
// contract stays the same: { projectSlug, architectUrl, requirements }.
//
// Phase 2 — the scaffold is now VENTURE-AWARE, not just topic summarization:
// it carries the strategic context (market stage, correlation, convergence),
// the monetization model set, the ICP, GTM, and competitive landscape — so
// the downstream Architect run is grounded in the full venture intelligence.
async function _dispatchToAgentFoundry(ventureIdea, ctx = {}) {
  const slug = slugify(ventureIdea.title);
  const meta = ventureIdea.metadata || {};
  const { report, monetizationModels, correlation } = ctx;
  const reportJson = (report && report.reportJson) || {};
  const scores = ventureIdea.scores || {};

  // Strategic context — the "why now / how big" framing.
  const strategicContext = {
    research_topic: report ? report.searchTerm : null,
    market_stage: report ? report.marketStage : null,
    executive_summary: report ? report.executiveSummary : null,
    correlation_strength: correlation ? Number(correlation.correlationStrength) : null,
    convergence_type: correlation ? correlation.convergenceType : null,
    acceleration: correlation ? Number(correlation.acceleration) : null,
    venture_composite_score: ventureIdea.compositeScore != null
      ? Number(ventureIdea.compositeScore) : null,
    recommendation_level: ventureIdea.recommendationLevel || null,
  };

  // Monetization transfer — the full model set, best-fit first.
  const monetization = {
    primary_strategy: ventureIdea.monetizationStrategy || '',
    models: (monetizationModels || [])
      .slice()
      .sort((a, b) => Number(b.fitScore || 0) - Number(a.fitScore || 0))
      .map((m) => ({
        type: m.modelType,
        pricing: m.pricingSuggestion,
        icp: m.idealIcp,
        revenue_model: m.revenueModel,
        complexity: m.implementationComplexity,
        fit_score: m.fitScore != null ? Number(m.fitScore) : null,
      })),
  };

  // Competitive landscape — from the report's opportunity signals + the
  // correlation's convergence read.
  const competitiveLandscape = {
    market_stage: report ? report.marketStage : 'unknown',
    convergence: correlation ? correlation.convergenceType : 'none',
    opportunity_signals: Array.isArray(reportJson.opportunity_signals)
      ? reportJson.opportunity_signals.slice(0, 5) : [],
    competition_saturation_score: scores.competition_saturation != null
      ? scores.competition_saturation : null,
  };

  const requirements = {
    project_name: ventureIdea.title,
    generated_by: 'deep-research-phase-2-venture-aware',
    overview: ventureIdea.description || '',
    // Venture-aware context blocks.
    strategic_context: strategicContext,
    target_customers: meta.target_customers || '',
    ideal_customer_profile: monetization.models[0] ? monetization.models[0].icp : (meta.target_customers || ''),
    mvp_scope: ventureIdea.mvpScope || '',
    suggested_architecture: meta.suggested_architecture || '',
    monetization,
    go_to_market: ventureIdea.gtmSummary || '',
    competitive_landscape: competitiveLandscape,
    venture_scores: scores,
    market_timing: ventureIdea.marketTiming || (report ? report.marketStage : 'unknown'),
    buildability_score: ventureIdea.buildabilityScore != null
      ? Number(ventureIdea.buildabilityScore) : null,
    revenue_potential: ventureIdea.revenuePotential || 'medium',
    // The functional requirement skeleton a real Architect run would expand.
    functional_requirements: [
      'Define the core data model and persistence layer.',
      'Implement the primary user workflow described in the MVP scope.',
      `Stand up the monetization path — primary model: ${monetization.models[0] ? monetization.models[0].type : 'tbd'}.`,
      'Add observability: structured logs + a health endpoint.',
      'Wire the go-to-market motion described in the GTM context.',
    ],
    next_step: 'Hand this venture-aware scaffold to the AI Project Architect (Agent Foundry) '
      + 'for full requirement expansion and code generation.',
  };
  return {
    projectSlug: slug,
    architectUrl: `/agent-foundry/projects/${slug}`,
    requirements,
  };
}

// ---------------------------------------------------------------------------
// Job lifecycle.
// ---------------------------------------------------------------------------

// How long the real-architect path will poll a remote job before giving up.
const REMOTE_POLL_MAX = process.env.NODE_ENV === 'test' ? 3 : 40;
const REMOTE_POLL_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 3000;

// FOUNDATION PATH — the deterministic phase walk. Used when Agent Foundry
// is not configured. Builds the venture-aware requirements scaffold locally.
async function _runFoundationWalk(job, ventureIdea) {
  const phases = scaffoldPhases();
  let architectResult = null;

  for (let i = 0; i < phases.length; i += 1) {
    const phase = phases[i];
    phase.status = 'running';
    phase.started_at = new Date().toISOString();
    // eslint-disable-next-line no-await-in-loop
    await job.update({
      currentPhase: phase.label,
      phases: clonePhases(phases),
      progressPercent: Math.round((i / phases.length) * 100),
    });
    // eslint-disable-next-line no-await-in-loop
    await wait(PHASE_DELAY_MS);
    if (phase.key === 'handoff_to_architect') {
      // eslint-disable-next-line no-await-in-loop
      const ventureCtx = await _loadVentureContext(ventureIdea);
      // eslint-disable-next-line no-await-in-loop
      architectResult = await _dispatchToAgentFoundry(ventureIdea, ventureCtx);
    }
    phase.status = 'completed';
    phase.completed_at = new Date().toISOString();
    // eslint-disable-next-line no-await-in-loop
    await job.update({
      phases: clonePhases(phases),
      progressPercent: Math.round(((i + 1) / phases.length) * 100),
    });
  }

  await job.update({
    status: 'success',
    currentPhase: 'Complete',
    progressPercent: 100,
    phases: clonePhases(phases),
    provider: 'foundation',
    projectSlug: architectResult ? architectResult.projectSlug : slugify(ventureIdea.title),
    architectUrl: architectResult ? architectResult.architectUrl : null,
    requirementsJson: architectResult ? architectResult.requirements : null,
    completedAt: new Date(),
  });
}

// REAL PATH — the live Agent Foundry HTTP integration. Builds the venture-
// aware payload, creates a remote job, then polls it (resumable: the remote
// job id is persisted, so a re-driven processJob picks up the same job).
async function _runRealArchitect(job, ventureIdea) {
  const phases = scaffoldPhases();
  const markPhase = async (idx, status) => {
    phases[idx].status = status;
    if (status === 'running') phases[idx].started_at = new Date().toISOString();
    if (status === 'completed') phases[idx].completed_at = new Date().toISOString();
    await job.update({ phases: clonePhases(phases), currentPhase: phases[idx].label });
  };

  // Phases 0-2 — local prep: build the venture-aware payload.
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await markPhase(i, 'running');
    // eslint-disable-next-line no-await-in-loop
    await job.update({ progressPercent: Math.round((i / phases.length) * 100) });
    // eslint-disable-next-line no-await-in-loop
    await markPhase(i, 'completed');
  }
  const ventureCtx = await _loadVentureContext(ventureIdea);
  const scaffold = await _dispatchToAgentFoundry(ventureIdea, ventureCtx);

  // Phase 3 — the real handoff. Resumable: reuse an existing externalJobId.
  await markPhase(3, 'running');
  let externalJobId = job.externalJobId;
  if (!externalJobId) {
    const created = await projectArchitectClient.createJob(scaffold.requirements);
    externalJobId = created.externalJobId;
    await job.update({ externalJobId, provider: 'agent_foundry', projectSlug: scaffold.projectSlug });
  }
  await markPhase(3, 'completed');

  // Phase 4 — poll the remote job until it terminates.
  await markPhase(4, 'running');
  let remote = null;
  for (let poll = 0; poll < REMOTE_POLL_MAX; poll += 1) {
    // eslint-disable-next-line no-await-in-loop
    remote = await projectArchitectClient.pollJob(externalJobId);
    // eslint-disable-next-line no-await-in-loop
    await job.update({
      progressPercent: remote.progressPercent != null
        ? Math.max(80, Math.min(99, remote.progressPercent)) : 90,
      currentPhase: remote.currentPhase || 'AI Project Architect working…',
    });
    if (remote.status === 'success' || remote.status === 'failed') break;
    // eslint-disable-next-line no-await-in-loop
    await wait(REMOTE_POLL_DELAY_MS);
  }

  if (!remote || remote.status === 'failed') {
    throw new Error(`Agent Foundry job ${externalJobId} did not complete successfully`);
  }
  await markPhase(4, 'completed');
  await job.update({
    status: 'success',
    currentPhase: 'Complete',
    progressPercent: 100,
    phases: clonePhases(phases),
    architectUrl: remote.artifactUrl || scaffold.architectUrl,
    requirementsJson: remote.requirements || scaffold.requirements,
    completedAt: new Date(),
  });
}

// Walk a queued job to completion. Fire-and-forget from createJob — the HTTP
// request returns immediately and the UI polls getJobStatus. Retry-safe: a
// job that died mid-walk can be re-driven by calling this again (the real
// path reuses the persisted externalJobId; the foundation path re-walks).
async function processJob(jobId) {
  const job = await ProjectGenerationJob.findByPk(jobId);
  if (!job) {
    logger.warn('projectArchitectBridge: processJob — job not found', { jobId });
    return;
  }
  if (job.status === 'success') return; // already done — idempotent no-op

  const ventureIdea = await VentureIdea.findByPk(job.ventureIdeaId);
  if (!ventureIdea) {
    await job.update({
      status: 'failed',
      error: `Venture idea ${job.ventureIdeaId} not found`,
      completedAt: new Date(),
    });
    return;
  }

  const useRealArchitect = projectArchitectClient.isConfigured();
  try {
    await job.update({ status: 'running', startedAt: job.startedAt || new Date() });
    if (useRealArchitect) {
      await _runRealArchitect(job, ventureIdea);
    } else {
      await _runFoundationWalk(job, ventureIdea);
    }
    logger.info('projectArchitectBridge: job complete', {
      jobId: job.id, ventureIdeaId: job.ventureIdeaId, provider: useRealArchitect ? 'agent_foundry' : 'foundation',
    });
  } catch (error) {
    logger.error('projectArchitectBridge: job failed', { jobId: job.id, error: error.message });
    await job.update({ status: 'failed', error: error.message, completedAt: new Date() });
  }
}

// Create a requirements-generation job for a venture idea and start it.
// Idempotent guard: if an active (queued/running) job already exists for
// this venture idea, return it instead of starting a duplicate walk.
async function createJob({ ventureIdeaId, userId = null } = {}) {
  const id = Number(ventureIdeaId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('A valid ventureIdeaId is required');
    err.code = 'BAD_INPUT';
    throw err;
  }
  const ventureIdea = await VentureIdea.findByPk(id);
  if (!ventureIdea) {
    const err = new Error(`Venture idea ${id} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const existing = await ProjectGenerationJob.findOne({
    where: { ventureIdeaId: id, status: ['queued', 'running'] },
    order: [['id', 'DESC']],
  });
  if (existing) return existing;

  const job = await ProjectGenerationJob.create({
    ventureIdeaId: id,
    reportId: ventureIdea.reportId,
    status: 'queued',
    progressPercent: 0,
    currentPhase: 'Queued',
    phases: scaffoldPhases(),
    createdBy: userId,
  });

  // Fire-and-forget — the HTTP response returns the queued job immediately;
  // the UI polls getJobStatus. Errors are caught inside processJob and
  // persisted onto the job row, so an unhandled rejection here is just a
  // safety-net log.
  processJob(job.id).catch((e) => {
    logger.error('projectArchitectBridge: processJob crashed', { jobId: job.id, error: e.message });
  });

  return job;
}

// Status poll for the progress UI.
async function getJobStatus(jobId) {
  const job = await ProjectGenerationJob.findByPk(jobId);
  if (!job) {
    const err = new Error(`Project generation job ${jobId} not found`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return {
    id: job.id,
    venture_idea_id: job.ventureIdeaId,
    report_id: job.reportId,
    status: job.status,
    progress_percent: job.progressPercent,
    current_phase: job.currentPhase,
    phases: job.phases || [],
    project_slug: job.projectSlug,
    architect_url: job.architectUrl,
    requirements: job.requirementsJson || null,
    error: job.error || null,
    started_at: job.startedAt,
    completed_at: job.completedAt,
  };
}

module.exports = {
  PHASES,
  slugify,
  scaffoldPhases,
  processJob,
  createJob,
  getJobStatus,
};
