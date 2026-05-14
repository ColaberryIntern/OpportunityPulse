// Research Intelligence Phase 4 — researchBuildBrief.service tests.
// Pure helpers tested directly; generate/batch tested with mocked AI + models.

jest.mock('../../src/models', () => ({
  Opportunity: { findAll: jest.fn() },
  AnalysisRun: { create: jest.fn(async () => ({ update: jest.fn() })) },
}));
jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', chat: jest.fn() };
  return { getAIClient: () => client, __client: client };
});

const { Opportunity, AnalysisRun } = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');
const svc = require('../../src/oied/researchBuildBrief.service');

beforeEach(() => {
  Opportunity.findAll.mockReset();
  AnalysisRun.create.mockReset();
  AnalysisRun.create.mockResolvedValue({ update: jest.fn() });
  aiMod.__client.chat.mockReset();
});

describe('researchBuildBrief.buildUserPrompt', () => {
  it('includes paper title, abstract, summary and cross-channel demand signal', () => {
    const prompt = svc.buildUserPrompt({
      title: 'Memory Agents',
      description: 'A memory layer for long-running agents.',
      sourceData: { githubRepo: 'http://gh/x', domains: ['cs.MA', 'cs.AI'] },
      aiAnalysis: {
        research_summary: {
          executive_summary: 'Lets agents remember.',
          build_recommendation: 'Build a memory SDK.',
          market_timing: 'emerging',
        },
        cross_channel_matches: {
          matches: [
            { channel: 'government', title: 'State IT contract', value: 250000, shared_terms: ['memory', 'agent'] },
          ],
        },
      },
    });
    expect(prompt).toMatch(/Memory Agents/);
    expect(prompt).toMatch(/memory layer for long-running agents/);
    expect(prompt).toMatch(/Has public GitHub repo: yes/);
    expect(prompt).toMatch(/cs\.MA, cs\.AI/);
    expect(prompt).toMatch(/Build a memory SDK/);
    expect(prompt).toMatch(/\[government\] State IT contract \(\$250,000\)/);
    expect(prompt).toMatch(/your demand signal/);
  });

  it('says so honestly when there are no linked opportunities', () => {
    const prompt = svc.buildUserPrompt({
      title: 'Niche paper',
      description: 'abstract',
      aiAnalysis: { research_summary: {} },
    });
    expect(prompt).toMatch(/Linked opportunities: NONE/);
  });
});

describe('researchBuildBrief.sanitizeBrief', () => {
  it('clamps confidence to [0,1] and truncates long fields', () => {
    const brief = svc.sanitizeBrief({
      product_idea: 'x'.repeat(900),
      target_customers: 'gov buyers',
      suggested_architecture: 'reuse the embeddings pipeline',
      mvp_scope: 'small thing',
      proposal_angle: 'the pitch',
      confidence: 1.7,
    }, 'gpt-4o-mini');
    expect(brief.product_idea).toHaveLength(600);
    expect(brief.confidence).toBe(1);
    expect(brief.model_used).toBe('gpt-4o-mini');
    expect(brief.generated_at).toBeTruthy();
  });

  it('handles a negative / missing confidence and empty fields', () => {
    const brief = svc.sanitizeBrief({ confidence: -3 }, 'gpt-4o-mini');
    expect(brief.confidence).toBe(0);
    expect(brief.product_idea).toBe('');
    expect(brief.proposal_angle).toBe('');
  });
});

