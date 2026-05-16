// Deep Research Phase 11 — pure-logic unit tests.
//
// Covers the deterministic helpers exposed by every Phase 11 service so a
// regression in tenant isolation, RBAC, lineage chains, prompt composition,
// or stream throttling is caught before the full Jest suite runs. No DB.

const tenantIsolation = require('../../src/deepResearch/tenantIsolation.service');
const rbac = require('../../src/deepResearch/rbac.service');
const auditTrail = require('../../src/deepResearch/auditTrail.service');
const eventLineage = require('../../src/deepResearch/eventLineage.service');
const slaEscalation = require('../../src/deepResearch/slaEscalation.service');
const workflowGovernance = require('../../src/deepResearch/workflowGovernance.service');
const storageProviders = require('../../src/deepResearch/storageProviders.service');
const observabilityStream = require('../../src/deepResearch/observabilityStream.service');
const pursuitContextPrompt = require('../../src/deepResearch/pursuitContextPrompt.service');

describe('Phase 11 — tenantIsolation', () => {
  test('applyTenantScope adds organizationId; null orgId is no-op', () => {
    const w = {};
    tenantIsolation.applyTenantScope(w, 5);
    expect(w.organizationId).toBe(5);
    const w2 = { foo: 1 };
    tenantIsolation.applyTenantScope(w2, null);
    expect(w2.organizationId).toBeUndefined();
    expect(w2.foo).toBe(1);
  });
  test('applyTenantScopeRaw uses snake_case', () => {
    const w = {};
    tenantIsolation.applyTenantScopeRaw(w, 7);
    expect(w.organization_id).toBe(7);
  });
  test('assertOwnership returns the row when org matches', () => {
    const row = { organizationId: 9, id: 1 };
    expect(tenantIsolation.assertOwnership(row, 9)).toBe(row);
  });
  test('assertOwnership in loose mode does not throw cross-tenant', () => {
    delete process.env[tenantIsolation.STRICT_ISOLATION_ENV];
    const row = { organizationId: 1, id: 2 };
    expect(tenantIsolation.assertOwnership(row, 99)).toBe(row); // loose mode allows
  });
  test('assertOwnership in strict mode rejects cross-tenant', () => {
    process.env[tenantIsolation.STRICT_ISOLATION_ENV] = 'true';
    const row = { organizationId: 1, id: 2 };
    expect(() => tenantIsolation.assertOwnership(row, 99)).toThrow(/Cross-tenant/);
    delete process.env[tenantIsolation.STRICT_ISOLATION_ENV];
  });
  test('assertOwnership respects null orgId (admin bypass)', () => {
    const row = { organizationId: 1, id: 3 };
    expect(tenantIsolation.assertOwnership(row, null)).toBe(row);
  });
  test('DEFAULT_ORG_ID is positive integer', () => {
    expect(Number.isInteger(tenantIsolation.DEFAULT_ORG_ID)).toBe(true);
    expect(tenantIsolation.DEFAULT_ORG_ID).toBeGreaterThan(0);
  });
});

describe('Phase 11 — rbac', () => {
  test('ROLE_NAMES ordered low → high authority', () => {
    expect(rbac.ROLE_NAMES[0]).toBe('observer');
    expect(rbac.ROLE_NAMES[rbac.ROLE_NAMES.length - 1]).toBe('super_admin');
  });
  test('levelOf ranks roles correctly', () => {
    expect(rbac.levelOf('observer')).toBeLessThan(rbac.levelOf('proposal_writer'));
    expect(rbac.levelOf('capture_manager')).toBeLessThan(rbac.levelOf('super_admin'));
    expect(rbac.levelOf('unknown_role')).toBe(-1);
  });
  test('normalizeLegacyRole maps admin→super_admin', () => {
    expect(rbac.normalizeLegacyRole('admin')).toBe('super_admin');
    expect(rbac.normalizeLegacyRole('observer')).toBe('observer');
    expect(rbac.normalizeLegacyRole(null)).toBe('observer');
    expect(rbac.normalizeLegacyRole('bogus')).toBe('observer');
  });
  test('super_admin has every permission', () => {
    for (const p of rbac.PERMISSIONS) {
      expect(rbac.isAllowed({ role: 'super_admin', permission: p })).toBe(true);
    }
  });
  test('observer is read-only — cannot write', () => {
    expect(rbac.isAllowed({ role: 'observer', permission: 'dashboard.view' })).toBe(true);
    expect(rbac.isAllowed({ role: 'observer', permission: 'pursuit.activate' })).toBe(false);
    expect(rbac.isAllowed({ role: 'observer', permission: 'queue.cancel' })).toBe(false);
    expect(rbac.isAllowed({ role: 'observer', permission: 'draft.generate' })).toBe(false);
  });
  test('proposal_writer can generate drafts but not approve', () => {
    expect(rbac.isAllowed({ role: 'proposal_writer', permission: 'draft.generate' })).toBe(true);
    expect(rbac.isAllowed({ role: 'proposal_writer', permission: 'approval.approve' })).toBe(false);
  });
  test('capture_manager can cancel queue but not grant permissions', () => {
    expect(rbac.isAllowed({ role: 'capture_manager', permission: 'queue.cancel' })).toBe(true);
    expect(rbac.isAllowed({ role: 'capture_manager', permission: 'user.permission.grant' })).toBe(false);
  });
  test('explicit permissions list overrides role defaults', () => {
    const ok = rbac.isAllowed({ role: 'observer', permissions: ['queue.cancel'], permission: 'queue.cancel' });
    expect(ok).toBe(true);
  });
  test('PERMISSIONS list is non-empty and unique', () => {
    expect(rbac.PERMISSIONS.length).toBeGreaterThan(20);
    expect(new Set(rbac.PERMISSIONS).size).toBe(rbac.PERMISSIONS.length);
  });
});

