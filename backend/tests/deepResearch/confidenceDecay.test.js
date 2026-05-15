// Deep Research Phase 4 — confidenceDecay.service tests.

const svc = require('../../src/deepResearch/confidenceDecay.service');

const DAY = 86400000;

describe('confidenceDecay.computeDecay', () => {
  it('no decay within the grace window', () => {
    const now = Date.now();
    const out = svc.computeDecay({
      initialConfidence: 0.8,
      lastAssessmentAt: new Date(now - 10 * DAY),
      lastLifecycleChangeAt: new Date(now - 5 * DAY),
      lifecycleState: 'evaluating',
      decision: 'BUILD_NOW',
      now,
    });
    expect(out.factors.age_decay).toBe(0);
    expect(out.confidence).toBe(0.8);
  });

  it('decays linearly after the grace window', () => {
    const now = Date.now();
    const out = svc.computeDecay({
      initialConfidence: 0.9,
      lastAssessmentAt: new Date(now - 60 * DAY),
      lastLifecycleChangeAt: new Date(now - 60 * DAY),
      lifecycleState: 'evaluating',
      decision: 'MONITOR',
      now,
    });
    expect(out.factors.age_decay).toBeGreaterThan(0);
    expect(out.confidence).toBeLessThan(0.9);
  });

  it('adds stuck decay when a venture sits in a stuck-prone state', () => {
    const now = Date.now();
    const out = svc.computeDecay({
      initialConfidence: 0.7,
      lastAssessmentAt: new Date(now - 10 * DAY),
      lastLifecycleChangeAt: new Date(now - 60 * DAY),
      lifecycleState: 'approved',
      decision: 'BUILD_NOW',
      now,
    });
    expect(out.factors.stuck_decay).toBeGreaterThan(0);
  });

  it('floors confidence at 0', () => {
    const now = Date.now();
    const out = svc.computeDecay({
      initialConfidence: 0.2,
      lastAssessmentAt: new Date(now - 365 * DAY),
      lastLifecycleChangeAt: new Date(now - 365 * DAY),
      lifecycleState: 'planning_mvp',
      decision: 'BUILD_NOW',
      now,
    });
    expect(out.confidence).toBe(0);
  });
});

describe('confidenceDecay.deriveRecommendation', () => {
  it('recommends ACCELERATE for a stale BUILD_NOW', () => {
    const r = svc.deriveRecommendation({
      confidence: 0.5,
      factors: { total_decay: 0.25, age_days: 50, stuck_days: 10 },
      lifecycleState: 'approved', decision: 'BUILD_NOW',
    });
    expect(r.type).toBe('accelerate');
  });
  it('recommends REASSESS for high decay without BUILD_NOW pressure', () => {
    const r = svc.deriveRecommendation({
      confidence: 0.5,
      factors: { total_decay: 0.25, age_days: 50, stuck_days: 5 },
      lifecycleState: 'evaluating', decision: 'MONITOR',
    });
    expect(r.type).toBe('reassess');
  });
  it('recommends REPRIORITIZE when stuck for too long', () => {
    const r = svc.deriveRecommendation({
      confidence: 0.7,
      factors: { total_decay: 0.05, age_days: 10, stuck_days: 50 },
      lifecycleState: 'evaluating', decision: 'BUILD_SOON',
    });
    expect(r.type).toBe('reprioritize');
  });
  it('returns null when no recommendation is warranted', () => {
    const r = svc.deriveRecommendation({
      confidence: 0.8,
      factors: { total_decay: 0.05, age_days: 5, stuck_days: 5 },
      lifecycleState: 'evaluating', decision: 'BUILD_NOW',
    });
    expect(r).toBeNull();
  });
});
