#!/usr/bin/env node
/**
 * Release preflight — refuses to deploy a tree that would regress production.
 *
 * Run against a CHECKOUT (the tree about to be built and shipped), not against a
 * running server. It answers one question: is this tree safe to become
 * production?
 *
 * It exists because merging no longer deploys. A human now chooses a commit to
 * release, and a human can choose the wrong one — in particular:
 *
 *   * Phase 1 WITHOUT Phase 2. The timezone-correct parser rewrites existing
 *     close_date values on re-scrape. Without Phase 2's migration and evidence
 *     columns there is no verification column, no observation record, no snapshot
 *     and no superseded history, so nothing can say which deadlines changed, from
 *     what, or on whose authority. Phase 1 alone is a silent data mutation.
 *
 *   * A tree missing code that production already runs. The source-health monitor
 *     lived only on the production server for six weeks. Deploying a tree without
 *     it would delete live ingestion failure-alerting.
 *
 * Every check is a file-presence assertion on the tree, so it is deterministic,
 * offline, and cannot pass by accident.
 *
 * Usage:  node backend/src/scripts/releasePreflight.js [--root <dir>] [--json]
 * Exit:   0 = safe to release, 1 = refused (reasons on stderr)
 */

const fs = require('fs');
const path = require('path');

// Each gate names what it protects, so a refusal explains itself.
const GATES = [
  {
    id: 'phase1_requires_phase2',
    // If the timezone-correct parser is present, Phase 2's evidence surface must
    // be present too.
    trigger: 'backend/src/bonfire/scraper/deadlineParser.js',
    requires: [
      'backend/src/migrations/20260929000001-gov-phase2-deadline-evidence-and-identity.js',
      'backend/src/bonfire/deadlineEvidence.service.js',
      'backend/src/govContracts/govIngestion.service.js',
      'backend/src/govContracts/govOpportunityV2.routes.js',
    ],
    why:
      'Phase 1 without Phase 2 rewrites existing close_date values on re-scrape with no '
      + 'verification column, observation record, snapshot or superseded history. Deploy them together.',
  },
  {
    id: 'production_reconciliation_source_health',
    // Unconditional: production runs this today.
    trigger: null,
    requires: [
      'backend/src/ingestion/sourceHealthMonitor.js',
      'backend/tests/unit/sourceHealthMonitor.test.js',
    ],
    why:
      'Production runs the ingestion source-health monitor. A tree without it would remove live '
      + 'failure-alerting. Land the preservation PR before releasing.',
  },
  {
    id: 'production_reconciliation_enterprise_v1',
    trigger: null,
    requires: [
      'backend/tests/bonfire/sourceFieldsScope.test.js',
      'backend/tests/bonfire/bestFit.test.js',
    ],
    why:
      'Production serves the Enterprise v1 integration (read:bonfire_source, /best-fit). A tree '
      + 'without its tests is missing that work. Land the accelerator PR before releasing.',
  },
];

function evaluate(root) {
  const exists = (rel) => fs.existsSync(path.join(root, rel));
  const failures = [];
  const passed = [];

  for (const gate of GATES) {
    if (gate.trigger && !exists(gate.trigger)) {
      passed.push({ id: gate.id, skipped: true, reason: `trigger absent: ${gate.trigger}` });
      continue;
    }
    const missing = gate.requires.filter((r) => !exists(r));
    if (missing.length) failures.push({ id: gate.id, missing, why: gate.why });
    else passed.push({ id: gate.id, skipped: false });
  }

  return { ok: failures.length === 0, failures, passed };
}

function main(argv) {
  const rootIdx = argv.indexOf('--root');
  const root = rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd();
  const asJson = argv.includes('--json');

  const result = evaluate(root);

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`release preflight: OK (${result.passed.length} gates)\n`);
    for (const p of result.passed) {
      process.stdout.write(`  - ${p.id}${p.skipped ? ` (skipped: ${p.reason})` : ''}\n`);
    }
  } else {
    process.stderr.write('release preflight: REFUSED\n');
    for (const f of result.failures) {
      process.stderr.write(`  x ${f.id}\n`);
      for (const m of f.missing) process.stderr.write(`      missing: ${m}\n`);
      process.stderr.write(`      why: ${f.why}\n`);
    }
  }

  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { evaluate, GATES, main };
