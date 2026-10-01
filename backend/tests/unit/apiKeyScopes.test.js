// The scope allow-list and the scopes the routes require must agree.
//
// Regression context: govOpportunityV2.routes has required
// 'read:gov_opportunities' since Phase 2 shipped, while apiKey.validation
// rejected it. The documented way to issue a credential could not produce one
// the v2 API would accept, and nothing in the test suite noticed because each
// side was consistent with itself.

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../src');

function readSource(relative) {
  return fs.readFileSync(path.join(SRC, relative), 'utf8');
}

/** The scopes an API key may be issued with. */
function allowedScopes() {
  const src = readSource('apiKeys/apiKey.validation.js');
  const match = src.match(/const ALLOWED_SCOPES = \[([^\]]*)\]/);
  if (!match) throw new Error('ALLOWED_SCOPES not found in apiKey.validation.js');
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** Scopes referenced by requireScope(...) across the route layer. */
function requiredScopes() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        const src = fs.readFileSync(full, 'utf8');
        // Both the inline form and the SCOPE-constant form used by v2.
        for (const m of src.matchAll(/requireScope\(\s*['"]([^'"]+)['"]/g)) found.add(m[1]);
        for (const m of src.matchAll(/const SCOPE = ['"]([^'"]+)['"]/g)) found.add(m[1]);
      }
    }
  };
  walk(SRC);
  return [...found];
}

describe('API key scope allow-list', () => {
  it('includes read:gov_opportunities, which the v2 contract API requires', () => {
    expect(allowedScopes()).toContain('read:gov_opportunities');
  });

  it('still includes the pre-existing scopes', () => {
    const allowed = allowedScopes();
    for (const scope of ['read', 'write', 'read:bonfire_source']) {
      expect(allowed).toContain(scope);
    }
  });

  it('every scope the routes require can actually be issued', () => {
    // The invariant that was broken. Stated generally so a future route that
    // introduces a scope without adding it here fails straight away.
    const allowed = allowedScopes();
    const missing = requiredScopes().filter((s) => !allowed.includes(s));
    expect(missing).toEqual([]);
  });

  it('read:gov_opportunities guards only GET routes, so it cannot grant writes', () => {
    const src = readSource('govContracts/govOpportunityV2.routes.js');
    const verbs = [...src.matchAll(/router\.(get|post|put|patch|delete)\s*\(/g)].map((m) => m[1]);
    expect(verbs.length).toBeGreaterThan(0);
    expect(verbs.every((v) => v === 'get')).toBe(true);
  });
});
