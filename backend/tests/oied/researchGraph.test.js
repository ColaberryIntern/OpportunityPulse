// Research Intelligence Phase 3c — researchGraph.service tests.

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn() },
  ResearchRelationship: { upsert: jest.fn(), findAll: jest.fn() },
  ResearchTopic: { findOne: jest.fn() },
  ResearchAuthor: { findAll: jest.fn() },
  AnalysisRun: { create: jest.fn(async () => ({ update: jest.fn() })) },
}));

const {
  Opportunity, ResearchRelationship, ResearchTopic, ResearchAuthor,
} = require('../../src/models');
const svc = require('../../src/oied/researchGraph.service');

beforeEach(() => {
  Opportunity.findAll.mockReset();
  ResearchRelationship.upsert.mockReset();
  ResearchRelationship.findAll.mockReset();
  ResearchTopic.findOne.mockReset();
  ResearchAuthor.findAll.mockReset();
});

describe('researchGraph.buildRelationships', () => {
  it('materializes cross_channel_matches into edge upserts', async () => {
    Opportunity.findAll.mockResolvedValue([
      {
        id: 1,
        aiAnalysis: {
          cross_channel_matches: {
            matches: [
              { opportunity_id: 10, channel: 'government', overlap_score: 4, shared_terms: ['memory', 'agent'], title: 'Gov contract' },
              { opportunity_id: 11, channel: 'talent', overlap_score: 2, shared_terms: ['memory'], title: 'Job' },
            ],
          },
        },
      },
      { id: 2, aiAnalysis: {} }, // no matches → skipped
    ]);
    const run = await svc.buildRelationships();
    expect(ResearchRelationship.upsert).toHaveBeenCalledTimes(2);
    const firstEdge = ResearchRelationship.upsert.mock.calls[0][0];
    expect(firstEdge.researchOpportunityId).toBe(1);
    expect(firstEdge.relatedOpportunityId).toBe(10);
    expect(firstEdge.relatedChannel).toBe('government');
    expect(firstEdge.score).toBe(4);
    expect(run.update).toBeDefined();
  });

  it('skips matches with no opportunity_id', async () => {
    Opportunity.findAll.mockResolvedValue([
      { id: 1, aiAnalysis: { cross_channel_matches: { matches: [{ channel: 'talent', overlap_score: 3 }] } } },
    ]);
    await svc.buildRelationships();
    expect(ResearchRelationship.upsert).not.toHaveBeenCalled();
  });
});

describe('researchGraph.buildTopicGraph', () => {
  it('throws NOT_FOUND for an unknown topic', async () => {
    ResearchTopic.findOne.mockResolvedValue(null);
    await expect(svc.buildTopicGraph('nonexistent')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('assembles the topic tree: papers, authors, channel-grouped connections', async () => {
    ResearchTopic.findOne.mockResolvedValue({
      topicName: 'cs.ma', paperCount: 12, momentumScore: 80, growthRate: 25, commercialScore: 100,
    });
    Opportunity.findAll.mockResolvedValue([
      {
        id: 1, title: 'Multi-agent paper', source: 'arxiv', sourceUrl: 'http://x', value: null,
        publishedAt: new Date(), actionType: 'BUILD',
        sourceData: { authors: ['A. One', 'B. Two'], githubRepo: 'http://gh' },
        aiAnalysis: { research_summary: { buildable: true } },
      },
    ]);
    ResearchAuthor.findAll.mockResolvedValue([
      { id: 5, name: 'A. One', paperCount: 3, citationCount: 50 },
    ]);
    ResearchRelationship.findAll.mockResolvedValue([
      { relatedOpportunityId: 10, relatedChannel: 'government', score: 4, metadata: { related_title: 'Gov', shared_terms: ['agent'] } },
      { relatedOpportunityId: 11, relatedChannel: 'talent', score: 2, metadata: { related_title: 'Job', shared_terms: ['agent'] } },
    ]);
    const graph = await svc.buildTopicGraph('cs.MA');
    expect(graph.topic.name).toBe('cs.ma');
    expect(graph.topic.momentum_score).toBe(80);
    expect(graph.papers).toHaveLength(1);
    expect(graph.papers[0].buildable).toBe(true);
    expect(graph.papers[0].github_repo).toBe('http://gh');
    expect(graph.authors).toHaveLength(1);
    expect(graph.connections_by_channel.government).toHaveLength(1);
    expect(graph.connections_by_channel.talent).toHaveLength(1);
    expect(graph.edge_count).toBe(2);
  });
});
