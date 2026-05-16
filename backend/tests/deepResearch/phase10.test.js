// Deep Research Phase 10 unit tests — pure-logic only, no DB.
//
// Covers the deterministic helpers exposed by every Phase 10 service so a
// regression in classification, severity, deduping, or sanitization is
// caught locally before the full Jest suite runs.

const captureWorker = require('../../src/deepResearch/captureWorker.service');
const storage = require('../../src/deepResearch/storage.service');
const slaIntelligence = require('../../src/deepResearch/slaIntelligence.service');
const artifactLifecycle = require('../../src/deepResearch/artifactLifecycle.service');
const queueObservability = require('../../src/deepResearch/queueObservability.service');
const complianceMatrixLlm = require('../../src/deepResearch/complianceMatrixLlm.service');
const proposalExecutionQueue = require('../../src/deepResearch/proposalExecutionQueue.service');
const durableDraftGeneration = require('../../src/deepResearch/durableDraftGeneration.service');

describe('Phase 10 — captureWorker', () => {
  test('classifyFailureKind buckets error messages correctly', () => {
    expect(captureWorker.classifyFailureKind(new Error('Connection timeout'))).toBe('timeout');
    expect(captureWorker.classifyFailureKind(new Error('Pursuit 42 not found'))).toBe('permanent');
    expect(captureWorker.classifyFailureKind(new Error('Invalid output_type: foo'))).toBe('permanent');
    expect(captureWorker.classifyFailureKind(new Error('Missing config: API_KEY'))).toBe('config');
    expect(captureWorker.classifyFailureKind(new Error('Upstream 502 from provider'))).toBe('upstream');
    expect(captureWorker.classifyFailureKind(new Error('weird ECONNRESET'))).toBe('transient');
    expect(captureWorker.classifyFailureKind(null)).toBe('transient');
  });

  test('backoffMs grows exponentially and stays bounded', () => {
    const a1 = captureWorker.backoffMs(1);
    const a2 = captureWorker.backoffMs(2);
    const a3 = captureWorker.backoffMs(3);
    const huge = captureWorker.backoffMs(99);
    expect(a1).toBeGreaterThanOrEqual(22_500); // 30s * 0.75
    expect(a1).toBeLessThanOrEqual(37_500);    // 30s * 1.25
    expect(a2).toBeGreaterThan(a1 - 1);        // monotonically non-decreasing (jitter aside)
    expect(huge).toBeLessThanOrEqual(750_000); // cap = 600_000 * 1.25
  });

  test('newBatchId produces unique prefixed ids', () => {
    const a = captureWorker.newBatchId();
    const b = captureWorker.newBatchId();
    expect(a).toMatch(/^wb_[a-f0-9]{16}$/);
    expect(b).toMatch(/^wb_[a-f0-9]{16}$/);
    expect(a).not.toBe(b);
  });

  test('VALID_JOB_KINDS covers the 6 Phase 10 dispatcher branches', () => {
    expect(captureWorker.VALID_JOB_KINDS).toEqual(expect.arrayContaining([
      'draft_generation', 'compliance_parse', 'package_assembly',
      'artifact_lifecycle_scan', 'sla_scan', 'storage_upload',
    ]));
  });
});

describe('Phase 10 — storage', () => {
  test('activeProvider falls back to url_only when env unset', () => {
    const prev = process.env.DEEP_RESEARCH_STORAGE_PROVIDER;
    delete process.env.DEEP_RESEARCH_STORAGE_PROVIDER;
    expect(storage.activeProvider()).toBe('url_only');
    if (prev) process.env.DEEP_RESEARCH_STORAGE_PROVIDER = prev;
  });
  test('VALID_PROVIDERS covers all four backends', () => {
    expect(storage.VALID_PROVIDERS).toEqual(expect.arrayContaining(['s3', 'minio', 'local', 'url_only']));
  });
  test('isMimeAllowed gates by env allowlist, default permissive', () => {
    expect(storage.isMimeAllowed('application/pdf')).toBe(true);
    expect(storage.isMimeAllowed('text/plain')).toBe(true);
  });
});

describe('Phase 10 — slaIntelligence', () => {
  test('severityForAge scales with overshoot, capped to 100', () => {
    expect(slaIntelligence.severityForAge({ ageDays: 5, thresholdDays: 7 })).toBe(40);
    expect(slaIntelligence.severityForAge({ ageDays: 9, thresholdDays: 7 })).toBe(52);
    expect(slaIntelligence.severityForAge({ ageDays: 999, thresholdDays: 1 })).toBe(100);
    expect(slaIntelligence.severityForAge({ ageDays: null, thresholdDays: 7 })).toBe(30);
  });
  test('escalationFor returns a kind-specific sentence', () => {
    expect(slaIntelligence.escalationFor('gap_aging', 10)).toMatch(/aged 10/);
    expect(slaIntelligence.escalationFor('pursuit_stagnant', 15)).toMatch(/15 days/);
    expect(typeof slaIntelligence.escalationFor('unknown_kind', 3)).toBe('string');
  });
  test('VALID_KINDS covers all six SLA scanners', () => {
    expect(slaIntelligence.VALID_KINDS).toEqual(expect.arrayContaining([
      'gap_aging', 'pursuit_stagnant', 'draft_stalled',
      'queue_aging', 'readiness_stagnant', 'blocker_aging',
    ]));
  });
  test('THRESHOLDS exposes one positive-int entry per scanner kind (suffixed _days)', () => {
    for (const k of slaIntelligence.VALID_KINDS) {
      const key = `${k}_days`;
      expect(typeof slaIntelligence.THRESHOLDS[key]).toBe('number');
      expect(slaIntelligence.THRESHOLDS[key]).toBeGreaterThan(0);
    }
  });
});

