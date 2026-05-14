// Deep Research Phase 3 — launchStrategy.service tests.

jest.mock('../../src/deepResearch/aiProvider.service', () => ({ chat: jest.fn() }));

const aiProvider = require('../../src/deepResearch/aiProvider.service');
const svc = require('../../src/deepResearch/launchStrategy.service');

beforeEach(() => { aiProvider.chat.mockReset(); });

const ventureIdea = {
  title: 'Gov Compliance Checker',
  description: 'Checks RFP compliance.',
  metadata: { target_customers: 'gov contractors' },
};
const ctx = {
  report: { searchTerm: 'compliance AI', marketStage: 'active' },
  monetizationModels: [{ modelType: 'government', pricingSuggestion: '$200k', idealIcp: 'agencies' }],
};

describe('launchStrategy.buildUserPrompt', () => {
  it('includes the venture, monetization models, and strategic context', () => {
    const prompt = svc.buildUserPrompt(ventureIdea, ctx);
    expect(prompt).toMatch(/Gov Compliance Checker/);
    expect(prompt).toMatch(/government: \$200k/);
    expect(prompt).toMatch(/Research topic: compliance AI/);
  });
});

describe('launchStrategy.sanitizeStrategy', () => {
  it('truncates text fields and caps the channels array', () => {
    const s = svc.sanitizeStrategy({
      icp: 'x'.repeat(2000),
      channels: Array(15).fill('channel'),
      gov_strategy: 'sell to agencies',
    });
    expect(s.icp).toHaveLength(800);
    expect(s.channels.length).toBeLessThanOrEqual(6);
    expect(s.gov_strategy).toBe('sell to agencies');
    expect(s.generated_by).toBe('deep-research-phase-3-launch-strategy');
  });
});

describe('launchStrategy.generateLaunchStrategy', () => {
  it('parses + sanitizes the AI output', async () => {
    aiProvider.chat.mockResolvedValue({
      content: JSON.stringify({
        icp: 'mid-size gov contractors', gtm: 'direct sales', channels: ['outbound', 'partnerships'],
        pricing_strategy: 'usage-based', gov_strategy: 'GSA schedule',
      }),
      tokensUsed: 800,
    });
    const { strategy, tokensUsed } = await svc.generateLaunchStrategy(ventureIdea, ctx);
    expect(strategy.icp).toBe('mid-size gov contractors');
    expect(strategy.channels).toEqual(['outbound', 'partnerships']);
    expect(tokensUsed).toBe(800);
  });

  it('tolerates non-JSON output', async () => {
    aiProvider.chat.mockResolvedValue({ content: 'nope', tokensUsed: 3 });
    const { strategy } = await svc.generateLaunchStrategy(ventureIdea, ctx);
    expect(strategy.icp).toBe('');
    expect(strategy.channels).toEqual([]);
  });

  it('propagates an AI failure', async () => {
    aiProvider.chat.mockRejectedValue(new Error('429 quota'));
    await expect(svc.generateLaunchStrategy(ventureIdea, ctx)).rejects.toThrow('429 quota');
  });
});
