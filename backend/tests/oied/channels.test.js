// Unit tests for the channel taxonomy. Pure-function only.

const {
  getChannelForOpp,
  getChannelKey,
  getChannelByKey,
  listChannels,
  whereForChannel,
  CHANNELS,
} = require('../../src/oied/channels.service');

describe('channels.getChannelForOpp', () => {
  it('bonfire (individual) → bonfire channel', () => {
    expect(getChannelKey({ type: 'bonfire', source: 'bonfire' })).toBe('bonfire');
  });
  it('bonfire_strategic → strategic channel', () => {
    expect(getChannelKey({ type: 'bonfire_strategic', source: 'bonfire_strategic' })).toBe('strategic');
  });
  it('gov_contract → government', () => {
    expect(getChannelKey({ type: 'gov_contract', source: 'sam_gov' })).toBe('government');
  });
  it('grant → government', () => {
    expect(getChannelKey({ type: 'grant', source: 'grants_gov' })).toBe('government');
  });
  it('ai_job → talent', () => {
    expect(getChannelKey({ type: 'ai_job', source: 'remote_ok' })).toBe('talent');
  });
  it('ai_news → private-sector', () => {
    expect(getChannelKey({ type: 'ai_news', source: 'devto' })).toBe('private-sector');
  });
  it('freelance → freelance', () => {
    expect(getChannelKey({ type: 'freelance', source: 'freelancer' })).toBe('freelance');
  });
  it('investment → capital', () => {
    expect(getChannelKey({ type: 'investment', source: 'funding_news' })).toBe('capital');
  });
  it('unknown type → unknown channel', () => {
    expect(getChannelKey({ type: 'martian_signal', source: 'mars' })).toBe('unknown');
  });
  it('null/empty input → unknown channel', () => {
    expect(getChannelKey(null)).toBe('unknown');
    expect(getChannelKey({})).toBe('unknown');
  });
  it('returns full descriptor with label + icon + color', () => {
    const ch = getChannelForOpp({ type: 'bonfire' });
    expect(ch.key).toBe('bonfire');
    expect(ch.label).toBe('Bonfire');
    expect(ch.icon).toBeTruthy();
    expect(ch.color).toBeTruthy();
  });
});

describe('channels.getChannelByKey', () => {
  it('finds by key', () => {
    expect(getChannelByKey('government').label).toBe('Government');
    expect(getChannelByKey('strategic').label).toBe('Strategic Patterns');
  });
  it('falls back to unknown for invalid key', () => {
    expect(getChannelByKey('nonexistent').key).toBe('unknown');
    expect(getChannelByKey(null).key).toBe('unknown');
  });
  it('case-insensitive match', () => {
    expect(getChannelByKey('GOVERNMENT').key).toBe('government');
  });
});

describe('channels.listChannels', () => {
  it('returns all 7 channels in canonical order', () => {
    const list = listChannels();
    expect(list).toHaveLength(7);
    expect(list.map((c) => c.key)).toEqual([
      'strategic', 'bonfire', 'government', 'talent', 'private-sector', 'freelance', 'capital',
    ]);
  });
  it('returns a copy (mutation-safe)', () => {
    const list = listChannels();
    list.push({ key: 'mutation', label: 'mutation' });
    expect(listChannels()).toHaveLength(7);
  });
});

describe('channels.whereForChannel', () => {
  it('returns {types, sources} for a known channel', () => {
    expect(whereForChannel('government')).toEqual({
      types: ['gov_contract', 'grant'],
      sources: ['sam_gov', 'usa_spending', 'grants_gov'],
    });
  });
  it('returns null for unknown / empty', () => {
    expect(whereForChannel(null)).toBeNull();
    expect(whereForChannel('nonexistent')).toBeNull();
  });
});

describe('channels coverage — every prod source maps to a known channel', () => {
  // Sources actually present in prod (from `SELECT DISTINCT source FROM
  // opportunities WHERE status='active'`). Updated when a new ingester
  // ships. Asserts no source silently falls through to "unknown".
  const PROD_SOURCES = [
    ['gov_contract', 'sam_gov'],
    ['gov_contract', 'usa_spending'],
    ['grant', 'grants_gov'],
    ['bonfire', 'bonfire'],
    ['bonfire_strategic', 'bonfire_strategic'],
    ['ai_job', 'usajobs'],
    ['ai_job', 'remote_ok'],
    ['ai_job', 'adzuna'],
    ['ai_job', 'jobicy'],
    ['ai_job', 'remotive'],
    ['ai_job', 'himalayas'],
    ['ai_job', 'mock_jobs'],
    ['ai_news', 'devto'],
    ['ai_news', 'google_news'],
    ['ai_news', 'hacker_news'],
    ['freelance', 'freelancer'],
    ['investment', 'funding_news'],
    ['investment', 'mock_investments'],
  ];
  it.each(PROD_SOURCES)('(%s, %s) maps to a known channel', (type, source) => {
    const key = getChannelKey({ type, source });
    expect(key).not.toBe('unknown');
    expect(CHANNELS.find((c) => c.key === key)).toBeTruthy();
  });
});
