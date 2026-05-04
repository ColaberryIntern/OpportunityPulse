// Bundle strategy generation — verifies hash-based caching, JSON parsing,
// and persistence of the strategy fields.

jest.mock('../../src/models', () => {
  const mockBundle = {
    id: 1, theme: 'IT Services: OpsBot', key: 'IT Services|OpsBot',
    opportunityIds: [101, 102, 103], opportunityCount: 3,
    estimatedTotalValue: 750000,
    summary: '...', strategy: {}, strategyHash: null,
    suggestedSolution: null, estimatedBuildTimeDays: null,
    save: jest.fn(async function save() { return this; }),
  };
  return {
    sequelize: {},
    Opportunity: {
      findAll: jest.fn(async () => ([
        { id: 101, title: 'A', category: 'IT Services', value: 250000 },
        { id: 102, title: 'B', category: 'IT Services', value: 250000 },
        { id: 103, title: 'C', category: 'IT Services', value: 250000 },
      ])),
    },
    Bundle: {
      findByPk: jest.fn(async () => mockBundle),
      findAll: jest.fn(),
      upsert: jest.fn(),
      destroy: jest.fn(),
    },
    __mockBundle: mockBundle,
  };
});

jest.mock('../../src/analysis/ai.client', () => {
  const client = {
    chat: jest.fn(async () => ({
      content: JSON.stringify({
        what_to_build: 'OpsBot — automated IT incident triage',
        why_it_works: 'Three agencies share the same ticket-triage pain.',
        opportunities_unlocked: 3,
        revenue_potential_usd: 600000,
        build_time_days: 30,
        suggested_solution: 'OpsBot for Public Sector IT',
      }),
    })),
  };
  return { getAIClient: () => client, __client: client };
});

const {
  generateBundleStrategy,
  strategyHashFor,
  safeParseStrategy,
} = require('../../src/oied/opportunityBundler.service');
const models = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');

describe('bundler.strategyHashFor', () => {
  it('is stable for the same theme + member ids', () => {
    const bundle = { theme: 'X', key: 'X' };
    const members = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const h1 = strategyHashFor(bundle, members);
    const h2 = strategyHashFor(bundle, [...members].reverse());
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes when a member is added', () => {
    const bundle = { theme: 'X' };
    const h1 = strategyHashFor(bundle, [{ id: 1 }, { id: 2 }]);
    const h2 = strategyHashFor(bundle, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(h1).not.toBe(h2);
  });
});

describe('bundler.safeParseStrategy', () => {
  it('parses a well-formed JSON string', () => {
    const out = safeParseStrategy(JSON.stringify({
      what_to_build: 'X', why_it_works: 'Y',
      opportunities_unlocked: 5, revenue_potential_usd: 100000,
      build_time_days: 14, suggested_solution: 'XSuite',
    }));
    expect(out.what_to_build).toBe('X');
    expect(out.opportunities_unlocked).toBe(5);
  });
  it('returns null on invalid JSON', () => {
    expect(safeParseStrategy('not json {')).toBeNull();
  });
  it('coerces missing numerics to 0', () => {
    const out = safeParseStrategy({ what_to_build: 'X' });
    expect(out.opportunities_unlocked).toBe(0);
    expect(out.revenue_potential_usd).toBe(0);
  });
});

describe('bundler.generateBundleStrategy', () => {
  beforeEach(() => {
    models.__mockBundle.strategy = {};
    models.__mockBundle.strategyHash = null;
    models.__mockBundle.save.mockClear();
    aiMod.__client.chat.mockClear();
  });

  it('first run hits AI + persists strategy + hash', async () => {
    const out = await generateBundleStrategy(1);
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1);
    expect(out.cached).toBe(false);
    expect(out.strategy.what_to_build).toMatch(/OpsBot/);
    expect(out.suggestedSolution).toBe('OpsBot for Public Sector IT');
    expect(out.estimatedBuildTimeDays).toBe(30);
    expect(out.strategyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(models.__mockBundle.save).toHaveBeenCalled();
  });

  it('second run with same members hits cache (no AI call)', async () => {
    // Seed the bundle with a prior result.
    models.__mockBundle.strategy = {
      what_to_build: 'OpsBot — cached',
      why_it_works: 'cached',
      opportunities_unlocked: 3,
      revenue_potential_usd: 600000,
      build_time_days: 30,
      suggested_solution: 'OpsBot',
    };
    // Compute the hash that the seeded members produce so the cache hits.
    const expectedHash = strategyHashFor(
      { theme: models.__mockBundle.theme },
      [{ id: 101 }, { id: 102 }, { id: 103 }],
    );
    models.__mockBundle.strategyHash = expectedHash;

    const out = await generateBundleStrategy(1);
    expect(out.cached).toBe(true);
    expect(out.strategy.what_to_build).toBe('OpsBot — cached');
    expect(aiMod.__client.chat).not.toHaveBeenCalled();
  });

  it('force=true bypasses cache and re-calls AI', async () => {
    models.__mockBundle.strategy = { what_to_build: 'old' };
    models.__mockBundle.strategyHash = strategyHashFor(
      { theme: models.__mockBundle.theme },
      [{ id: 101 }, { id: 102 }, { id: 103 }],
    );
    const out = await generateBundleStrategy(1, { force: true });
    expect(out.cached).toBe(false);
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1);
  });
});
