const { classifyByRules } = require('../../src/actionEngine/classification.rules');

describe('Freelance Classification Rules', () => {
  const makeOpp = (overrides = {}) => ({
    type: 'freelance',
    aiScore: 0,
    value: 0,
    tags: [],
    expiresAt: null,
    ...overrides,
  });

  it('should classify high-value high-score as APPLY', () => {
    const result = classifyByRules(makeOpp({ value: 10000, aiScore: 70 }));
    expect(result.actionType).toBe('APPLY');
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
  });

  it('should classify low-budget as IGNORE', () => {
    const result = classifyByRules(makeOpp({ value: 500, aiScore: 50 }));
    expect(result.actionType).toBe('IGNORE');
  });

  it('should classify SaaS-potential tags as BUILD', () => {
    const result = classifyByRules(makeOpp({
      value: 3000,
      aiScore: 55,
      tags: ['saas', 'python', 'api'],
    }));
    expect(result.actionType).toBe('BUILD');
  });

  it('should classify moderate match as APPLY', () => {
    const result = classifyByRules(makeOpp({ value: 3000, aiScore: 55 }));
    expect(result.actionType).toBe('APPLY');
  });

  it('should classify low score as IGNORE', () => {
    const result = classifyByRules(makeOpp({ value: 3000, aiScore: 20 }));
    expect(result.actionType).toBe('IGNORE');
  });

  it('should handle zero budget with moderate score', () => {
    const result = classifyByRules(makeOpp({ value: 0, aiScore: 55 }));
    expect(result.actionType).toBe('APPLY');
  });

  it('should include reasoning in all results', () => {
    const result = classifyByRules(makeOpp({ value: 5000, aiScore: 70 }));
    expect(result.reasoning).toBeDefined();
    expect(typeof result.reasoning).toBe('string');
    expect(result.reasoning.length).toBeGreaterThan(0);
  });
});
