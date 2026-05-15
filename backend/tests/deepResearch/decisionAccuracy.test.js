// Deep Research Phase 5 — decisionAccuracy.service tests.

const svc = require('../../src/deepResearch/decisionAccuracy.service');

describe('decisionAccuracy.classifyOutcome', () => {
  it('classifies progressed when the venture advanced past its start state', () => {
    const events = [{ fromState: 'discovered', toState: 'researching', createdAt: new Date() }];
    const out = svc.classifyOutcome('BUILD_NOW', { lifecycleState: 'researching' }, events);
    expect(out).toBe('progressed');
  });
  it('classifies reversed when the venture went backward', () => {
    const events = [
      { fromState: 'discovered', toState: 'researching', createdAt: new Date(Date.now() - 86400000) },
      { fromState: 'researching', toState: 'discovered', createdAt: new Date() },
    ];
    const out = svc.classifyOutcome('BUILD_NOW', { lifecycleState: 'discovered' }, events);
    expect(out).toBe('reversed');
  });
  it('classifies reversed when archived', () => {
    const events = [{ fromState: 'evaluating', toState: 'archived', createdAt: new Date() }];
    const out = svc.classifyOutcome('BUILD_NOW', { lifecycleState: 'archived' }, events);
    expect(out).toBe('reversed');
  });
  it('classifies stalled when no events + same state', () => {
    const out = svc.classifyOutcome('BUILD_NOW', { lifecycleState: 'evaluating' }, []);
    expect(out).toBe('stalled');
  });
});

describe('decisionAccuracy.decisionWasCorrect', () => {
  it('BUILD_NOW is correct when progressed', () => {
    expect(svc.decisionWasCorrect('BUILD_NOW', 'progressed')).toBe(true);
    expect(svc.decisionWasCorrect('BUILD_NOW', 'stalled')).toBe(false);
  });
  it('MONITOR is correct when NOT progressed', () => {
    expect(svc.decisionWasCorrect('MONITOR', 'stalled')).toBe(true);
    expect(svc.decisionWasCorrect('MONITOR', 'progressed')).toBe(false);
  });
  it('HIGH_RISK is correct when stalled or reversed', () => {
    expect(svc.decisionWasCorrect('HIGH_RISK', 'reversed')).toBe(true);
    expect(svc.decisionWasCorrect('HIGH_RISK', 'progressed')).toBe(false);
  });
  it('returns null for unknown decisions', () => {
    expect(svc.decisionWasCorrect('NOT_A_DECISION', 'progressed')).toBeNull();
  });
});

describe('decisionAccuracy.computeForDecision', () => {
  it('rolls samples up into counts + accuracy', () => {
    const samples = [
      { outcome: 'progressed' }, { outcome: 'progressed' },
      { outcome: 'stalled' }, { outcome: 'reversed' },
    ];
    const result = svc.computeForDecision('BUILD_NOW', samples);
    expect(result.total_count).toBe(4);
    expect(result.progressed_count).toBe(2);
    expect(result.reversed_count).toBe(1);
    expect(result.accuracy).toBe(0.5); // 2 of 4 progressed (BUILD_NOW = progressed-correct)
  });
  it('reports null accuracy on an empty sample set', () => {
    expect(svc.computeForDecision('BUILD_NOW', []).accuracy).toBeNull();
  });
});
