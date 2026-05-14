// Deep Research Phase 2 — monetizationIntelligence.service tests.

jest.mock('../../src/deepResearch/aiProvider.service', () => ({ chat: jest.fn() }));

const aiProvider = require('../../src/deepResearch/aiProvider.service');
const svc = require('../../src/deepResearch/monetizationIntelligence.service');

beforeEach(() => { aiProvider.chat.mockReset(); });

const context = {
  searchTerm: 'AI agents',
  channels: [
    { key: 'research', label: 'Research', count: 10 },
    { key: 'government', label: 'Government', count: 8 },
    { key: 'talent', label: 'Talent', count: 6 },
  ],
};
const synthesis = { executive_summary: 'hot', market_stage: 'emerging', monetization_strategy: 'SaaS' };

describe('monetizationIntelligence.computeFitScore', () => {
  it('scores the government model high when the government channel is strong', () => {
    const govFit = svc.computeFitScore('government', context);
    const eduFit = svc.computeFitScore('education', context);
    expect(govFit).toBeGreaterThan(0);
    expect(govFit).toBeLessThanOrEqual(1);
    // government channel is strong here, education leans purely on research
    expect(govFit).toBeGreaterThan(eduFit * 0.5);
  });

  it('is deterministic', () => {
    expect(svc.computeFitScore('saas', context)).toBe(svc.computeFitScore('saas', context));
  });
});

describe('monetizationIntelligence.sanitizeModel', () => {
  it('drops a model with an invalid type', () => {
    expect(svc.sanitizeModel({ model_type: 'crypto_airdrop' }, context)).toBeNull();
  });
  it('keeps a valid model, defaults complexity, attaches a deterministic fit score', () => {
    const m = svc.sanitizeModel({
      model_type: 'saas',
      pricing_suggestion: '$50/seat/mo',
      implementation_complexity: 'bogus',
    }, context);
    expect(m.model_type).toBe('saas');
    expect(m.implementation_complexity).toBe('medium'); // invalid → default
    expect(typeof m.fit_score).toBe('number');
  });
});

describe('monetizationIntelligence.generateMonetizationModels', () => {
  it('parses, sanitizes, dedupes by type, and sorts by fit score', async () => {
    aiProvider.chat.mockResolvedValue({
      content: JSON.stringify({
        monetization_models: [
          { model_type: 'saas', pricing_suggestion: '$50/seat' },
          { model_type: 'government', pricing_suggestion: '$200k contract' },
          { model_type: 'saas', pricing_suggestion: 'duplicate — should be dropped' },
          { model_type: 'invalid_type' },
        ],
      }),
      tokensUsed: 600,
    });
    const { models, tokensUsed } = await svc.generateMonetizationModels(context, synthesis);
    expect(models.length).toBe(2); // dupe + invalid dropped
    expect(tokensUsed).toBe(600);
    // sorted by fit_score descending
    expect(models[0].fit_score).toBeGreaterThanOrEqual(models[1].fit_score);
  });

  it('returns an empty list for non-JSON output', async () => {
    aiProvider.chat.mockResolvedValue({ content: 'not json', tokensUsed: 5 });
    const { models } = await svc.generateMonetizationModels(context, synthesis);
    expect(models).toEqual([]);
  });

  it('propagates an AI failure (orchestrator decides how to degrade)', async () => {
    aiProvider.chat.mockRejectedValue(new Error('429 quota'));
    await expect(svc.generateMonetizationModels(context, synthesis)).rejects.toThrow('429 quota');
  });
});
