const {
  scoreAgency,
  defaultScoreFor,
  regionBonus,
  volumeTerm,
  fitTerm,
  SCORE_CONFIG,
} = require('../../../src/bonfire/scraper/agencyScoring');

describe('agencyScoring.regionBonus', () => {
  it('gives a TX bonus to Texas-flavored subdomains', () => {
    expect(regionBonus('dhantx')).toBeGreaterThanOrEqual(SCORE_CONFIG.txBonus);
    expect(regionBonus('austinisd')).toBeGreaterThanOrEqual(SCORE_CONFIG.txBonus);
    expect(regionBonus('utdallas')).toBeGreaterThanOrEqual(SCORE_CONFIG.txBonus);
    expect(regionBonus('txdot')).toBeGreaterThanOrEqual(SCORE_CONFIG.txBonus);
  });

  it('gives a smaller bump to adjacent states', () => {
    const tx = regionBonus('dallasisd');
    const adj = regionBonus('oklahoma-something');
    expect(adj).toBeGreaterThan(0);
    expect(adj).toBeLessThan(tx);
  });

  it('gives no region bonus to far-away agencies', () => {
    expect(regionBonus('detroit')).toBeLessThanOrEqual(SCORE_CONFIG.majorMetroBonus);
    expect(regionBonus('bahamas')).toBe(0);
  });

  it('school districts get a small extra bump', () => {
    expect(regionBonus('austinisd')).toBeGreaterThan(regionBonus('austin'));
  });
});

describe('agencyScoring.volumeTerm', () => {
  it('returns zero when no opps', () => {
    expect(volumeTerm(0)).toBe(0);
    expect(volumeTerm(null)).toBe(0);
  });

  it('grows but caps with volume', () => {
    expect(volumeTerm(1)).toBeGreaterThan(0);
    expect(volumeTerm(50)).toBeLessThanOrEqual(SCORE_CONFIG.volumeCap);
    expect(volumeTerm(500)).toBe(SCORE_CONFIG.volumeCap);
  });
});

describe('agencyScoring.fitTerm', () => {
  it('rewards high-fit count linearly up to cap', () => {
    expect(fitTerm(0)).toBe(0);
    expect(fitTerm(1)).toBe(SCORE_CONFIG.fitFactor);
    expect(fitTerm(100)).toBe(SCORE_CONFIG.fitCap);
  });
});

describe('agencyScoring.scoreAgency', () => {
  it('TX agency with strong volume + fit beats a never-seen far-away agency', () => {
    const tx = scoreAgency({
      subdomain: 'austinisd',
      openCount: 50,
      highFitCount: 5,
      blocked: false,
      priorBlocks: 0,
    });
    const distant = scoreAgency({
      subdomain: 'somewhere-faraway',
      openCount: 0,
      highFitCount: 0,
      blocked: false,
      priorBlocks: 0,
    });
    expect(tx).toBeGreaterThan(distant);
  });

  it('penalizes consecutive Cloudflare blocks', () => {
    const fresh = scoreAgency({
      subdomain: 'foo',
      openCount: 10,
      highFitCount: 1,
      blocked: false,
      priorBlocks: 0,
    });
    const burnt = scoreAgency({
      subdomain: 'foo',
      openCount: 10,
      highFitCount: 1,
      blocked: true,
      priorBlocks: 4, // 5th consecutive block
    });
    expect(fresh).toBeGreaterThan(burnt);
    expect(fresh - burnt).toBeGreaterThanOrEqual(SCORE_CONFIG.blockPenalty);
  });

  it('preserves prior volume when this run came up empty (avoids cratering on a single bad run)', () => {
    const noPrior = scoreAgency({
      subdomain: 'austinisd',
      openCount: 0,
      highFitCount: 0,
      blocked: false,
      priorBlocks: 0,
    });
    const withPrior = scoreAgency({
      subdomain: 'austinisd',
      openCount: 0,
      highFitCount: 0,
      blocked: false,
      priorBlocks: 0,
      priorAgency: { lastOpenCount: 100 },
    });
    expect(withPrior).toBeGreaterThan(noPrior);
  });

  it('produces values in [0, 100]', () => {
    expect(scoreAgency({
      subdomain: 'austinisd',
      openCount: 1000,
      highFitCount: 1000,
      blocked: false,
      priorBlocks: 0,
    })).toBeLessThanOrEqual(100);
    expect(scoreAgency({
      subdomain: 'totally-unknown',
      openCount: 0,
      highFitCount: 0,
      blocked: true,
      priorBlocks: 100,
    })).toBeGreaterThanOrEqual(0);
  });
});

describe('agencyScoring.defaultScoreFor', () => {
  it('TX > distant for never-seen agencies', () => {
    expect(defaultScoreFor('dhantx')).toBeGreaterThan(defaultScoreFor('detroit'));
  });
});
