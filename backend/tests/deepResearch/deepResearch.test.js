// Deep Research Intelligence Engine — deepResearch.service tests (Phase 2).
// Pure helpers tested directly; orchestration tested with the AI-dependent
// services mocked and the deterministic engines (correlation/timing/scoring)
// running for real. channels.service is pure → used for real.

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn() },
  DeepResearchReport: { create: jest.fn(), findByPk: jest.fn(), findAndCountAll: jest.fn() },
  VentureIdea: { create: jest.fn(), findAll: jest.fn(), count: jest.fn(), destroy: jest.fn() },
  ProjectGenerationJob: { findAll: jest.fn() },
  AnalysisRun: { create: jest.fn() },
  SignalCorrelation: { create: jest.fn(), destroy: jest.fn() },
  MonetizationModel: { create: jest.fn(), destroy: jest.fn() },
  ReportVersion: { create: jest.fn(), count: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../../src/deepResearch/strategySynthesis.service', () => ({ synthesize: jest.fn() }));
jest.mock('../../src/deepResearch/ventureIdeaGenerator.service', () => ({ generateVentureIdeas: jest.fn() }));
jest.mock('../../src/deepResearch/monetizationIntelligence.service', () => ({ generateMonetizationModels: jest.fn() }));

const {
  Opportunity, DeepResearchReport, VentureIdea, ProjectGenerationJob, AnalysisRun,
  SignalCorrelation, MonetizationModel, ReportVersion,
} = require('../../src/models');
const strategySynthesis = require('../../src/deepResearch/strategySynthesis.service');
const ventureIdeaGenerator = require('../../src/deepResearch/ventureIdeaGenerator.service');
const monetizationIntelligence = require('../../src/deepResearch/monetizationIntelligence.service');
const svc = require('../../src/deepResearch/deepResearch.service');

function fakeRow(initial) {
  const row = { ...initial };
  row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
  row.toJSON = () => ({ ...row, update: undefined, toJSON: undefined });
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  AnalysisRun.create.mockResolvedValue(fakeRow({ id: 1 }));
  SignalCorrelation.create.mockResolvedValue({});
  SignalCorrelation.destroy.mockResolvedValue(0);
  MonetizationModel.create.mockResolvedValue({});
  MonetizationModel.destroy.mockResolvedValue(0);
  VentureIdea.destroy.mockResolvedValue(0);
  VentureIdea.create.mockImplementation(async (v) => fakeRow({ id: 100, ...v }));
  ProjectGenerationJob.findAll.mockResolvedValue([]);
  ReportVersion.count.mockResolvedValue(0);
  ReportVersion.create.mockResolvedValue({});
});

// ---- pure helpers ---------------------------------------------------------

describe('deepResearch.normalizeOpp', () => {
  it('extracts venture-relevant signals from a research opp', () => {
    const n = svc.normalizeOpp({
      id: 1, title: 'Memory Agents', type: 'research', source: 'arxiv',
      description: 'A memory layer.', sourceData: { githubRepo: 'http://gh' },
      aiAnalysis: {
        research_summary: { buildable: true, market_timing: 'emerging' },
        cross_channel_matches: { matches: [{ id: 2 }] },
      },
    });
    expect(n.channel).toBe('research');
    expect(n.buildable).toBe(true);
    expect(n.crossChannelLinks).toBe(1);
  });
});

describe('deepResearch.aggregateContext', () => {
  it('groups by channel, rolls up totals, and computes recency windows', () => {
    const now = new Date();
    const old = new Date(now.getTime() - 200 * 24 * 3600 * 1000);
    const opps = [
      { id: 1, title: 'A', type: 'research', source: 'arxiv', publishedAt: now, aiAnalysis: {} },
      { id: 2, title: 'B', type: 'research', source: 'arxiv', publishedAt: old, aiAnalysis: {} },
      { id: 3, title: 'C', type: 'gov_contract', source: 'sam_gov', value: 100000, publishedAt: now, aiAnalysis: {} },
    ];
    const ctx = svc.aggregateContext('agents', opps);
    expect(ctx.totals.sourceCount).toBe(3);
    expect(ctx.totals.channelCount).toBe(2);
    const research = ctx.channels.find((c) => c.key === 'research');
    expect(research.count).toBe(2);
    expect(research.recentCount).toBe(1); // one recent, one >180d (neither prior nor recent)
  });
});

