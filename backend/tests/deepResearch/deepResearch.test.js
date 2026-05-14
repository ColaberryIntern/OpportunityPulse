// Deep Research Intelligence Engine — deepResearch.service tests.
// Pure helpers tested directly; orchestration tested with mocked models +
// mocked synthesis/idea services. channels.service is pure → used for real.

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn() },
  DeepResearchReport: { create: jest.fn(), findByPk: jest.fn() },
  VentureIdea: { create: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  ProjectGenerationJob: { findAll: jest.fn() },
  AnalysisRun: { create: jest.fn() },
}));
jest.mock('../../src/deepResearch/strategySynthesis.service', () => ({ synthesize: jest.fn() }));
jest.mock('../../src/deepResearch/ventureIdeaGenerator.service', () => ({ generateVentureIdeas: jest.fn() }));

const {
  Opportunity, DeepResearchReport, VentureIdea, ProjectGenerationJob, AnalysisRun,
} = require('../../src/models');
const strategySynthesis = require('../../src/deepResearch/strategySynthesis.service');
const ventureIdeaGenerator = require('../../src/deepResearch/ventureIdeaGenerator.service');
const svc = require('../../src/deepResearch/deepResearch.service');

function fakeRow(initial) {
  const row = { ...initial };
  row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
  row.toJSON = () => ({ ...row, update: undefined, toJSON: undefined });
  return row;
}

beforeEach(() => {
  Object.values(Opportunity).forEach((m) => m.mockReset && m.mockReset());
  Object.values(DeepResearchReport).forEach((m) => m.mockReset && m.mockReset());
  Object.values(VentureIdea).forEach((m) => m.mockReset && m.mockReset());
  Object.values(ProjectGenerationJob).forEach((m) => m.mockReset && m.mockReset());
  AnalysisRun.create.mockReset();
  strategySynthesis.synthesize.mockReset();
  ventureIdeaGenerator.generateVentureIdeas.mockReset();
});

// ---- pure helpers ---------------------------------------------------------

describe('deepResearch.normalizeOpp', () => {
  it('extracts the venture-relevant signals from a research opp', () => {
    const n = svc.normalizeOpp({
      id: 1, title: 'Memory Agents', type: 'research', source: 'arxiv', value: null,
      description: 'A memory layer for agents.',
      sourceData: { githubRepo: 'http://gh' },
      aiAnalysis: {
        research_summary: { buildable: true, market_timing: 'emerging' },
        cross_channel_matches: { matches: [{ id: 2 }, { id: 3 }] },
      },
    });
    expect(n.channel).toBe('research');
    expect(n.buildable).toBe(true);
    expect(n.marketTiming).toBe('emerging');
    expect(n.githubRepo).toBe('http://gh');
    expect(n.crossChannelLinks).toBe(2);
  });

  it('handles a bare opp with no aiAnalysis', () => {
    const n = svc.normalizeOpp({ id: 9, title: 'Gov contract', type: 'gov_contract', source: 'sam_gov', value: 250000 });
    expect(n.channel).toBe('government');
    expect(n.buildable).toBe(false);
    expect(n.crossChannelLinks).toBe(0);
    expect(n.value).toBe(250000);
  });
});

describe('deepResearch.aggregateContext', () => {
  it('groups by channel, caps per-channel items, and rolls up totals', () => {
    const opps = [
      { id: 1, title: 'Paper A', type: 'research', source: 'arxiv', aiAnalysis: { research_summary: { buildable: true } } },
      { id: 2, title: 'Paper B', type: 'research', source: 'arxiv', aiAnalysis: {} },
      { id: 3, title: 'Gov C', type: 'gov_contract', source: 'sam_gov', value: 100000, aiAnalysis: {} },
    ];
    const ctx = svc.aggregateContext('agents', opps);
    expect(ctx.searchTerm).toBe('agents');
    expect(ctx.totals.sourceCount).toBe(3);
    expect(ctx.totals.channelCount).toBe(2);
    expect(ctx.totals.totalValue).toBe(100000);
    expect(ctx.totals.buildableResearchCount).toBe(1);
    // research channel has 2, sorted ahead of government (1)
    expect(ctx.channels[0].key).toBe('research');
    expect(ctx.channels[0].count).toBe(2);
  });
});

describe('deepResearch.assembleReportJson', () => {
  it('assembles the persisted report shape from context + synthesis', () => {
    const ctx = svc.aggregateContext('agents', [
      { id: 1, title: 'P', type: 'research', source: 'arxiv', aiAnalysis: {} },
    ]);
    const json = svc.assembleReportJson(ctx, {
      executive_summary: 'summary', opportunity_signals: ['s1'], suggested_mvps: ['m1'],
      build_recommendation: 'build it',
    });
    expect(json.search_term).toBe('agents');
    expect(json.opportunity_signals).toEqual(['s1']);
    expect(json.suggested_mvps).toEqual(['m1']);
    expect(json.build_recommendation).toBe('build it');
    expect(json.channel_breakdown).toHaveLength(1);
    expect(json.generated_at).toBeTruthy();
  });
});

// ---- orchestration --------------------------------------------------------

