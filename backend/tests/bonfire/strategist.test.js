// Mock the models before requiring the service so its top-level require()
// resolves to a stub instead of opening a real DB connection.
jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: { findAll: jest.fn() },
  BonfireStrategicOpportunity: {
    bulkCreate: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
  },
}));
jest.mock('../../src/analysis/ai.client', () => ({
  getAIClient: () => ({ chat: jest.fn() }),
}));

const strategist = require('../../src/bonfire/bonfireStrategist.service');

describe('strategist.clusterCandidates', () => {
  it('routes high-priority opps to standalones, leaves rest to clustering', () => {
    const opps = [
      { id: '1', priorityScore: 85, estimatedValue: 50_000_000, aiCategory: 'IT Services' },
      { id: '2', priorityScore: 60, estimatedValue: 60_000_000, aiCategory: 'Consulting' },
      { id: '3', priorityScore: 60, estimatedValue: 60_000_000, aiCategory: 'Consulting' },
      { id: '4', priorityScore: 60, estimatedValue: 60_000_000, aiCategory: 'Consulting' },
    ];
    const { standalones, clusters } = strategist.clusterCandidates(opps);
    expect(standalones.map((s) => s.id)).toEqual(['1']);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].opps).toHaveLength(3);
  });

  it('promotes solo opps with >= $1M to standalone even if priority is below 80', () => {
    const opps = [
      { id: 'big', priorityScore: 50, estimatedValue: 200_000_000, aiCategory: 'Staffing' },
    ];
    const { standalones } = strategist.clusterCandidates(opps);
    expect(standalones.map((s) => s.id)).toEqual(['big']);
  });

  it('drops sub-cluster-min groups (no synthesis if cluster has < 3 opps)', () => {
    const opps = [
      { id: 'a', priorityScore: 60, estimatedValue: 30_000_000, aiCategory: 'Education' },
      { id: 'b', priorityScore: 60, estimatedValue: 30_000_000, aiCategory: 'Education' },
    ];
    const { standalones, clusters } = strategist.clusterCandidates(opps);
    expect(standalones).toEqual([]);
    expect(clusters).toEqual([]);
  });
});

describe('strategist.isValidStrategicShape', () => {
  const validBase = {
    title: 'AI-Driven Construction RFP Triage',
    summary: 'A productized review/triage tool...',
    money: {
      initial_bid_value_usd: 750000,
      cluster_total_usd: 0,
      addressable_market_usd: 50000000,
      confidence: 'medium',
    },
    roi: {
      investment_usd: 250000,
      payback_months: 9,
      margin_pct: 35,
      confidence: 'medium',
    },
    ai_system: {
      what_to_build: 'A system that ingests RFPs and...',
      capabilities: ['ingest', 'classify', 'flag-fit'],
      operator_role: '1 ops analyst',
      build_effort_weeks: 8,
    },
    business_viability: {
      primary_buyer: 'Texas housing authorities',
      secondary_markets: ['school districts', 'municipal HR'],
      pricing_model: 'subscription',
      gtm_strategy: 'direct sales to CPOs',
      moat: 'data + integrations',
    },
  };

  it('accepts a complete shape', () => {
    expect(strategist.isValidStrategicShape(validBase)).toBe(true);
  });

  it('rejects when reject:true', () => {
    expect(strategist.isValidStrategicShape({ reject: true, reason: 'unclear' })).toBe(false);
  });

  it('rejects when any pillar is missing', () => {
    for (const key of ['money', 'roi', 'ai_system', 'business_viability']) {
      const copy = JSON.parse(JSON.stringify(validBase));
      delete copy[key];
      expect(strategist.isValidStrategicShape(copy)).toBe(false);
    }
  });

  it('rejects when both money values are zero', () => {
    const copy = JSON.parse(JSON.stringify(validBase));
    copy.money.initial_bid_value_usd = 0;
    copy.money.cluster_total_usd = 0;
    expect(strategist.isValidStrategicShape(copy)).toBe(false);
  });

  it('rejects when ROI investment or payback is missing', () => {
    const noInv = JSON.parse(JSON.stringify(validBase));
    noInv.roi.investment_usd = 0;
    expect(strategist.isValidStrategicShape(noInv)).toBe(false);

    const noPay = JSON.parse(JSON.stringify(validBase));
    noPay.roi.payback_months = 0;
    expect(strategist.isValidStrategicShape(noPay)).toBe(false);
  });

  it('rejects when ai_system has no capabilities or what_to_build', () => {
    const noCaps = JSON.parse(JSON.stringify(validBase));
    noCaps.ai_system.capabilities = [];
    expect(strategist.isValidStrategicShape(noCaps)).toBe(false);

    const noWhat = JSON.parse(JSON.stringify(validBase));
    noWhat.ai_system.what_to_build = '';
    expect(strategist.isValidStrategicShape(noWhat)).toBe(false);
  });

  it('rejects when business_viability has no secondary markets', () => {
    const noSec = JSON.parse(JSON.stringify(validBase));
    noSec.business_viability.secondary_markets = [];
    expect(strategist.isValidStrategicShape(noSec)).toBe(false);
  });

  it('rejects when business_viability has no primary buyer', () => {
    const noBuyer = JSON.parse(JSON.stringify(validBase));
    noBuyer.business_viability.primary_buyer = '';
    expect(strategist.isValidStrategicShape(noBuyer)).toBe(false);
  });
});