describe('Phase 11 — auditTrail', () => {
  test('VALID_KINDS covers the expected domains', () => {
    expect(auditTrail.VALID_KINDS).toEqual(expect.arrayContaining([
      'pursuit', 'draft', 'compliance', 'artifact', 'queue',
      'sla', 'governance', 'rbac', 'tenant',
    ]));
  });
  test('COMMON_VERBS includes ack/approve/reject', () => {
    expect(auditTrail.COMMON_VERBS).toEqual(expect.arrayContaining([
      'acknowledge', 'approve', 'reject', 'cancel', 'grant', 'revoke',
    ]));
  });
});

describe('Phase 11 — eventLineage', () => {
  test('VALID_KINDS includes pursuit / cluster / draft / package', () => {
    expect(eventLineage.VALID_KINDS).toEqual(expect.arrayContaining([
      'pursuit', 'cluster', 'draft', 'package', 'submission', 'operator',
    ]));
  });
  test('EDGE_KINDS includes derived_from / approved_by / spawned', () => {
    expect(eventLineage.EDGE_KINDS).toEqual(expect.arrayContaining([
      'derived_from', 'generated', 'approved_by', 'spawned', 'fed_into',
    ]));
  });
  test('MAX_DEPTH is positive integer', () => {
    expect(Number.isInteger(eventLineage.MAX_DEPTH)).toBe(true);
    expect(eventLineage.MAX_DEPTH).toBeGreaterThan(0);
    expect(eventLineage.MAX_DEPTH).toBeLessThanOrEqual(10);
  });
});

describe('Phase 11 — slaEscalation', () => {
  test('VALID_ACTIONS covers ack/assign/escalate/resolve', () => {
    expect(slaEscalation.VALID_ACTIONS).toEqual(expect.arrayContaining([
      'acknowledge', 'assign', 'escalate', 'reassign', 'resolve', 'dismiss',
    ]));
  });
  test('ESCALATION_LADDER goes low → high authority', () => {
    expect(slaEscalation.ESCALATION_LADDER[0]).toBe('observer');
    expect(slaEscalation.ESCALATION_LADDER[slaEscalation.ESCALATION_LADDER.length - 1]).toBe('super_admin');
  });
  test('nextEscalationRole advances up the ladder', () => {
    expect(slaEscalation.nextEscalationRole('observer')).toBe('reviewer');
    expect(slaEscalation.nextEscalationRole('proposal_writer')).toBe('capture_manager');
    expect(slaEscalation.nextEscalationRole('super_admin')).toBe('org_admin');
    expect(slaEscalation.nextEscalationRole(null)).toBe('capture_manager');
    expect(slaEscalation.nextEscalationRole('unknown')).toBe('org_admin');
  });
});

describe('Phase 11 — workflowGovernance', () => {
  test('VALID_WORKFLOW_KINDS covers approvals + reviews', () => {
    expect(workflowGovernance.VALID_WORKFLOW_KINDS).toEqual(expect.arrayContaining([
      'pursuit_approval', 'draft_review', 'compliance_review',
      'submission_approval', 'sla_resolution',
    ]));
  });
  test('VALID_STATUSES covers state machine', () => {
    expect(workflowGovernance.VALID_STATUSES).toEqual(expect.arrayContaining([
      'open', 'acknowledged', 'in_progress', 'approved', 'rejected',
      'completed', 'cancelled', 'escalated',
    ]));
  });
});