describe('deepResearch.runDeepResearch', () => {
  it('rejects when neither a search term nor opportunity ids are given', async () => {
    await expect(svc.runDeepResearch({})).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('runs the full pipeline and persists a success report with venture ideas', async () => {
    AnalysisRun.create.mockResolvedValue(fakeRow({ id: 1 }));
    const report = fakeRow({ id: 10, searchTerm: 'agents', status: 'running' });
    DeepResearchReport.create.mockResolvedValue(report);
    Opportunity.findAll.mockResolvedValue([
      { id: 1, title: 'Paper A', type: 'research', source: 'arxiv', aiAnalysis: {} },
    ]);
    strategySynthesis.synthesize.mockResolvedValue({
      synthesis: { executive_summary: 'hot', market_stage: 'emerging', confidence_score: 0.6 },
      tokensUsed: 500,
    });
    ventureIdeaGenerator.generateVentureIdeas.mockResolvedValue({
      ideas: [{ title: 'Idea 1', buildability_score: 0.5, revenue_potential: 'high', metadata: {} }],
      tokensUsed: 700,
    });
    VentureIdea.create.mockImplementation(async (v) => fakeRow({ id: 100, ...v }));
    // getReport (called at the end) re-fetches with includes.
    DeepResearchReport.findByPk.mockResolvedValue(fakeRow({
      id: 10, searchTerm: 'agents', status: 'success', ventureIdeas: [{ id: 100, sortOrder: 0, title: 'Idea 1' }],
    }));
    ProjectGenerationJob.findAll.mockResolvedValue([]);

    const out = await svc.runDeepResearch({ searchTerm: 'agents' });
    expect(report.status).toBe('success');
    expect(VentureIdea.create).toHaveBeenCalledTimes(1);
    expect(out.ventureIdeas).toHaveLength(1);
  });

  it('degrades to partial when venture idea generation fails', async () => {
    AnalysisRun.create.mockResolvedValue(fakeRow({ id: 1 }));
    const report = fakeRow({ id: 11, searchTerm: 'agents', status: 'running' });
    DeepResearchReport.create.mockResolvedValue(report);
    Opportunity.findAll.mockResolvedValue([
      { id: 1, title: 'Paper A', type: 'research', source: 'arxiv', aiAnalysis: {} },
    ]);
    strategySynthesis.synthesize.mockResolvedValue({
      synthesis: { executive_summary: 'hot', market_stage: 'emerging', confidence_score: 0.6 },
      tokensUsed: 500,
    });
    ventureIdeaGenerator.generateVentureIdeas.mockRejectedValue(new Error('429 quota'));
    DeepResearchReport.findByPk.mockResolvedValue(fakeRow({
      id: 11, status: 'partial', ventureIdeas: [],
    }));
    ProjectGenerationJob.findAll.mockResolvedValue([]);

    await svc.runDeepResearch({ searchTerm: 'agents' });
    expect(report.status).toBe('partial');
    expect(VentureIdea.create).not.toHaveBeenCalled();
  });

  it('marks the report failed when synthesis (the hard gate) fails', async () => {
    AnalysisRun.create.mockResolvedValue(fakeRow({ id: 1 }));
    const report = fakeRow({ id: 12, searchTerm: 'agents', status: 'running' });
    DeepResearchReport.create.mockResolvedValue(report);
    Opportunity.findAll.mockResolvedValue([]);
    strategySynthesis.synthesize.mockRejectedValue(new Error('429 quota'));

    await expect(svc.runDeepResearch({ searchTerm: 'agents' })).rejects.toThrow('429 quota');
    expect(report.status).toBe('failed');
    expect(report.error).toMatch(/429/);
  });
});

describe('deepResearch.getReport', () => {
  it('throws NOT_FOUND for a missing report', async () => {
    DeepResearchReport.findByPk.mockResolvedValue(null);
    await expect(svc.getReport(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('attaches generation jobs to each venture idea', async () => {
    DeepResearchReport.findByPk.mockResolvedValue(fakeRow({
      id: 10, searchTerm: 'agents', status: 'success',
      ventureIdeas: [{ id: 100, sortOrder: 1, title: 'B' }, { id: 101, sortOrder: 0, title: 'A' }],
    }));
    ProjectGenerationJob.findAll.mockResolvedValue([
      { ventureIdeaId: 100, id: 5, status: 'success' },
    ]);
    const out = await svc.getReport(10);
    // sorted by sortOrder: A (0) before B (1)
    expect(out.ventureIdeas[0].title).toBe('A');
    expect(out.ventureIdeas[1].generationJobs).toHaveLength(1);
  });
});

describe('deepResearch.getReportStatus', () => {
  it('returns the lightweight status shape', async () => {
    DeepResearchReport.findByPk.mockResolvedValue(fakeRow({
      id: 10, status: 'success', searchTerm: 'agents', sourceCount: 12, error: null, updatedAt: new Date(),
    }));
    VentureIdea.count.mockResolvedValue(3);
    const status = await svc.getReportStatus(10);
    expect(status.status).toBe('success');
    expect(status.venture_idea_count).toBe(3);
  });

  it('throws NOT_FOUND for a missing report', async () => {
    DeepResearchReport.findByPk.mockResolvedValue(null);
    await expect(svc.getReportStatus(999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
