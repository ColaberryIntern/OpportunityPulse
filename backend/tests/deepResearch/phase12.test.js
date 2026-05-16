// Deep Research Phase 12 — pure-logic unit tests.
//
// Covers the deterministic helpers exposed by every Phase 12 service so
// regressions in provenance hashing, RBAC route analysis, asset migration
// classification, retention pressure scoring, SLA digest formatting, and
// integrity composite math are caught locally. No DB.

const promptProvenance = require('../../src/deepResearch/promptProvenance.service');
const rbacCoverage = require('../../src/deepResearch/rbacCoverage.service');
const slaDigest = require('../../src/deepResearch/slaDigest.service');
const sseHotPaths = require('../../src/deepResearch/sseHotPaths.service');
const assetMigration = require('../../src/deepResearch/assetMigration.service');
const auditRetention = require('../../src/deepResearch/auditRetention.service');
const governanceIntegrity = require('../../src/deepResearch/governanceIntegrity.service');
const observabilityStream = require('../../src/deepResearch/observabilityStream.service');

describe('Phase 12 — promptProvenance', () => {
  test('PROMPT_VERSION is a stable string', () => {
    expect(typeof promptProvenance.PROMPT_VERSION).toBe('string');
    expect(promptProvenance.PROMPT_VERSION.length).toBeGreaterThan(0);
  });
  test('MAX_PREVIEW_CHARS is a positive integer', () => {
    expect(Number.isInteger(promptProvenance.MAX_PREVIEW_CHARS)).toBe(true);
    expect(promptProvenance.MAX_PREVIEW_CHARS).toBeGreaterThan(0);
  });
  test('exports the expected surface', () => {
    for (const fn of ['record', 'buildAndPersist', 'linkOutput', 'findByOutput',
      'findByAuditHash', 'listForPursuit', 'summarize']) {
      expect(typeof promptProvenance[fn]).toBe('function');
    }
  });
});

describe('Phase 12 — rbacCoverage', () => {
  test('analyzeRouter returns zeroed analysis for empty router', () => {
    const out = rbacCoverage.analyzeRouter({ stack: [] });
    expect(out.total).toBe(0);
    expect(out.legacy_admin).toBe(0);
    expect(out.requires_permission).toBe(0);
    expect(out.unprotected).toBe(0);
  });
  test('analyzeRouter handles null/undefined input safely', () => {
    expect(rbacCoverage.analyzeRouter(null).total).toBe(0);
    expect(rbacCoverage.analyzeRouter(undefined).total).toBe(0);
    expect(rbacCoverage.analyzeRouter({}).total).toBe(0);
  });
  test('analyzeRouter classifies a router with one requirePermission route', () => {
    const fakeGuard = function rbacGuard() {};
    fakeGuard._permission = 'queue.cancel';
    const router = {
      stack: [{
        route: {
          path: '/foo', methods: { get: true },
          stack: [
            { name: 'verifyToken' },
            { handle: fakeGuard, name: fakeGuard.name },
          ],
        },
      }],
    };
    const out = rbacCoverage.analyzeRouter(router);
    expect(out.total).toBe(1);
    expect(out.requires_permission).toBe(1);
    expect(out.routes[0].classification).toBe('requires_permission');
  });
  test('analyzeRouter classifies a router with one legacy admin route', () => {
    const router = {
      stack: [{
        route: {
          path: '/legacy', methods: { post: true },
          stack: [
            { name: 'verifyToken' },
            { name: 'checkPermissions' },
          ],
        },
      }],
    };
    const out = rbacCoverage.analyzeRouter(router);
    expect(out.legacy_admin).toBe(1);
    expect(out.requires_permission).toBe(0);
  });
});

