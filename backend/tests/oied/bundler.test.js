// Pure clustering-logic tests for the bundler. Persistence (DB upsert) is
// covered by the integration suite — here we check key derivation, theme
// builder, and the keyword-extraction tokenizer.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Opportunity: { findAll: jest.fn() },
  Bundle: {
    findAll: jest.fn(), findByPk: jest.fn(),
    upsert: jest.fn(), destroy: jest.fn(),
  },
}));

const {
  clusterKey,
  buildTheme,
  topKeywords,
  MIN_BUNDLE_SIZE,
} = require('../../src/oied/opportunityBundler.service');

describe('bundler.clusterKey', () => {
  it('uses ai_category + recommended_product when both present', () => {
    expect(clusterKey({
      aiAnalysis: { ai_category: 'IT Services', recommended_product: 'OpsBot' },
      category: 'whatever',
    })).toBe('IT Services|OpsBot');
  });
  it('falls back to plain category when no product', () => {
    expect(clusterKey({
      aiAnalysis: { ai_category: 'Compliance' },
      category: 'whatever',
    })).toBe('Compliance');
  });
  it('falls back to opp.category when AI analysis is empty', () => {
    expect(clusterKey({ category: 'Staffing' })).toBe('Staffing');
  });
  it('uses "Other" when nothing is set', () => {
    expect(clusterKey({})).toBe('Other');
  });
});

describe('bundler.topKeywords', () => {
  it('returns shared 4+ char tokens that appear in 2+ titles', () => {
    const opps = [
      { title: 'Roof Replacement at Frazier' },
      { title: 'Roof Replacement at Cedar Springs' },
      { title: 'Building maintenance' },
    ];
    const kws = topKeywords(opps);
    expect(kws).toContain('roof');
    expect(kws).toContain('replacement');
    expect(kws).not.toContain('frazier'); // appears only once
  });
  it('excludes stop words', () => {
    const opps = [
      { title: 'Compliance services contract' },
      { title: 'Compliance services proposal' },
    ];
    const kws = topKeywords(opps);
    expect(kws).toContain('compliance');
    expect(kws).not.toContain('services'); // stop word
    expect(kws).not.toContain('contract');
  });
  it('returns empty when no shared tokens', () => {
    expect(topKeywords([
      { title: 'Foo' }, { title: 'Bar' }, { title: 'Baz' },
    ])).toEqual([]);
  });
});

describe('bundler.buildTheme', () => {
  it('uses Category: Product when a product is present in the key', () => {
    expect(buildTheme('IT Services|OpsBot', [])).toBe('IT Services: OpsBot');
  });
  it('falls back to Category: keywords when no product', () => {
    const opps = [
      { title: 'Roof Replacement at Frazier' },
      { title: 'Roof Replacement at Cedar Springs' },
    ];
    expect(buildTheme('Construction', opps)).toContain('Construction:');
    expect(buildTheme('Construction', opps).toLowerCase()).toContain('roof');
  });
  it('returns just the category when no shared keywords', () => {
    expect(buildTheme('Other', [{ title: 'a' }, { title: 'b' }])).toBe('Other');
  });
});

describe('bundler.MIN_BUNDLE_SIZE', () => {
  it('is 3 — clusters with fewer rows are not persisted as bundles', () => {
    expect(MIN_BUNDLE_SIZE).toBe(3);
  });
});