// ---- orchestration --------------------------------------------------------

function wireHappyPath() {
  strategySynthesis.synthesize.mockResolvedValue({
    synthesis: {
      executive_summary: 'hot', market_stage: 'emerging', confidence_score: 0.6,
      opportunity_signals: ['sig'],
    },
    tokensUsed: 500,
  });
  ventureIdeaGenerator.generateVentureIdeas.mockResolvedValue({
    ideas: [{
      title: 'Idea 1', buildability_score: 0.7, revenue_potential: 'high', metadata: {},
    }],
    tokensUsed: 700,
  });
  monetizationIntelligence.generateMonetizationModels.mockResolvedValue({
    models: [{
      model_type: 'saas', pricing_suggestion: '$X', ideal_icp: 'Y',
      revenue_model: 'recurring', implementation_complexity: 'medium', fit_score: 0.7, metadata: {},
    }],
    tokensUsed: 400,
  });
}

describe('deepResearch.runDeepResearch', () => {
  it('rejects when neither a search term nor opportunity ids are given', async () => {
    await expect(svc.runDeepResearch({})).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('runs the full Phase 2 pipeline: synthesis + correlation + timing + ideas + monetization + scoring', async () => {
    wireHappyPath();
    const report = fakeRow({ id: 10, searchTerm: 'agents', status: 'running', version: 1 });
    DeepResearchReport.create.mockResolvedValue(report);
    Opportunity.findAll.mockResolvedValue([
      { id: 1, title: 'Paper A', type: 'research', source: 'arxiv', publishedAt: new Date(), aiAnalysis: {} },
      { id: 2, title: 'Gov B', type: 'gov_contract', source: 'sam_gov', value: 5000, publishedAt: new Date(), aiAnalysis: {} },
    ]);
    DeepResearchReport.findByPk.mockResolvedValue(fakeRow({
      id: 10, status: 'success', ventureIdeas: [{ id: 100, sortOrder: 0, title: 'Idea 1' }],
      monetizationModels: [{ id: 1, modelType: 'saas', fitScore: 0.7 }], signalCorrelation: {},
    }));

    await svc.runDeepResearch({ searchTerm: 'agents' });

    expect(strategySynthesis.synthesize).toHaveBeenCalled();
    expect(monetizationIntelligence.generateMonetizationModels).toHaveBeenCalled();
    expect(VentureIdea.create).toHaveBeenCalledTimes(1);
    // venture idea was scored before persisting
    expect(VentureIdea.create.mock.calls[0][0].compositeScore).toBeGreaterThan(0);
    expect(VentureIdea.create.mock.calls[0][0].recommendationLevel).toBeTruthy();
    // correlation + monetization persisted
    expect(SignalCorrelation.create).toHaveBeenCalledTimes(1);
    expect(MonetizationModel.create).toHaveBeenCalledTimes(1);
    // report finished with intelligence scores
    expect(report.status).toBe('success');
    expect(report.marketStage).toBeTruthy();
    expect(report.correlationStrength).not.toBeNull();
  });

  it('degrades to partial when venture idea generation fails', async () => {
    wireHappyPath();
    ventureIdeaGenerator.generateVentureIdeas.mockRejectedValue(new Error('429 quota'));
    const report = fakeRow({ id: 11, searchTerm: 'agents', status: 'running', version: 1 });
    DeepResearchReport.create.mockResolvedValue(report);
    Opportunity.findAll.mockResolvedValue([
      { id: 1, title: 'A', type: 'research', source: 'arxiv', publishedAt: new Date(), aiAnalysis: {} },
    ]);
    DeepResearchReport.findByPk.mockResolvedValue(fakeRow({ id: 11, status: 'partial', ventureIdeas: [] }));

    await svc.runDeepResearch({ searchTerm: 'agents' });
    expect(report.status).toBe('partial');
    expect(VentureIdea.create).not.toHaveBeenCalled();
    // correlation still persisted — deterministic engines don't fail
    expect(SignalCorrelation.create).toHaveBeenCalledTimes(1);
  });

  it('marks the report failed when synthesis (the hard gate) fails', async () => {
    strategySynthesis.synthesize.mockRejectedValue(new Error('429 quota'));
    const report = fakeRow({ id: 12, searchTerm: 'agents', status: 'running', version: 1 });
    DeepResearchReport.create.mockResolvedValue(report);
    Opportunity.findAll.mockResolvedValue([]);

    await expect(svc.runDeepResearch({ searchTerm: 'agents' })).rejects.toThrow('429 quota');
    expect(report.status).toBe('failed');
  });
});

describe('deepResearch.reRunReport', () => {
  it('snapshots the current report, bumps the version, clears child rows, and re-runs', async () => {
    wireHappyPath();
    const existing = fakeRow({ id: 20, searchTerm: 'agents', status: 'success', version: 2 });
    DeepResearchReport.findByPk
      .mockResolvedValueOnce(existing) // initial findByPk in reRunReport
      .mockResolvedValue(fakeRow({ id: 20, status: 'success', ventureIdeas: [], monetizationModels: [], signalCorrelation: {} }));
    Opportunity.findAll.mockResolvedValue([]);

    await svc.reRunReport(20);
    expect(ReportVersion.create).toHaveBeenCalledTimes(1);
    expect(ReportVersion.create.mock.calls[0][0].version).toBe(2); // snapshotted the OLD version
    expect(VentureIdea.destroy).toHaveBeenCalled();
    expect(SignalCorrelation.destroy).toHaveBeenCalled();
    expect(existing.version).toBe(3); // bumped
  });

  it('throws NOT_FOUND for a missing report', async () => {
    DeepResearchReport.findByPk.mockResolvedValue(null);
    await expect(svc.reRunReport(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deepResearch.listReports', () => {
  it('lists reports with filters and attaches venture idea counts', async () => {
    DeepResearchReport.findAndCountAll.mockResolvedValue({
      rows: [fakeRow({ id: 1, searchTerm: 'agents' }), fakeRow({ id: 2, searchTerm: 'gov ai' })],
      count: 2,
    });
    VentureIdea.findAll.mockResolvedValue([{ reportId: 1 }, { reportId: 1 }, { reportId: 2 }]);
    const out = await svc.listReports({ search: 'a', marketStage: 'emerging' });
    expect(out.total).toBe(2);
    expect(out.rows[0].ventureIdeaCount).toBe(2);
    expect(out.rows[1].ventureIdeaCount).toBe(1);
    // archived filter defaults to false
    expect(DeepResearchReport.findAndCountAll.mock.calls[0][0].where.isArchived).toBe(false);
    expect(DeepResearchReport.findAndCountAll.mock.calls[0][0].where.marketStage).toBe('emerging');
  });
});

describe('deepResearch.setReportFlag', () => {
  it('toggles the favorite flag', async () => {
    const report = fakeRow({ id: 5, isFavorite: false });
    DeepResearchReport.findByPk.mockResolvedValue(report);
    const out = await svc.setReportFlag(5, 'favorite', true);
    expect(report.isFavorite).toBe(true);
    expect(out.isFavorite).toBe(true);
  });

  it('throws NOT_FOUND for a missing report', async () => {
    DeepResearchReport.findByPk.mockResolvedValue(null);
    await expect(svc.setReportFlag(999, 'favorite', true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deepResearch.getReport', () => {
  it('throws NOT_FOUND for a missing report', async () => {
    DeepResearchReport.findByPk.mockResolvedValue(null);
    await expect(svc.getReport(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
