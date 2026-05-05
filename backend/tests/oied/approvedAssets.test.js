// v8 Approved Assets — derives services / case studies / banned terms.

jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
  getOrDefaultByOrg: jest.fn(async () => ({
    organizationId: 1,
    services: ['ai-systems', 'data-analytics', 'staffing', 'compliance'],
    industries: ['IT Services'],
    tools: ['Snowflake', 'OpenAI'],
    pastWins: ['DHA compliance audit', 'Austin data analytics platform'],
  })),
}));

const assets = require('../../src/oied/approvedAssets.service');

describe('approvedAssets.SERVICE_DISPLAY mapping', () => {
  it('maps lowercase service tokens to display names', () => {
    expect(assets.SERVICE_DISPLAY['ai-systems']).toBe('AI Systems');
    expect(assets.SERVICE_DISPLAY['staffing']).toBe('AI-Augmented Staffing');
  });
  it('displayServices preserves order + dedupes', () => {
    const out = assets.displayServices(['ai-systems', 'data-analytics', 'ai-systems']);
    expect(out).toEqual(['AI Systems', 'Data Analytics']);
  });
});

describe('approvedAssets.BANNED_TERMS', () => {
  it('includes StaffMatch (the v8 spec example)', () => {
    expect(assets.BANNED_TERMS).toContain('StaffMatch');
  });
  it('includes generic-AI buzzwords v3 banned', () => {
    expect(assets.BANNED_TERMS).toContain('leverage cutting-edge AI');
    expect(assets.BANNED_TERMS).toContain('synergy');
  });
});

describe('approvedAssets.findBannedTerms', () => {
  it('case-insensitive scan returns hits', () => {
    // Use the exact phrasings from BANNED_TERMS (substring scan).
    const hits = assets.findBannedTerms('Our STAFFMATCH platform helps you LEVERAGE CUTTING-EDGE AI to drive synergy.');
    expect(hits).toEqual(expect.arrayContaining(['StaffMatch', 'leverage cutting-edge AI', 'synergy']));
  });
  it('returns empty array when content is clean', () => {
    expect(assets.findBannedTerms('Concrete Colaberry data analytics solution for the Department of X.')).toEqual([]);
  });
  it('handles null content defensively', () => {
    expect(assets.findBannedTerms(null)).toEqual([]);
    expect(assets.findBannedTerms('')).toEqual([]);
  });
});

describe('approvedAssets.getApprovedAssets', () => {
  it('returns services as display names + case_studies from profile.pastWins + banned_terms', async () => {
    const out = await assets.getApprovedAssets({ organizationId: 1 });
    expect(out.services).toContain('AI Systems');
    expect(out.services).toContain('AI-Augmented Staffing');
    expect(out.case_studies).toContain('DHA compliance audit');
    expect(out.banned_terms).toContain('StaffMatch');
    expect(out.allowed_terms).toEqual(expect.arrayContaining(['AI Systems', 'Snowflake']));
  });
  it('falls back to empty values when the profile load fails', async () => {
    const profileSvc = require('../../src/oied/profile.service');
    profileSvc.getOrDefaultByOrg.mockRejectedValueOnce(new Error('db down'));
    const out = await assets.getApprovedAssets({ organizationId: 1 });
    expect(out.services).toEqual([]);
    expect(out.banned_terms).toContain('StaffMatch'); // hardcoded list still surfaces
  });
});
