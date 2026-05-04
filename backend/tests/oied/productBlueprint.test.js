// Bundle product blueprint — verifies hash cache, JSON parsing,
// strategy dependency, persistence.

jest.mock('../../src/models', () => {
  const mockBundle = {
    id: 1, theme: 'IT Services: OpsBot', key: 'IT Services|OpsBot',
    opportunityIds: [101, 102, 103], opportunityCount: 3,
    estimatedTotalValue: 750000,
    strategy: {
      what_to_build: 'OpsBot — automated triage',
      why_it_works: 'Three agencies share the pain.',
      revenue_potential_usd: 600000,
    },
    strategyHash: 'cached-strategy',
    blueprint: {}, blueprintHash: null,
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
        mvp_scope: 'Single-tenant deployment for one anchor agency by week 8.',
        features: [
          'Email-to-ticket auto-classification (95% accuracy)',
          'SLA breach prediction with 24h lookahead',
          'Slackbot for first-line responder triage',
          'Audit log export (CSV) for compliance review',
        ],
        required_agents: ['AI Pilot Lead', 'Data Engineer', 'Compliance Lead'],
        time_to_market_weeks: 12,
        monetization_strategy: 'SaaS, $5k/month per agency on annual contract.',
      }),
    })),
  };
  return { getAIClient: () => client, __client: client };
});

const {
  generateProductBlueprint,
  blueprintHashFor,
  safeParseBlueprint,
} = require('../../src/oied/opportunityBundler.service');
const models = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');

describe('bundler.blueprintHashFor', () => {
  it('is independent of strategy hash but stable per (theme, members)', () => {
    const bundle = { theme: 'X' };
    const a = blueprintHashFor(bundle, [{ id: 1 }, { id: 2 }]);
    const b = blueprintHashFor(bundle, [{ id: 2 }, { id: 1 }]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('bundler.safeParseBlueprint', () => {
  it('parses well-formed JSON + caps array sizes', () => {
    const out = safeParseBlueprint(JSON.stringify({
      mvp_scope: 'X',
      features: Array.from({ length: 20 }, (_, i) => 'f' + i),
      required_agents: ['A', 'B', 'C'],
      time_to_market_weeks: 12,
      monetization_strategy: 'SaaS',
    }));
    expect(out.features.length).toBe(10); // capped
    expect(out.required_agents).toEqual(['A', 'B', 'C']);
    expect(out.time_to_market_weeks).toBe(12);
  });
  it('returns null on invalid JSON', () => {
    expect(safeParseBlueprint('not json {')).toBeNull();
  });
});

describe('bundler.generateProductBlueprint', () => {
  beforeEach(() => {
    models.__mockBundle.blueprint = {};
    models.__mockBundle.blueprintHash = null;
    models.__mockBundle.strategy = {
      what_to_build: 'OpsBot — automated triage',
      revenue_potential_usd: 600000,
    };
    models.__mockBundle.save.mockClear();
    aiMod.__client.chat.mockClear();
  });

  it('first run hits AI + persists blueprint + hash', async () => {
    const out = await generateProductBlueprint(1);
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1);
    expect(out.cached).toBe(false);
    expect(out.blueprint.mvp_scope).toMatch(/anchor agency/);
    expect(out.blueprint.features.length).toBeGreaterThan(3);
    expect(out.blueprint.required_agents).toContain('AI Pilot Lead');
    expect(out.blueprint.time_to_market_weeks).toBe(12);
    expect(out.blueprintHash).toMatch(/^[0-9a-f]{64}$/);
    expect(models.__mockBundle.save).toHaveBeenCalled();
  });

  it('second run with same members hits cache (no AI call)', async () => {
    models.__mockBundle.blueprint = {
      mvp_scope: 'cached', features: ['a'], required_agents: ['B'],
      time_to_market_weeks: 8, monetization_strategy: 'cached',
    };
    models.__mockBundle.blueprintHash = blueprintHashFor(
      { theme: models.__mockBundle.theme },
      [{ id: 101 }, { id: 102 }, { id: 103 }],
    );
    const out = await generateProductBlueprint(1);
    expect(out.cached).toBe(true);
    expect(out.blueprint.mvp_scope).toBe('cached');
    expect(aiMod.__client.chat).not.toHaveBeenCalled();
  });

  it('force=true bypasses cache + re-calls AI', async () => {
    models.__mockBundle.blueprint = { mvp_scope: 'old' };
    models.__mockBundle.blueprintHash = blueprintHashFor(
      { theme: models.__mockBundle.theme },
      [{ id: 101 }, { id: 102 }, { id: 103 }],
    );
    const out = await generateProductBlueprint(1, { force: true });
    expect(out.cached).toBe(false);
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1);
  });

  it('throws when bundle has no strategy yet', async () => {
    models.__mockBundle.strategy = {};
    await expect(generateProductBlueprint(1))
      .rejects.toThrow(/no strategy yet/);
  });
});
