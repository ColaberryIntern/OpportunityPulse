// Pure shape-mapping tests for the bonfire → opportunities sync. No DB calls.

jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: { findAll: jest.fn() },
  Opportunity: { upsert: jest.fn() },
}));

const { shapeForOpportunity } = require('../../src/bonfire/bonfireSync.service');

const baseBonfire = {
  id: 'b1',
  externalId: 'bonfire:agency:dhantx:RFP-25-007',
  title: 'Title I Compliance Services',
  agency: 'DHA',
  description: 'Long description...',
  overview: 'Plain-English summary of the project',
  aiCategory: 'Compliance',
  fitScore: 70,
  priorityScore: 65,
  automationPotential: 60,
  repeatability: 50,
  easeOfEntry: 40,
  recommendedProduct: 'ComplianceBot',
  estimatedValue: 50000000, // cents = $500k
  signals: ['PRODUCTIZABLE'],
  closeDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  sourceUrl: 'https://dhantx.bonfirehub.com/opportunities/123',
  enrichedAt: new Date(),
  createdAt: new Date(),
};

describe('bonfireSync.shapeForOpportunity', () => {
  it('maps the canonical Bonfire fields to the unified opportunity shape', () => {
    const out = shapeForOpportunity(baseBonfire);
    expect(out.type).toBe('bonfire');
    expect(out.source).toBe('bonfire');
    expect(out.sourceId).toBe('bonfire:agency:dhantx:RFP-25-007');
    expect(out.title).toBe('Title I Compliance Services');
    expect(out.location).toBe('DHA');
    expect(out.category).toBe('Compliance');
    expect(out.value).toBe(500000);            // cents -> USD
    expect(out.aiScore).toBe(65);              // priority_score
    expect(out.aiAnalysis.signals).toEqual(['PRODUCTIZABLE']);
    expect(out.aiAnalysis.recommended_product).toBe('ComplianceBot');
    expect(out.expiresAt).toBeInstanceOf(Date);
    expect(out.sourceData.bonfire_opportunity_id).toBe('b1');
  });

  it('returns null when external_id is missing (sync requires a stable key)', () => {
    expect(shapeForOpportunity({ ...baseBonfire, externalId: null })).toBeNull();
  });

  it('uses overview as description when present, falls back to description', () => {
    expect(shapeForOpportunity(baseBonfire).description).toBe('Plain-English summary of the project');
    expect(shapeForOpportunity({ ...baseBonfire, overview: '' }).description).toBe('Long description...');
  });

  it("flips status to 'expired' when close date is in the past", () => {
    const past = { ...baseBonfire, closeDate: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    expect(shapeForOpportunity(past).status).toBe('expired');
  });

  it("keeps status 'active' when close date is in the future or missing", () => {
    expect(shapeForOpportunity(baseBonfire).status).toBe('active');
    expect(shapeForOpportunity({ ...baseBonfire, closeDate: null }).status).toBe('active');
  });

  it('handles missing estimated_value (no source-side value supplied)', () => {
    const out = shapeForOpportunity({ ...baseBonfire, estimatedValue: null });
    expect(out.value).toBeNull();
  });

  it('truncates extremely long titles to 500 chars (matches column constraint)', () => {
    const longTitle = 'x'.repeat(1000);
    const out = shapeForOpportunity({ ...baseBonfire, title: longTitle });
    expect(out.title.length).toBe(500);
  });
});
