// Deep Research Phase 6 — dependencyReview.service pure-logic tests.

const svc = require('../../src/deepResearch/dependencyReview.service');

describe('dependencyReview.statusForAction', () => {
  it('approve → confirmed', () => {
    expect(svc.statusForAction('approve')).toBe('confirmed');
  });
  it('reject → dismissed', () => {
    expect(svc.statusForAction('reject')).toBe('dismissed');
  });
  it('resolve → resolved', () => {
    expect(svc.statusForAction('resolve')).toBe('resolved');
  });
  it('annotate / assign_owner leave status unchanged', () => {
    expect(svc.statusForAction('annotate')).toBeNull();
    expect(svc.statusForAction('assign_owner')).toBeNull();
  });
});

describe('dependencyReview.VALID_ACTIONS', () => {
  it('declares the full action set', () => {
    expect(new Set(svc.VALID_ACTIONS)).toEqual(new Set([
      'approve', 'reject', 'annotate', 'assign_owner', 'resolve',
    ]));
  });
});
