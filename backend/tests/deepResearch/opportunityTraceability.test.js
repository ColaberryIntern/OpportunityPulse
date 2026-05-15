// Deep Research Phase 7 — opportunityTraceability.service pure-logic tests.

const svc = require('../../src/deepResearch/opportunityTraceability.service');

describe('opportunityTraceability.VALID_KINDS', () => {
  it('exposes the supported insight kinds', () => {
    expect(svc.VALID_KINDS).toEqual(expect.arrayContaining([
      'venture', 'cluster', 'recommendation', 'intervention',
      'research_run', 'pursuit', 'pattern',
    ]));
  });
});

describe('opportunityTraceability.groupByChannel', () => {
  it('returns empty for empty input', () => {
    expect(svc.groupByChannel([])).toEqual({});
  });
  it('groups opportunities by type', () => {
    const out = svc.groupByChannel([
      { id: 1, type: 'gov_contract', title: 'a' },
      { id: 2, type: 'gov_contract', title: 'b' },
      { id: 3, type: 'bonfire', title: 'c' },
      { id: 4, title: 'd' },
    ]);
    expect(Object.keys(out).sort()).toEqual(['bonfire', 'gov_contract', 'unknown']);
    expect(out.gov_contract).toHaveLength(2);
    expect(out.unknown).toHaveLength(1);
  });
});
