// Deep Research Phase 7.5 — deepResearchContext.service pure-logic tests.

const svc = require('../../src/deepResearch/deepResearchContext.service');

describe('deepResearchContext.VALID_KINDS', () => {
  it('lists every supported context kind', () => {
    expect(svc.VALID_KINDS).toEqual(expect.arrayContaining([
      'deepResearch', 'cluster', 'pattern', 'venture',
      'recommendation', 'intervention', 'pursuit', 'researchRun',
      'agency', 'technology',
    ]));
  });
});

describe('deepResearchContext.pickContextFromQuery', () => {
  it('returns null for an empty query', () => {
    expect(svc.pickContextFromQuery({})).toBeNull();
  });
  it('maps deepResearchId → deepResearch', () => {
    expect(svc.pickContextFromQuery({ deepResearchId: '7' }))
      .toEqual({ kind: 'deepResearch', id: '7' });
  });
  it('maps clusterId → cluster', () => {
    expect(svc.pickContextFromQuery({ clusterId: '12' }))
      .toEqual({ kind: 'cluster', id: '12' });
  });
  it('maps strategicPatternId → pattern (and patternId is an alias)', () => {
    expect(svc.pickContextFromQuery({ strategicPatternId: '3' }))
      .toEqual({ kind: 'pattern', id: '3' });
    expect(svc.pickContextFromQuery({ patternId: '4' }))
      .toEqual({ kind: 'pattern', id: '4' });
  });
  it('maps agencyValue / technologyValue → recurring kinds', () => {
    expect(svc.pickContextFromQuery({ agencyValue: 'DOD' }))
      .toEqual({ kind: 'agency', id: 'DOD' });
    expect(svc.pickContextFromQuery({ technologyValue: 'rag' }))
      .toEqual({ kind: 'technology', id: 'rag' });
  });
  it('ignores empty-string values', () => {
    expect(svc.pickContextFromQuery({ clusterId: '' })).toBeNull();
  });
  it('takes the first matching param in declaration order', () => {
    expect(svc.pickContextFromQuery({ clusterId: '5', deepResearchId: '7' }))
      .toEqual({ kind: 'deepResearch', id: '7' });
  });
});
