// Deep Research Phase 15 — pure-logic unit tests.

const qualityAutomation = require('../../src/deepResearch/qualityAutomation.service');
const qualityAlert = require('../../src/deepResearch/qualityAlert.service');
const qualityTrend = require('../../src/deepResearch/qualityTrend.service');
const qaWorkflow = require('../../src/deepResearch/qaWorkflow.service');

describe('Phase 15 — qualityAutomation', () => {
  test('VALID_TRIGGERS covers the declared trigger taxonomy', () => {
    expect(qualityAutomation.VALID_TRIGGERS).toEqual(expect.arrayContaining([
      'on_output_create', 'on_pursuit_draft', 'on_review_handoff',
      'manual', 'scheduled', 'backfill',
    ]));
  });
  test('runForOutput rejects invalid trigger', async () => {
    await expect(qualityAutomation.runForOutput(1, { trigger: 'not_real' }))
      .rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
  test('exports the worker-handler surface', () => {
    expect(typeof qualityAutomation.runWorkerJob).toBe('function');
    expect(typeof qualityAutomation.enqueueForOutput).toBe('function');
  });
});

describe('Phase 15 — qualityAlert', () => {
  test('VALID_ALERT_KINDS covers all 8 declared kinds', () => {
    expect(qualityAlert.VALID_ALERT_KINDS).toEqual([
      'low_groundedness', 'contradictions_detected', 'low_coherence',
      'low_alignment', 'low_quality', 'missing_provenance',
      'weak_citation_coverage', 'stale_quality',
    ]);
  });
  test('THRESHOLDS exposes positive numbers for the 6 threshold dimensions', () => {
    for (const k of ['groundedness_below', 'coherence_below', 'alignment_below',
      'quality_below', 'citation_coverage_below', 'stale_after_days']) {
      expect(typeof qualityAlert.THRESHOLDS[k]).toBe('number');
      expect(qualityAlert.THRESHOLDS[k]).toBeGreaterThan(0);
    }
  });
  test('severityFor scales inversely with value for low_* kinds', () => {
    const a = qualityAlert.severityFor('low_quality', 90);
    const b = qualityAlert.severityFor('low_quality', 10);
    expect(b).toBeGreaterThan(a);
  });
  test('severityFor for contradictions scales with count', () => {
    const a = qualityAlert.severityFor('contradictions_detected', 1);
    const b = qualityAlert.severityFor('contradictions_detected', 5);
    expect(b).toBeGreaterThan(a);
  });
  test('summaryFor + recommendationFor return non-empty strings for every kind', () => {
    for (const k of qualityAlert.VALID_ALERT_KINDS) {
      const sum = qualityAlert.summaryFor(k, 50, 42);
      const rec = qualityAlert.recommendationFor(k);
      expect(typeof sum).toBe('string');
      expect(typeof rec).toBe('string');
      expect(sum.length).toBeGreaterThan(0);
      expect(rec.length).toBeGreaterThan(0);
    }
  });
  test('emit soft-fails on missing required fields', async () => {
    const a = await qualityAlert.emit({});
    expect(a).toBeNull();
    const b = await qualityAlert.emit({ alertKind: 'low_quality' });
    expect(b).toBeNull();
  });
});

describe('Phase 15 — qualityTrend', () => {
  test('DEFAULT_WINDOW_DAYS + thresholds are sane', () => {
    expect(qualityTrend.DEFAULT_WINDOW_DAYS).toBeGreaterThan(0);
    expect(qualityTrend.DEGRADATION_DROP).toBeLessThan(0);
    expect(qualityTrend.IMPROVEMENT_RISE).toBeGreaterThan(0);
  });
  test('classifyDirection maps delta to direction', () => {
    expect(qualityTrend.classifyDirection(-15)).toBe('declining');
    expect(qualityTrend.classifyDirection(15)).toBe('improving');
    expect(qualityTrend.classifyDirection(0)).toBe('flat');
    expect(qualityTrend.classifyDirection(3)).toBe('flat');
  });
});

describe('Phase 15 — qaWorkflow', () => {
  test('VALID_KINDS covers the declared workflow taxonomy', () => {
    expect(qaWorkflow.VALID_KINDS).toEqual([
      'quality_review', 'groundedness_remediation', 'coherence_review',
      'alignment_review', 'contradictions_resolution', 'provenance_backfill',
    ]);
  });
  test('VALID_STATUSES covers the full state machine', () => {
    expect(qaWorkflow.VALID_STATUSES).toEqual(expect.arrayContaining([
      'open', 'acknowledged', 'in_progress',
      'completed', 'rejected', 'overridden', 'cancelled', 'escalated',
    ]));
  });
  test('severityForAlertKind ranks contradictions highest', () => {
    expect(qaWorkflow.severityForAlertKind('contradictions_detected'))
      .toBeGreaterThan(qaWorkflow.severityForAlertKind('stale_quality'));
    expect(qaWorkflow.severityForAlertKind('low_groundedness'))
      .toBeGreaterThan(qaWorkflow.severityForAlertKind('missing_provenance'));
  });
  test('createWorkflow rejects unknown workflow_kind', async () => {
    await expect(qaWorkflow.createWorkflow({ workflowKind: 'not_real', subjectId: '1' }))
      .rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
  test('transition rejects unknown status', async () => {
    await expect(qaWorkflow.transition(999999, { status: 'not_real' }))
      .rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
});
