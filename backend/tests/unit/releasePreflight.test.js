// Release preflight gates.
//
// The workflow change separates merging from deploying, so a human now picks the
// commit to release. These gates are what stops the wrong pick from shipping.
// Each test is a release that MUST be refused, or one that must be allowed.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { evaluate, GATES } = require('../../src/scripts/releasePreflight');

// Minimal fake checkouts: presence is all the gates read.
const PHASE1 = 'backend/src/bonfire/scraper/deadlineParser.js';
const PHASE2 = [
  'backend/src/migrations/20260929000001-gov-phase2-deadline-evidence-and-identity.js',
  'backend/src/bonfire/deadlineEvidence.service.js',
  'backend/src/govContracts/govIngestion.service.js',
  'backend/src/govContracts/govOpportunityV2.routes.js',
];
const SOURCE_HEALTH = [
  'backend/src/ingestion/sourceHealthMonitor.js',
  'backend/tests/unit/sourceHealthMonitor.test.js',
];
const ENTERPRISE_V1 = [
  'backend/tests/bonfire/sourceFieldsScope.test.js',
  'backend/tests/bonfire/bestFit.test.js',
];

let root;

const touch = (rel) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, '// fixture\n');
};

const remove = (rel) => fs.rmSync(path.join(root, rel), { force: true });

const failureIds = (res) => res.failures.map((f) => f.id).sort();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** A tree that already carries everything production runs. */
function reconciledTree() {
  [...SOURCE_HEALTH, ...ENTERPRISE_V1].forEach(touch);
}

describe('release preflight — production reconciliation', () => {
  it('refuses a tree missing the production-only source-health monitor', () => {
    ENTERPRISE_V1.forEach(touch); // accelerator landed, preservation did not
    const res = evaluate(root);
    expect(res.ok).toBe(false);
    expect(failureIds(res)).toContain('production_reconciliation_source_health');
    const f = res.failures.find((x) => x.id === 'production_reconciliation_source_health');
    expect(f.missing).toEqual(expect.arrayContaining(SOURCE_HEALTH));
    expect(f.why).toMatch(/failure-alerting/i);
  });

  it('refuses a tree missing the Enterprise v1 integration', () => {
    SOURCE_HEALTH.forEach(touch); // preservation landed, accelerator did not
    const res = evaluate(root);
    expect(res.ok).toBe(false);
    expect(failureIds(res)).toContain('production_reconciliation_enterprise_v1');
    expect(res.failures.find((x) => x.id === 'production_reconciliation_enterprise_v1').why)
      .toMatch(/read:bonfire_source|best-fit/);
  });

  it('refuses a bare origin/main — neither production dependency present', () => {
    const res = evaluate(root);
    expect(res.ok).toBe(false);
    expect(failureIds(res)).toEqual([
      'production_reconciliation_enterprise_v1',
      'production_reconciliation_source_health',
    ]);
  });

  it('allows a tree that carries both production dependencies and no Phase 1', () => {
    reconciledTree();
    const res = evaluate(root);
    expect(res.ok).toBe(true);
    expect(res.failures).toEqual([]);
  });
});

describe('release preflight — Phase 1 must not ship alone', () => {
  it('REFUSES Phase 1 with no Phase 2 at all', () => {
    reconciledTree();
    touch(PHASE1);
    const res = evaluate(root);
    expect(res.ok).toBe(false);
    expect(failureIds(res)).toEqual(['phase1_requires_phase2']);
    expect(res.failures[0].missing).toEqual(expect.arrayContaining(PHASE2));
    expect(res.failures[0].why).toMatch(/rewrites existing close_date/i);
  });

  it('REFUSES Phase 1 with a partial Phase 2 — the migration missing is enough', () => {
    reconciledTree();
    touch(PHASE1);
    PHASE2.forEach(touch);
    remove(PHASE2[0]); // migration absent: evidence columns would not exist
    const res = evaluate(root);
    expect(res.ok).toBe(false);
    expect(failureIds(res)).toEqual(['phase1_requires_phase2']);
    expect(res.failures[0].missing).toEqual([PHASE2[0]]);
  });

  it('REFUSES Phase 1 when only the v2 read API is missing', () => {
    reconciledTree();
    touch(PHASE1);
    PHASE2.forEach(touch);
    remove(PHASE2[3]);
    const res = evaluate(root);
    expect(res.ok).toBe(false);
    expect(res.failures[0].missing).toEqual([PHASE2[3]]);
  });

  it('ALLOWS Phase 1 and Phase 2 together, on a reconciled tree — the intended release', () => {
    reconciledTree();
    touch(PHASE1);
    PHASE2.forEach(touch);
    const res = evaluate(root);
    expect(res.ok).toBe(true);
    expect(res.failures).toEqual([]);
    expect(res.passed.map((p) => p.id).sort()).toEqual([
      'phase1_requires_phase2',
      'production_reconciliation_enterprise_v1',
      'production_reconciliation_source_health',
    ]);
  });

  it('skips the Phase 1 gate when Phase 1 is absent, rather than passing it vacuously', () => {
    reconciledTree();
    const res = evaluate(root);
    const gate = res.passed.find((p) => p.id === 'phase1_requires_phase2');
    expect(gate.skipped).toBe(true);
    expect(gate.reason).toMatch(/deadlineParser/);
  });
});

describe('release preflight — the gates themselves', () => {
  it('names every gate and its rationale, so a refusal explains itself', () => {
    for (const g of GATES) {
      expect(g.id).toMatch(/^[a-z0-9_]+$/);
      expect(g.requires.length).toBeGreaterThan(0);
      expect(g.why.length).toBeGreaterThan(40);
    }
  });

  it('is deterministic and offline — evaluating the same tree twice agrees', () => {
    reconciledTree();
    touch(PHASE1);
    PHASE2.forEach(touch);
    expect(evaluate(root)).toEqual(evaluate(root));
  });

  it('the real repository tree is evaluated without throwing', () => {
    // Guards against a gate path typo that would make the script crash in CI
    // instead of reporting. The verdict itself depends on which PRs have landed.
    const repoRoot = path.join(__dirname, '../../..');
    const res = evaluate(repoRoot);
    expect(typeof res.ok).toBe('boolean');
    expect(Array.isArray(res.failures)).toBe(true);
  });
});
