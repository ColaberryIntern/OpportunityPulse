// Pure shape-mapping tests for bonfire_strategic → opportunities sync.
// Mirrors the pattern in sync.test.js. No DB calls.

jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireStrategicOpportunity: { findAll: jest.fn() },
  Opportunity: { upsert: jest.fn() },
}));

const {
  shapeStrategicForOpportunity,
  deriveBucket,
  STRATEGIC_PRIORITY_BOOST,
  STRATEGIC_PRIORITY_CAP,
} = require('../../src/bonfire/bonfireStrategicSync.service');

const baseStrategic = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'AI-augmented compliance for Texas school districts',
  summary: 'A cluster of 12 Texas K-12 RFPs all asking for compliance + reporting platforms. Synthesize into a productized offering.',
  patternType: 'cluster',
  sourceOpportunityIds: ['b1', 'b2', 'b3', 'b4', 'b5'],
  strategicScore: 75,
  money: { total_estimated_value: 4500000 }, // dollars
  roi: { projected: '3x', confidence: 'high' },
  aiSystem: { what_to_build: 'Multi-tenant compliance dashboard', stack: ['React', 'Node'] },
  businessViability: { tam: '$X', moat: 'Y' },
  runId: 'run-2026-05-06',
  generatedForDate: '2026-05-06',
  aiModel: 'gpt-4o-mini',
  status: 'new',
  createdAt: new Date(),
  toJSON() {
    const { toJSON, ...rest } = this;
    return rest;
  },
};

describe('strategicSync.shapeStrategicForOpportunity', () => {
  it('maps the canonical strategic fields to the unified opportunity shape', () => {
    const out = shapeStrategicForOpportunity(baseStrategic);
    expect(out.type).toBe('bonfire_strategic');
    expect(out.source).toBe('bonfire_strategic');
    expect(out.sourceId).toBe('bonfire-strategic:11111111-1111-1111-1111-111111111111');
    expect(out.title.startsWith('[Strategic] ')).toBe(true);
    expect(out.title).toContain('AI-augmented compliance');
    expect(out.description).toBe(baseStrategic.summary);
    expect(out.category).toBe('Strategic Cluster');
    expect(out.status).toBe('active');
    expect(out.value).toBe(4_500_000);
    expect(out.aiScore).toBe(75); // capped at 75 (strictly below act_now=80)
    expect(out.aiAnalysis.fit_score).toBe(75);
    expect(out.aiAnalysis.strategic_score).toBe(75);
    expect(out.aiAnalysis.source_opportunity_count).toBe(5);
    expect(out.sourceData.bonfire_strategic_opportunity_id).toBe(baseStrategic.id);
    expect(out.sourceData.run_id).toBe('run-2026-05-06');
  });

  it('returns null when id is missing', () => {
    expect(shapeStrategicForOpportunity({ ...baseStrategic, id: null, toJSON: undefined })).toBeNull();
    expect(shapeStrategicForOpportunity(null)).toBeNull();
  });

  it('priority cap is 75 (strictly below act_now=80, so strategic never crowds top slots)', () => {
    expect(STRATEGIC_PRIORITY_BOOST).toBe(0);
    expect(STRATEGIC_PRIORITY_CAP).toBe(75);
    // strategicScore 50 -> aiScore 50 (no boost, under cap)
    expect(shapeStrategicForOpportunity({ ...baseStrategic, strategicScore: 50, toJSON: undefined }).aiScore).toBe(50);
    // strategicScore 75 -> aiScore 75 (at cap)
    expect(shapeStrategicForOpportunity({ ...baseStrategic, strategicScore: 75, toJSON: undefined }).aiScore).toBe(75);
    // strategicScore 95 -> aiScore 75 (capped down, never reaches act_now)
    expect(shapeStrategicForOpportunity({ ...baseStrategic, strategicScore: 95, toJSON: undefined }).aiScore).toBe(75);
    // strategicScore 100 -> aiScore 75 (still capped)
    expect(shapeStrategicForOpportunity({ ...baseStrategic, strategicScore: 100, toJSON: undefined }).aiScore).toBe(75);
    // strategicScore 0 -> aiScore 0
    expect(shapeStrategicForOpportunity({ ...baseStrategic, strategicScore: 0, toJSON: undefined }).aiScore).toBe(0);
  });

  it('archived rows flip status=expired so they fall out of My Opportunities', () => {
    const archived = { ...baseStrategic, status: 'archived', toJSON: undefined };
    expect(shapeStrategicForOpportunity(archived).status).toBe('expired');
  });

  it('handles money as cents (total_estimated_value_cents) too', () => {
    const withCents = { ...baseStrategic, money: { total_estimated_value_cents: 1_000_000_00 }, toJSON: undefined };
    expect(shapeStrategicForOpportunity(withCents).value).toBe(1_000_000);
  });

  it('reads cluster_total_usd (the actual prod field) preferentially', () => {
    const prodShape = {
      ...baseStrategic,
      money: { cluster_total_usd: 2_650_000, initial_bid_value_usd: 300_000, addressable_market_usd: 1_500_000_000 },
      toJSON: undefined,
    };
    expect(shapeStrategicForOpportunity(prodShape).value).toBe(2_650_000);
  });

  it('falls back to initial_bid_value_usd when cluster_total_usd is missing', () => {
    const partial = {
      ...baseStrategic,
      money: { initial_bid_value_usd: 500_000, addressable_market_usd: 1_000_000_000 },
      toJSON: undefined,
    };
    expect(shapeStrategicForOpportunity(partial).value).toBe(500_000);
  });

  it('value=null when money has no recognizable amount', () => {
    const broken = { ...baseStrategic, money: { junk: true }, toJSON: undefined };
    expect(shapeStrategicForOpportunity(broken).value).toBeNull();
  });

  it('category labels reflect pattern_type', () => {
    expect(shapeStrategicForOpportunity({ ...baseStrategic, patternType: 'cluster', toJSON: undefined }).category)
      .toBe('Strategic Cluster');
    expect(shapeStrategicForOpportunity({ ...baseStrategic, patternType: 'theme', toJSON: undefined }).category)
      .toBe('Strategic Theme');
    expect(shapeStrategicForOpportunity({ ...baseStrategic, patternType: null, toJSON: undefined }).category)
      .toBe('Strategic Cluster');
  });

  it('location stays null (clusters span agencies, no single one to fake)', () => {
    expect(shapeStrategicForOpportunity(baseStrategic).location).toBeNull();
  });

  it('sourceData carries source_opportunity_ids for traceability', () => {
    const sd = shapeStrategicForOpportunity(baseStrategic).sourceData;
    expect(sd.source_opportunity_ids).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    expect(sd.pattern_type).toBe('cluster');
  });
});

describe('strategicSync.deriveBucket', () => {
  it('strategic_score >= 60 -> high_value (always visible in high_value strip)', () => {
    expect(deriveBucket(60)).toBe('high_value');
    expect(deriveBucket(75)).toBe('high_value');
    expect(deriveBucket(95)).toBe('high_value');
  });
  it('strategic_score < 60 -> standard (low-confidence clusters do not crowd high_value)', () => {
    expect(deriveBucket(59)).toBe('standard');
    expect(deriveBucket(0)).toBe('standard');
  });
  it('null/undefined -> standard', () => {
    expect(deriveBucket(null)).toBe('standard');
    expect(deriveBucket(undefined)).toBe('standard');
  });
});