describe('researchBuildBrief.generateBuildBrief', () => {
  it('calls the AI, parses JSON, and persists onto aiAnalysis.build_brief', async () => {
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({
        product_idea: 'A memory SDK for agents',
        target_customers: 'gov IT shops',
        suggested_architecture: 'wrap the existing vector store',
        mvp_scope: 'one quarter',
        proposal_angle: 'ship agent memory fast',
        confidence: 0.6,
      }),
      tokensUsed: 420,
    });
    const update = jest.fn();
    const opp = {
      id: 7,
      title: 'Memory Agents',
      description: 'abstract',
      aiAnalysis: { research_summary: { buildable: true } },
      update,
    };
    const { brief, tokensUsed } = await svc.generateBuildBrief(opp);
    expect(brief.product_idea).toBe('A memory SDK for agents');
    expect(brief.confidence).toBe(0.6);
    expect(tokensUsed).toBe(420);
    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0];
    expect(written.aiAnalysis.build_brief.product_idea).toBe('A memory SDK for agents');
    expect(written.aiAnalysis.research_summary.buildable).toBe(true); // existing keys preserved
  });

  it('tolerates non-JSON AI output by persisting an empty-ish brief', async () => {
    aiMod.__client.chat.mockResolvedValue({ content: 'sorry, no JSON here', tokensUsed: 10 });
    const update = jest.fn();
    await svc.generateBuildBrief({ id: 8, aiAnalysis: {}, update });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].aiAnalysis.build_brief.product_idea).toBe('');
  });
});

describe('researchBuildBrief.generateBuildBriefBatch', () => {
  it('only briefs buildable research opps without an existing brief', async () => {
    Opportunity.findAll.mockResolvedValue([
      { id: 1, title: 'Buildable, no brief', aiAnalysis: { research_summary: { buildable: true } }, update: jest.fn() },
      { id: 2, title: 'Not buildable', aiAnalysis: { research_summary: { buildable: false } }, update: jest.fn() },
      { id: 3, title: 'Already briefed', aiAnalysis: { research_summary: { buildable: true }, build_brief: { product_idea: 'done' } }, update: jest.fn() },
      { id: 4, title: 'No summary', aiAnalysis: {}, update: jest.fn() },
    ]);
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({ product_idea: 'idea', confidence: 0.5 }),
      tokensUsed: 100,
    });
    const run = await svc.generateBuildBriefBatch({ limit: 10 });
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1); // only opp 1
    const runUpdate = run.update.mock.calls[0][0];
    expect(runUpdate.status).toBe('success');
    expect(runUpdate.inputCount).toBe(1);
    expect(runUpdate.outputCount).toBe(1);
  });

  it('re-briefs everything buildable when force=true', async () => {
    Opportunity.findAll.mockResolvedValue([
      { id: 1, title: 'A', aiAnalysis: { research_summary: { buildable: true }, build_brief: { product_idea: 'old' } }, update: jest.fn() },
      { id: 2, title: 'B', aiAnalysis: { research_summary: { buildable: true } }, update: jest.fn() },
    ]);
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({ product_idea: 'idea', confidence: 0.5 }),
      tokensUsed: 50,
    });
    await svc.generateBuildBriefBatch({ limit: 10, force: true });
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(2);
  });

  it('reports success with a message when nothing needs a brief', async () => {
    Opportunity.findAll.mockResolvedValue([
      { id: 2, title: 'Not buildable', aiAnalysis: { research_summary: { buildable: false } }, update: jest.fn() },
    ]);
    const run = await svc.generateBuildBriefBatch({ limit: 10 });
    expect(aiMod.__client.chat).not.toHaveBeenCalled();
    const runUpdate = run.update.mock.calls[0][0];
    expect(runUpdate.status).toBe('success');
    expect(runUpdate.outputCount).toBe(0);
  });

  it('marks the run partial and records errors when a brief fails', async () => {
    Opportunity.findAll.mockResolvedValue([
      { id: 1, title: 'A', aiAnalysis: { research_summary: { buildable: true } }, update: jest.fn() },
      { id: 2, title: 'B', aiAnalysis: { research_summary: { buildable: true } }, update: jest.fn() },
    ]);
    aiMod.__client.chat
      .mockResolvedValueOnce({ content: JSON.stringify({ product_idea: 'ok', confidence: 0.5 }), tokensUsed: 100 })
      .mockRejectedValueOnce(new Error('AI down'));
    const run = await svc.generateBuildBriefBatch({ limit: 10 });
    const runUpdate = run.update.mock.calls[0][0];
    expect(runUpdate.status).toBe('partial');
    expect(runUpdate.outputCount).toBe(1);
    expect(runUpdate.errors).toHaveLength(1);
    expect(runUpdate.errors[0].opportunityId).toBe(2);
  });
});
