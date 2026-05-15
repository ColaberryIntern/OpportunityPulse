// Deep Research Phase 7 — pursuitWorkspace.service pure-logic tests.

const svc = require('../../src/deepResearch/pursuitWorkspace.service');

describe('pursuitWorkspace.summarizeReadiness', () => {
  it('handles empty input', () => {
    expect(svc.summarizeReadiness([])).toEqual({ count: 0, with_score: 0, mean_score: null });
  });
  it('averages AI scores across the scored subset', () => {
    const out = svc.summarizeReadiness([
      { aiScore: 80 }, { aiScore: 60 }, { aiScore: null },
    ]);
    expect(out.count).toBe(3);
    expect(out.with_score).toBe(2);
    expect(out.mean_score).toBe(70);
  });
});

describe('pursuitWorkspace.recommendStaffing', () => {
  it('falls back to "no opportunities" when empty', () => {
    const s = svc.recommendStaffing([]);
    expect(s.lead).toBeNull();
    expect(s.note).toMatch(/No opportunities/);
  });
  it('keeps small pursuits lean', () => {
    const s = svc.recommendStaffing([{ id: 1 }, { id: 2 }]);
    expect(s.lead).toBe('tech lead');
    expect(s.support).toEqual(['full-stack engineer']);
  });
  it('scales the crew with the opportunity count', () => {
    const small = svc.recommendStaffing([{ id: 1 }]);
    const big = svc.recommendStaffing(Array.from({ length: 10 }, (_, i) => ({ id: i })));
    expect(big.support.length).toBeGreaterThan(small.support.length);
  });
});

describe('pursuitWorkspace VALID_*', () => {
  it('exposes valid anchor + status enums', () => {
    expect(svc.VALID_ANCHORS).toEqual(expect.arrayContaining(['venture', 'cluster', 'pattern', 'opportunity']));
    expect(svc.VALID_STATUSES).toEqual(expect.arrayContaining(['open', 'in_progress', 'submitted', 'won', 'lost', 'archived']));
  });
});