describe('Phase 11 — storageProviders', () => {
  test('SUPPORTED_PROVIDERS includes all 4 backends', () => {
    expect(storageProviders.SUPPORTED_PROVIDERS).toEqual(
      expect.arrayContaining(['s3', 'minio', 'local', 'url_only']),
    );
  });
  test('configuredProvider falls back to url_only when env unset', () => {
    const prev = process.env.DEEP_RESEARCH_STORAGE_PROVIDER;
    delete process.env.DEEP_RESEARCH_STORAGE_PROVIDER;
    expect(storageProviders.configuredProvider()).toBe('url_only');
    process.env.DEEP_RESEARCH_STORAGE_PROVIDER = 'invalid_provider';
    expect(storageProviders.configuredProvider()).toBe('url_only');
    if (prev) process.env.DEEP_RESEARCH_STORAGE_PROVIDER = prev;
  });
  test('providerHealth in url_only mode is healthy', async () => {
    delete process.env.DEEP_RESEARCH_STORAGE_PROVIDER;
    const h = await storageProviders.providerHealth();
    expect(h.healthy).toBe(true);
    expect(h.provider).toBe('url_only');
  });
});

describe('Phase 11 — observabilityStream', () => {
  beforeEach(() => observabilityStream._resetForTests());
  afterAll(() => observabilityStream._resetForTests());

  test('VALID_CHANNELS includes worker.state / sla.alert / failure', () => {
    expect(observabilityStream.VALID_CHANNELS).toEqual(expect.arrayContaining([
      'worker.state', 'queue.update', 'sla.alert', 'readiness.change',
      'draft.complete', 'package.assembled', 'failure',
    ]));
  });
  test('summarize reports zero subscribers when fresh', () => {
    const s = observabilityStream.summarize();
    expect(s.active).toBe(0);
    expect(s.max).toBeGreaterThan(0);
    expect(s.valid_channels.length).toBeGreaterThan(0);
  });
  test('publish ignores unknown channels', () => {
    const out = observabilityStream.publish('not-a-channel', { x: 1 });
    expect(out).toBe(false);
  });
  test('publish returns 0 delivered when no subscribers', () => {
    const out = observabilityStream.publish('worker.state', { state: 'idle' });
    expect(out).toBe(0);
  });
  test('publish throttles within MIN_EMIT_INTERVAL_MS', () => {
    observabilityStream.publish('worker.state', { tick: 1 });
    const second = observabilityStream.publish('worker.state', { tick: 2 });
    expect(second).toBe(false);
  });
  test('publishers helper proxies through publish', () => {
    const out = observabilityStream.publishers.slaAlert({ id: 1 });
    expect(typeof out === 'number' || out === false).toBe(true);
  });
});

describe('Phase 11 — pursuitContextPrompt', () => {
  test('composePromptBlock returns empty block when context is null', () => {
    const out = pursuitContextPrompt.composePromptBlock(null);
    expect(out.block).toBe('');
    expect(out.excluded).toContain('no_context');
  });
  test('composePromptBlock includes capture strategy sections when present', () => {
    const ctx = {
      pursuit: { name: 'DART AI Modernization', status: 'open' },
      capture: {
        evaluator_priorities: ['Federal compliance', 'On-time delivery'],
        differentiators: ['8a certified', 'Local presence'],
      },
      readiness: { blockers: [{ text: 'No COI on file' }] },
      opps: [{ id: 1, title: 'opp 1' }, { id: 2, title: 'opp 2' }],
    };
    const out = pursuitContextPrompt.composePromptBlock(ctx);
    expect(out.block).toContain('Pursuit Context');
    expect(out.block).toContain('Capture Strategy');
    expect(out.block).toContain('Federal compliance');
    expect(out.block).toContain('Readiness Blockers');
    expect(out.included).toEqual(expect.arrayContaining(['pursuit', 'capture_strategy', 'readiness_blockers', 'linked_opps']));
  });
  test('composePromptBlock truncates oversize block', () => {
    const huge = 'X'.repeat(500);
    const ctx = {
      pursuit: { name: huge },
      capture: { evaluator_priorities: Array(50).fill(huge) },
    };
    const out = pursuitContextPrompt.composePromptBlock(ctx, { maxChars: 1500 });
    expect(out.block.length).toBeLessThanOrEqual(1500);
    expect(out.block).toContain('TRUNCATED');
  });
  test('composePromptBlock has a governance NOTE footer', () => {
    const ctx = { pursuit: { name: 'X' } };
    const out = pursuitContextPrompt.composePromptBlock(ctx);
    expect(out.block).toContain('NOTE:');
    expect(out.block).toContain('deterministic');
  });
  test('MAX_BLOCK_CHARS is reasonable', () => {
    expect(pursuitContextPrompt.MAX_BLOCK_CHARS).toBeGreaterThanOrEqual(2000);
    expect(pursuitContextPrompt.MAX_BLOCK_CHARS).toBeLessThanOrEqual(10000);
  });
});
