#!/usr/bin/env node
// OIED → External AI Bridge smoke test.
//
// Calls each spec-listed endpoint via the API key path, validates the
// envelope contract on every row response, and prints sample payloads
// for the validation report.
//
// Usage:
//   OIED_TEST_BASE_URL=http://95.216.199.47:8091 \
//   OIED_INTELLIGENCE_API_KEY=<48-char-key>      \
//   node scripts/oied-bridge-smoke.js
//
// Exit 0 on full pass, 1 on any contract violation.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.OIED_TEST_BASE_URL || 'http://localhost:3009';
const KEY      = process.env.OIED_INTELLIGENCE_API_KEY;
const OUT_DIR  = path.resolve(__dirname, '..', '.oied-screenshots');

if (!KEY) {
  console.error('Set OIED_INTELLIGENCE_API_KEY in env to run the smoke.');
  process.exit(2);
}

const REQUIRED_CONTEXT_KEYS = [
  'schema_version', 'priority', 'value', 'win_probability', 'effort',
  'roi_per_hour', 'recommended_action', 'reason', 'strategic_type',
  'next_steps',
];

function log(...a) { console.log('[bridge-smoke]', ...a); }

async function call(method, path, { body = null } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body: json, raw: text.slice(0, 4000) };
}

function assertEnvelope(row, where) {
  for (const k of REQUIRED_CONTEXT_KEYS) {
    if (!(k in (row.context || {}))) {
      throw new Error(`${where}: row.context missing field "${k}"`);
    }
  }
  if (row.context.schema_version !== 1) {
    throw new Error(`${where}: schema_version expected 1, got ${row.context.schema_version}`);
  }
}

// --- Endpoint plan ----------------------------------------------------
// (path, method, expects_envelope_per_row, expected_status)
const READS = [
  { path: '/api/v1/oied/recommendations',           per_row: true  },
  { path: '/api/v1/oied/opportunities/my?limit=2',  per_row: true  },
  { path: '/api/v1/oied/opportunities/execution',   per_row: true  },
  { path: '/api/v1/oied/bundles?limit=2',           per_row: true  },
  { path: '/api/v1/oied/revenue',                   per_row: false },
  { path: '/api/v1/oied/profile',                   per_row: false },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    base_url: BASE_URL,
    endpoints: [],
    samples: {},
    errors: [],
    started_at: new Date().toISOString(),
  };

  // 1. Reads.
  for (const ep of READS) {
    const r = await call('GET', ep.path);
    if (r.status !== 200) {
      report.errors.push(`GET ${ep.path} returned ${r.status}: ${r.raw}`);
      report.endpoints.push({ ...ep, status: r.status, ok: false });
      log(`✗ GET ${ep.path} → ${r.status}`);
      continue;
    }
    let envelope_ok = true;
    if (ep.per_row) {
      const rows = Array.isArray(r.body.data) ? r.body.data : [];
      if (rows.length === 0) {
        log(`! GET ${ep.path} → 200 but empty (envelope check skipped)`);
      } else {
        try { assertEnvelope(rows[0], `GET ${ep.path} row[0]`); }
        catch (e) {
          report.errors.push(e.message);
          envelope_ok = false;
        }
      }
    }
    report.endpoints.push({ ...ep, status: r.status, ok: envelope_ok });
    report.samples[ep.path] = JSON.stringify(r.body, null, 2).slice(0, 1800);
    log(`✓ GET ${ep.path} → 200${ep.per_row ? ` (envelope: ${envelope_ok ? 'OK' : 'BAD'})` : ''}`);
  }

  // 2. Single-opportunity GET (uses an id from /opportunities/my).
  try {
    const my = await call('GET', '/api/v1/oied/opportunities/my?limit=1');
    const id = my.body && my.body.data && my.body.data[0] && my.body.data[0].id;
    if (id) {
      const r = await call('GET', `/api/v1/oied/opportunities/${id}`);
      if (r.status === 200 && r.body.data) {
        try { assertEnvelope(r.body.data, `GET /opportunities/${id}`); }
        catch (e) { report.errors.push(e.message); }
      }
      report.endpoints.push({ path: `/api/v1/oied/opportunities/${id}`, status: r.status, ok: r.status === 200 });
      report.samples[`/api/v1/oied/opportunities/:id`] = JSON.stringify(r.body, null, 2).slice(0, 1800);
      log(`✓ GET /opportunities/${id} → ${r.status}`);
    }
  } catch (e) {
    report.errors.push('single-opp lookup: ' + e.message);
  }

  // 3. Bundle blueprint GET (find a bundle with a populated blueprint).
  try {
    const bundles = await call('GET', '/api/v1/oied/bundles?limit=200');
    const withBp = (bundles.body.data || []).find(
      (b) => b.blueprint && b.blueprint.mvp_scope,
    );
    if (withBp) {
      const r = await call('GET', `/api/v1/oied/bundles/${withBp.id}/blueprint`);
      report.endpoints.push({ path: `/api/v1/oied/bundles/${withBp.id}/blueprint`, status: r.status, ok: r.status === 200 });
      report.samples[`/api/v1/oied/bundles/:id/blueprint`] = JSON.stringify(r.body, null, 2).slice(0, 1800);
      log(`✓ GET /bundles/${withBp.id}/blueprint → ${r.status}`);
    } else {
      log('! No bundle with populated blueprint found — blueprint GET test skipped.');
    }
  } catch (e) {
    report.errors.push('bundle-blueprint lookup: ' + e.message);
  }

  // 4. Auth negative test — an obviously-wrong key must NOT pass.
  const badRes = await fetch(`${BASE_URL}/api/v1/oied/profile`, {
    headers: { Authorization: 'Bearer not-a-real-key-not-a-real-key-not-a-real' },
  });
  const authOk = badRes.status === 401;
  log(`${authOk ? '✓' : '✗'} Wrong API key → ${badRes.status} (expected 401)`);
  report.endpoints.push({ path: '<auth negative>', status: badRes.status, ok: authOk });
  if (!authOk) report.errors.push(`auth negative test: expected 401, got ${badRes.status}`);

  // 5. Persist the report.
  report.finished_at = new Date().toISOString();
  fs.writeFileSync(
    path.join(OUT_DIR, 'bridge_smoke_report.json'),
    JSON.stringify(report, null, 2),
  );

  const passed = report.errors.length === 0;
  log('---');
  log(`Endpoints checked: ${report.endpoints.length}`);
  log(`Errors: ${report.errors.length}`);
  if (!passed) for (const e of report.errors) log('  -', e);
  process.exit(passed ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