describe('Phase 10 — artifactLifecycle', () => {
  test('VALID_EVENT_KINDS is the canonical lifecycle alphabet', () => {
    expect(artifactLifecycle.VALID_EVENT_KINDS).toEqual([
      'created', 'used', 'expiring', 'expired', 'renewed', 'archived',
    ]);
  });
  test('EXPIRING_WINDOW_DAYS is a positive integer', () => {
    expect(Number.isInteger(artifactLifecycle.EXPIRING_WINDOW_DAYS)).toBe(true);
    expect(artifactLifecycle.EXPIRING_WINDOW_DAYS).toBeGreaterThan(0);
  });
});

describe('Phase 10 — queueObservability', () => {
  test('median / p95 handle empty + odd + even arrays', () => {
    expect(queueObservability.median([])).toBeNull();
    expect(queueObservability.median([10])).toBe(10);
    expect(queueObservability.median([1, 2, 3])).toBe(2);
    expect(queueObservability.median([1, 2, 3, 4])).toBe(3);
    expect(queueObservability.p95([])).toBeNull();
    expect(queueObservability.p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])).toBe(9);
  });
  test('VALID_KINDS mirrors captureWorker.VALID_JOB_KINDS', () => {
    for (const k of captureWorker.VALID_JOB_KINDS) {
      expect(queueObservability.VALID_KINDS).toContain(k);
    }
  });
});

describe('Phase 10 — complianceMatrixLlm', () => {
  test('FEATURE_FLAG_ENV name is stable and disabled by default', () => {
    expect(complianceMatrixLlm.FEATURE_FLAG_ENV).toBe('DEEP_RESEARCH_LLM_COMPLIANCE_ENABLED');
    delete process.env.DEEP_RESEARCH_LLM_COMPLIANCE_ENABLED;
    expect(complianceMatrixLlm.isEnabled()).toBe(false);
  });
  test('isEnabled true only when env=== "true"', () => {
    process.env.DEEP_RESEARCH_LLM_COMPLIANCE_ENABLED = 'true';
    expect(complianceMatrixLlm.isEnabled()).toBe(true);
    process.env.DEEP_RESEARCH_LLM_COMPLIANCE_ENABLED = '1';
    expect(complianceMatrixLlm.isEnabled()).toBe(false);
    delete process.env.DEEP_RESEARCH_LLM_COMPLIANCE_ENABLED;
  });
  test('sanitizeLlmItems coerces, validates and caps at MAX_LLM_ITEMS', () => {
    const longLabel = 'X'.repeat(500);
    const longText = 'Y'.repeat(800);
    const items = [];
    for (let i = 0; i < 40; i += 1) {
      items.push({
        item_kind: i % 7 === 0 ? 'bogus' : 'requirement',
        label: i === 0 ? longLabel : `label-${i}`,
        requirement_text: i === 0 ? longText : `text-${i}`,
        severity: i % 5 === 0 ? 'low' : 'high',
      });
    }
    items.push({ label: '', item_kind: 'requirement' });
    items.push(null);
    const out = complianceMatrixLlm.sanitizeLlmItems({ items });
    expect(out.length).toBeLessThanOrEqual(complianceMatrixLlm.MAX_LLM_ITEMS);
    expect(out[0].label.length).toBeLessThanOrEqual(200);
    expect(out[0].requirement_text.length).toBeLessThanOrEqual(400);
    // bogus kind coerced to 'requirement'
    for (const r of out) {
      expect(['requirement', 'form', 'certification', 'attachment', 'staffing', 'instruction', 'due_date']).toContain(r.item_kind);
      expect(['critical', 'high', 'normal']).toContain(r.severity);
      expect(r.label).not.toBe('');
    }
  });
  test('sanitizeLlmItems is empty-safe', () => {
    expect(complianceMatrixLlm.sanitizeLlmItems(null)).toEqual([]);
    expect(complianceMatrixLlm.sanitizeLlmItems({})).toEqual([]);
    expect(complianceMatrixLlm.sanitizeLlmItems({ items: 'not-an-array' })).toEqual([]);
  });
});

describe('Phase 10 — proposalExecutionQueue', () => {
  test('VALID_KINDS + VALID_STATUSES exposed and well-formed', () => {
    expect(Array.isArray(proposalExecutionQueue.VALID_KINDS)).toBe(true);
    expect(proposalExecutionQueue.VALID_KINDS.length).toBeGreaterThan(0);
    expect(proposalExecutionQueue.VALID_STATUSES).toEqual(expect.arrayContaining([
      'queued', 'processing', 'waiting', 'blocked',
      'completed', 'failed', 'cancelled',
    ]));
  });
});

describe('Phase 10 — durableDraftGeneration', () => {
  test('SUPPORTED_TYPES is exactly proposal / offer / analysis', () => {
    expect(durableDraftGeneration.SUPPORTED_TYPES.has('proposal')).toBe(true);
    expect(durableDraftGeneration.SUPPORTED_TYPES.has('offer')).toBe(true);
    expect(durableDraftGeneration.SUPPORTED_TYPES.has('analysis')).toBe(true);
    expect(durableDraftGeneration.SUPPORTED_TYPES.has('resume')).toBe(false);
  });
});
