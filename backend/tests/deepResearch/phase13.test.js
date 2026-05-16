// Deep Research Phase 13 — pure-logic unit tests.

const crossProvenance = require('../../src/deepResearch/crossProvenance.service');
const operationalLineage = require('../../src/deepResearch/operationalLineage.service');
const governanceConsistency = require('../../src/deepResearch/governanceConsistency.service');
const governanceDrift = require('../../src/deepResearch/governanceDrift.service');
const approvalProvenance = require('../../src/deepResearch/approvalProvenance.service');
const operationalReplay = require('../../src/deepResearch/operationalReplay.service');
const streamIntegrity = require('../../src/deepResearch/streamIntegrity.service');
const permissionIntegrity = require('../../src/deepResearch/permissionIntegrity.service');

describe('Phase 13 — crossProvenance', () => {
  test('VALID_SUBJECT_KINDS covers core operational objects', () => {
    expect(crossProvenance.VALID_SUBJECT_KINDS).toEqual(expect.arrayContaining([
      'pursuit', 'opportunity_output', 'submission_package', 'compliance_matrix',
      'capture_strategy', 'worker_job', 'sla_event', 'workflow_assignment',
    ]));
  });
  test('VALID_PROVENANCE_KINDS includes source/dependency/generation/operator/prompt/workflow', () => {
    expect(crossProvenance.VALID_PROVENANCE_KINDS).toEqual(expect.arrayContaining([
      'source', 'dependency', 'generation', 'operator', 'prompt', 'workflow',
    ]));
  });
});

describe('Phase 13 — operationalLineage', () => {
  test('MAX_DEPTH + MAX_NODES are positive integers', () => {
    expect(Number.isInteger(operationalLineage.MAX_DEPTH)).toBe(true);
    expect(operationalLineage.MAX_DEPTH).toBeGreaterThan(0);
    expect(Number.isInteger(operationalLineage.MAX_NODES)).toBe(true);
    expect(operationalLineage.MAX_NODES).toBeGreaterThan(0);
  });
  test('VALID_NODE_KINDS + VALID_RELATIONS exposed', () => {
    expect(operationalLineage.VALID_NODE_KINDS.length).toBeGreaterThan(10);
    expect(operationalLineage.VALID_RELATIONS).toEqual(expect.arrayContaining([
      'derives_from', 'generated', 'approved_by', 'spawned', 'fed_into',
    ]));
  });
});

describe('Phase 13 — governanceConsistency', () => {
  test('VALID_CHECKS covers core consistency dimensions', () => {
    expect(governanceConsistency.VALID_CHECKS).toEqual(expect.arrayContaining([
      'stale_open_sla', 'orphan_workflow', 'lineage_gap',
      'approval_bypass', 'invalid_transition',
    ]));
  });
  test('STALE_DAYS_SLA is a positive integer', () => {
    expect(Number.isInteger(governanceConsistency.STALE_DAYS_SLA)).toBe(true);
    expect(governanceConsistency.STALE_DAYS_SLA).toBeGreaterThan(0);
  });
  test('recordFinding rejects invalid kinds (soft-fail)', async () => {
    const out = await governanceConsistency.recordFinding({
      checkKind: 'not_a_valid_kind', subjectKind: 'foo', subjectId: '1',
    });
    expect(out).toBeNull();
  });
});

describe('Phase 13 — governanceDrift', () => {
  test('VALID_DRIFT_KINDS covers the 6 declared drift dimensions', () => {
    expect(governanceDrift.VALID_DRIFT_KINDS).toEqual([
      'permission_drift', 'workflow_drift', 'policy_drift',
      'escalation_drift', 'approval_drift', 'tenant_config_drift',
    ]);
  });
  test('STUCK_WORKFLOW_DAYS + ESCALATING_SEVERITY_THRESHOLD are sane', () => {
    expect(Number.isInteger(governanceDrift.STUCK_WORKFLOW_DAYS)).toBe(true);
    expect(governanceDrift.STUCK_WORKFLOW_DAYS).toBeGreaterThan(0);
    expect(governanceDrift.ESCALATING_SEVERITY_THRESHOLD).toBeGreaterThanOrEqual(50);
    expect(governanceDrift.ESCALATING_SEVERITY_THRESHOLD).toBeLessThanOrEqual(100);
  });
  test('recordDrift soft-fails for unknown drift kind', async () => {
    const out = await governanceDrift.recordDrift({ driftKind: 'mystery_drift' });
    expect(out).toBeNull();
  });
});

describe('Phase 13 — approvalProvenance', () => {
  test('VALID_ACTIONS covers full state machine', () => {
    expect(approvalProvenance.VALID_ACTIONS).toEqual(expect.arrayContaining([
      'created', 'acknowledged', 'in_progress', 'approved',
      'rejected', 'completed', 'cancelled', 'escalated', 'reassigned',
    ]));
  });
  test('humanizeSeconds formats durations', () => {
    expect(approvalProvenance.humanizeSeconds(null)).toBeNull();
    expect(approvalProvenance.humanizeSeconds(45)).toBe('45s');
    expect(approvalProvenance.humanizeSeconds(120)).toBe('2m');
    expect(approvalProvenance.humanizeSeconds(3700)).toMatch(/h/);
    expect(approvalProvenance.humanizeSeconds(86400 * 2 + 3600)).toMatch(/2d/);
  });
});

describe('Phase 13 — operationalReplay', () => {
  test('VALID_SCOPES covers pursuit / output / workflow / queue / sla', () => {
    expect(operationalReplay.VALID_SCOPES).toEqual(expect.arrayContaining([
      'pursuit', 'output', 'workflow', 'sla_event',
    ]));
  });
  test('buildReplay rejects invalid scope', async () => {
    await expect(operationalReplay.buildReplay({ scope: 'invalid', scopeId: '1' }))
      .rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
});

describe('Phase 13 — streamIntegrity', () => {
  beforeEach(() => streamIntegrity._resetCounters());
  afterAll(() => streamIntegrity._resetCounters());
  test('counter helpers increment without throwing', () => {
    streamIntegrity.recordHeartbeat();
    streamIntegrity.recordPublished({ n: 3 });
    streamIntegrity.recordDropped();
    streamIntegrity.recordDuplicate();
    streamIntegrity.recordReconnect();
    streamIntegrity.trackConcurrent(7);
    // No throws is the assertion.
    expect(true).toBe(true);
  });
});

describe('Phase 13 — permissionIntegrity', () => {
  test('STALE_DAYS + OVER_PERMISSION_THRESHOLD are sane', () => {
    expect(Number.isInteger(permissionIntegrity.STALE_DAYS)).toBe(true);
    expect(permissionIntegrity.STALE_DAYS).toBeGreaterThan(0);
    expect(permissionIntegrity.OVER_PERMISSION_THRESHOLD).toBeGreaterThan(0);
    expect(permissionIntegrity.OVER_PERMISSION_THRESHOLD).toBeLessThanOrEqual(1);
  });
  test('exports the expected surface', () => {
    for (const fn of ['evaluateUser', 'computeIntegrity', 'snapshot',
      'recentSnapshots', 'mismatchReport']) {
      expect(typeof permissionIntegrity[fn]).toBe('function');
    }
  });
});
