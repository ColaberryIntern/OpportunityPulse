// read:bonfire_source — the narrow API-key scope that un-redacts sourceUrl /
// rawText for a machine credential WITHOUT granting the 'admin' role.
//
// The security property under test is two-sided:
//   1. the scope DOES un-redact the source fields on reads, and
//   2. the scope does NOT confer write authority — rbac.checkPermissions()
//      gates on req.user.role, which an API-key request never carries.
// (2) is the reason this scope exists instead of just minting an admin service
// account, so it is tested explicitly rather than assumed.

const {
  redactForRole,
  redactListForRole,
  canReadSourceFields,
  isAdmin,
  SOURCE_FIELDS_SCOPE,
} = require('../../src/bonfire/bonfire.util');
const { checkPermissions } = require('../../src/middleware/rbac.middleware');
const { ALLOWED_SCOPES } = require('../../src/apiKeys/apiKey.validation');

const row = {
  id: 'abc-123',
  title: 'AI Analytics Platform',
  sourceUrl: 'https://portal.example.gov/bid/9911',
  rawText: 'CONFIDENTIAL RFP TEXT',
  priorityScore: 88,
};

// Shape produced by apiKeyAuth.middleware.verifyApiKey — note: NO `role`.
const apiKeyUser = (scopes) => ({
  userId: 42,
  id: 42,
  email: 'accelerator-svc@colaberry.com',
  roleId: 2,
  scopes,
  apiKey: true,
});

describe('SOURCE_FIELDS_SCOPE is a registered, issuable scope', () => {
  it('is the expected literal', () => {
    expect(SOURCE_FIELDS_SCOPE).toBe('read:bonfire_source');
  });

  it('is accepted by the API-key creation validator', () => {
    expect(ALLOWED_SCOPES).toContain('read:bonfire_source');
  });

  it('does not disturb the pre-existing generic scopes', () => {
    expect(ALLOWED_SCOPES).toEqual(expect.arrayContaining(['read', 'write']));
  });
});

describe('canReadSourceFields', () => {
  it('true for an admin JWT', () => {
    expect(canReadSourceFields({ role: 'admin' })).toBe(true);
  });

  it('true for an API key carrying the scope', () => {
    expect(canReadSourceFields(apiKeyUser(['read', SOURCE_FIELDS_SCOPE]))).toBe(true);
  });

  it('false for an API key with only generic read', () => {
    expect(canReadSourceFields(apiKeyUser(['read']))).toBe(false);
  });

  it('false for an API key with write but not the source scope', () => {
    expect(canReadSourceFields(apiKeyUser(['read', 'write']))).toBe(false);
  });

  it('false for a non-admin human JWT', () => {
    expect(canReadSourceFields({ role: 'consultant' })).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty object', {}],
    ['scopes as a string', { scopes: SOURCE_FIELDS_SCOPE }],
    ['scopes null', { scopes: null }],
    ['scopes empty', { scopes: [] }],
  ])('false and does not throw for %s', (_label, user) => {
    expect(() => canReadSourceFields(user)).not.toThrow();
    expect(canReadSourceFields(user)).toBe(false);
  });

  it('a scope string is not accepted in place of an array (no substring match)', () => {
    // Guards against a `String.includes` regression: 'xread:bonfire_sourcey'
    // must not satisfy the check.
    expect(canReadSourceFields({ scopes: 'xread:bonfire_sourcey' })).toBe(false);
  });

  it('does not treat the scope as conferring the admin role', () => {
    expect(isAdmin(apiKeyUser([SOURCE_FIELDS_SCOPE]))).toBe(false);
  });
});

describe('redaction honors the scope', () => {
  it('un-redacts for a scoped API key', () => {
    const out = redactForRole(row, apiKeyUser(['read', SOURCE_FIELDS_SCOPE]));
    expect(out.sourceUrl).toBe('https://portal.example.gov/bid/9911');
    expect(out.rawText).toBe('CONFIDENTIAL RFP TEXT');
  });

  it('still redacts for an unscoped API key', () => {
    const out = redactForRole(row, apiKeyUser(['read']));
    expect(out.sourceUrl).toBeNull();
    expect(out.rawText).toBeNull();
    expect(out.title).toBe('AI Analytics Platform');
    expect(out.priorityScore).toBe(88);
  });

  it('applies per-row across a list', () => {
    const out = redactListForRole([row, { ...row, id: 'def' }], apiKeyUser([SOURCE_FIELDS_SCOPE]));
    expect(out).toHaveLength(2);
    out.forEach((r) => expect(r.sourceUrl).toBe('https://portal.example.gov/bid/9911'));
  });

  it('leaves the input row unmutated', () => {
    const copy = { ...row };
    redactForRole(row, apiKeyUser(['read']));
    expect(row).toEqual(copy);
  });
});

describe('the scope grants NO write authority (the reason it exists)', () => {
  const runGuard = (user) => {
    const req = { user };
    let status = null;
    let body = null;
    const res = {
      status(c) { status = c; return this; },
      json(b) { body = b; return this; },
    };
    let nextCalled = false;
    checkPermissions('admin')(req, res, () => { nextCalled = true; });
    return { status, body, nextCalled };
  };

  it('rejects a scoped API key on an admin-gated route', () => {
    const { nextCalled, status } = runGuard(apiKeyUser(['read', SOURCE_FIELDS_SCOPE]));
    expect(nextCalled).toBe(false);
    expect(status).toBe(401); // no `role` at all -> "Authentication required"
  });

  it('rejects even when the key also holds the generic write scope', () => {
    const { nextCalled } = runGuard(apiKeyUser(['read', 'write', SOURCE_FIELDS_SCOPE]));
    expect(nextCalled).toBe(false);
  });

  it('still admits a genuine admin JWT', () => {
    const { nextCalled } = runGuard({ userId: 1, role: 'admin' });
    expect(nextCalled).toBe(true);
  });

  it('still rejects a non-admin human JWT', () => {
    const { nextCalled, status } = runGuard({ userId: 3, role: 'consultant' });
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);
  });
});
