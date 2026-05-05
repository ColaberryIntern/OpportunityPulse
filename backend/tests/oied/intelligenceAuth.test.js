// Intelligence-bridge auth middleware tests.

const jwt = require('jsonwebtoken');
const auth = require('../../src/middleware/intelligenceAuth.middleware');

const VALID_KEY = 'k'.repeat(48); // 48-char service-account key

function mockRes() {
  return {
    status: jest.fn(function status() { return this; }),
    json: jest.fn(function json() { return this; }),
  };
}

beforeEach(() => {
  delete process.env.OIED_INTELLIGENCE_API_KEY;
  delete process.env.OIED_INTELLIGENCE_DEFAULT_ORG_ID;
});

describe('intelligenceAuth.isOiedApiKey', () => {
  it('returns true when key matches env var', () => {
    process.env.OIED_INTELLIGENCE_API_KEY = VALID_KEY;
    expect(auth.isOiedApiKey(VALID_KEY)).toBe(true);
  });
  it('returns false when env var is unset', () => {
    expect(auth.isOiedApiKey(VALID_KEY)).toBe(false);
  });
  it('rejects keys shorter than 24 chars (guardrail)', () => {
    process.env.OIED_INTELLIGENCE_API_KEY = 'short';
    expect(auth.isOiedApiKey('short')).toBe(false);
  });
  it('rejects mismatched same-length tokens', () => {
    process.env.OIED_INTELLIGENCE_API_KEY = VALID_KEY;
    const wrong = 'x'.repeat(48);
    expect(auth.isOiedApiKey(wrong)).toBe(false);
  });
  it('handles empty/null tokens defensively', () => {
    process.env.OIED_INTELLIGENCE_API_KEY = VALID_KEY;
    expect(auth.isOiedApiKey('')).toBe(false);
    expect(auth.isOiedApiKey(null)).toBe(false);
    expect(auth.isOiedApiKey(undefined)).toBe(false);
  });
});

describe('intelligenceAuth.buildServiceAccountUser', () => {
  it('returns admin role + isApiKey flag + null id', () => {
    const u = auth.buildServiceAccountUser();
    expect(u.role).toBe('admin');
    expect(u.isApiKey).toBe(true);
    expect(u.id).toBeNull();
    expect(u.userId).toBeNull();
    expect(u.organizationId).toBe(1); // default
  });
  it('honors OIED_INTELLIGENCE_DEFAULT_ORG_ID env var', () => {
    process.env.OIED_INTELLIGENCE_DEFAULT_ORG_ID = '42';
    const u = auth.buildServiceAccountUser();
    expect(u.organizationId).toBe(42);
  });
});

describe('intelligenceAuth.verifyJwtOrIntelligenceKey (middleware)', () => {
  it('API key match → service-account user, calls next()', (done) => {
    process.env.OIED_INTELLIGENCE_API_KEY = VALID_KEY;
    const req = { headers: { authorization: `Bearer ${VALID_KEY}` } };
    const res = mockRes();
    auth.verifyJwtOrIntelligenceKey(req, res, () => {
      expect(req.user.role).toBe('admin');
      expect(req.user.isApiKey).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
      done();
    });
  });

  it('valid JWT (no API key in env) → falls through to verifyToken', (done) => {
    delete process.env.OIED_INTELLIGENCE_API_KEY;
    process.env.JWT_SECRET = 'test_jwt_secret_' + 'x'.repeat(32);
    const token = jwt.sign({ id: 7, email: 'a@b.c', role: 'admin' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    auth.verifyJwtOrIntelligenceKey(req, res, () => {
      expect(req.user.id).toBe(7);
      expect(req.user.role).toBe('admin');
      expect(req.user.isApiKey).toBeUndefined();
      done();
    });
  });

  it('valid JWT works even when OIED_INTELLIGENCE_API_KEY is set', (done) => {
    process.env.OIED_INTELLIGENCE_API_KEY = VALID_KEY;
    process.env.JWT_SECRET = 'test_jwt_secret_' + 'x'.repeat(32);
    const token = jwt.sign({ id: 9, role: 'admin' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    auth.verifyJwtOrIntelligenceKey(req, res, () => {
      expect(req.user.id).toBe(9);
      expect(req.user.isApiKey).toBeUndefined(); // JWT path, not API-key
      done();
    });
  });

  it('wrong API key + invalid JWT → 401', () => {
    process.env.OIED_INTELLIGENCE_API_KEY = VALID_KEY;
    const req = { headers: { authorization: `Bearer ${'y'.repeat(48)}` } };
    const res = mockRes();
    auth.verifyJwtOrIntelligenceKey(req, res, () => {
      throw new Error('next() should not have been called');
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('missing Authorization header → 401 (JWT path rejects)', () => {
    process.env.OIED_INTELLIGENCE_API_KEY = VALID_KEY;
    const req = { headers: {} };
    const res = mockRes();
    auth.verifyJwtOrIntelligenceKey(req, res, () => {
      throw new Error('next() should not have been called');
    });
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