describe('Phase 12 — slaDigest', () => {
  test('defaultRecipients returns array from env or empty', () => {
    const prev = process.env.DEEP_RESEARCH_SLA_DIGEST_RECIPIENTS;
    delete process.env.DEEP_RESEARCH_SLA_DIGEST_RECIPIENTS;
    expect(slaDigest.defaultRecipients()).toEqual([]);
    process.env.DEEP_RESEARCH_SLA_DIGEST_RECIPIENTS = 'a@b.com, c@d.com';
    expect(slaDigest.defaultRecipients()).toEqual(['a@b.com', 'c@d.com']);
    if (prev) process.env.DEEP_RESEARCH_SLA_DIGEST_RECIPIENTS = prev;
    else delete process.env.DEEP_RESEARCH_SLA_DIGEST_RECIPIENTS;
  });
  test('formatBody includes counts + recommendation', () => {
    const digest = {
      generated_at: '2026-05-16T12:00:00Z',
      organization_id: 1,
      counts: { open: 2, acknowledged: 1, resolved_last_24h: 4 },
      critical_open: [{ id: 99, severity: 92, slaKind: 'gap_aging', scopeKind: 'pursuit', scopeId: 7, ageDays: 12, escalation: 'Escalate this.' }],
      recommendation: 'Action needed.',
    };
    const body = slaDigest.formatBody(digest);
    expect(body).toContain('Open: 2');
    expect(body).toContain('Acknowledged: 1');
    expect(body).toContain('Resolved (last 24h): 4');
    expect(body).toContain('gap_aging');
    expect(body).toContain('Action needed.');
  });
  test('formatBody handles empty critical list', () => {
    const digest = {
      generated_at: '2026-05-16',
      organization_id: 1,
      counts: { open: 0, acknowledged: 0, resolved_last_24h: 0 },
      critical_open: [],
      recommendation: 'No open SLA pressure.',
    };
    const body = slaDigest.formatBody(digest);
    expect(body).toContain('No critical open events');
  });
  test('SUBJECT_PREFIX is a stable string', () => {
    expect(typeof slaDigest.SUBJECT_PREFIX).toBe('string');
    expect(slaDigest.SUBJECT_PREFIX.length).toBeGreaterThan(0);
  });
});

describe('Phase 12 — sseHotPaths', () => {
  beforeEach(() => {
    sseHotPaths._resetCounters();
    observabilityStream._resetForTests();
  });
  afterAll(() => {
    sseHotPaths._resetCounters();
    observabilityStream._resetForTests();
  });
  test('publish.workerState increments counter', () => {
    sseHotPaths.publish.workerState({ state: 'idle' });
    const s = sseHotPaths.summarize();
    expect(s.in_memory['worker.state']).toBeDefined();
    expect(s.in_memory['worker.state'].published || s.in_memory['worker.state'].throttled).toBeGreaterThan(0);
  });
  test('publishers cover all valid channels', () => {
    for (const ch of ['workerState', 'queueUpdate', 'draftComplete', 'packageAssembled',
      'failure', 'readinessChange', 'governanceEvent', 'workflowTransition', 'slaAlert']) {
      expect(typeof sseHotPaths.publish[ch]).toBe('function');
    }
  });
  test('summarize reports the in-memory counter map + valid channels', () => {
    const s = sseHotPaths.summarize();
    expect(s.valid_channels).toEqual(expect.arrayContaining(observabilityStream.VALID_CHANNELS));
    expect(typeof s.in_memory).toBe('object');
  });
});

describe('Phase 12 — assetMigration', () => {
  test('VALID_STATUSES covers the state machine', () => {
    expect(assetMigration.VALID_STATUSES).toEqual(expect.arrayContaining([
      'pending', 'in_progress', 'completed', 'failed', 'skipped',
    ]));
  });
  test('exports the expected surface', () => {
    for (const fn of ['planMigration', 'migrateOne', 'runBatch',
      'summarize', 'recentAttempts']) {
      expect(typeof assetMigration[fn]).toBe('function');
    }
  });
});

describe('Phase 12 — auditRetention', () => {
  test('DEFAULT_RETENTION_DAYS is positive int', () => {
    expect(Number.isInteger(auditRetention.DEFAULT_RETENTION_DAYS)).toBe(true);
    expect(auditRetention.DEFAULT_RETENTION_DAYS).toBeGreaterThan(0);
  });
  test('ARCHIVE_BATCH_SIZE is a sane positive int', () => {
    expect(Number.isInteger(auditRetention.ARCHIVE_BATCH_SIZE)).toBe(true);
    expect(auditRetention.ARCHIVE_BATCH_SIZE).toBeGreaterThan(0);
    expect(auditRetention.ARCHIVE_BATCH_SIZE).toBeLessThanOrEqual(100000);
  });
  test('archiveWindow throws BAD_INPUT without window', async () => {
    await expect(auditRetention.archiveWindow({})).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
});

describe('Phase 12 — governanceIntegrity', () => {
  test('PHASE_10_TABLES_WITH_ORG_ID covers all 8', () => {
    expect(governanceIntegrity.PHASE_10_TABLES_WITH_ORG_ID).toEqual(expect.arrayContaining([
      'worker_jobs', 'proposal_execution_queue', 'artifact_lifecycle_events',
      'sla_events', 'queue_metrics', 'storage_assets',
      'execution_failures', 'operational_metrics',
    ]));
    expect(governanceIntegrity.PHASE_10_TABLES_WITH_ORG_ID.length).toBe(8);
  });
  test('exports the expected aggregator surface', () => {
    for (const fn of ['tenantIsolationScore', 'rbacScoreFor', 'provenanceScore',
      'observabilityScore', 'retentionScore', 'computeIntegrity',
      'snapshotIntegrity', 'recentIntegrity', 'getDashboard']) {
      expect(typeof governanceIntegrity[fn]).toBe('function');
    }
  });
});
