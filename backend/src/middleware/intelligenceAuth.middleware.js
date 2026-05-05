// OIED → External AI Bridge auth.
//
// Tries the static OIED_INTELLIGENCE_API_KEY first; on match, builds a
// service-account `req.user` (id=null, role='admin', isApiKey=true).
// On miss/absent, falls through to the existing JWT verifyToken so
// the React app + tests keep working.
//
// Distinct from the existing apiKeyAuth.middleware (DB-backed public
// API). This is a single internal key for the bridge consumer (another
// Claude-based system). Rotated via env var.

const { verifyToken } = require('./auth.middleware');

const MIN_KEY_LENGTH = 24; // guardrail against accidentally setting a short string

function defaultOrgIdFromEnv() {
  const v = Number(process.env.OIED_INTELLIGENCE_DEFAULT_ORG_ID);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

function isOiedApiKey(token) {
  const apiKey = process.env.OIED_INTELLIGENCE_API_KEY;
  if (!apiKey || apiKey.length < MIN_KEY_LENGTH) return false;
  if (!token || token.length < MIN_KEY_LENGTH) return false;
  // Constant-time compare via length match + char-by-char xor.
  if (token.length !== apiKey.length) return false;
  let mismatch = 0;
  for (let i = 0; i < apiKey.length; i += 1) {
    mismatch |= apiKey.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

function buildServiceAccountUser() {
  return {
    id: null,
    userId: null,
    email: 'bridge@oied.local',
    role: 'admin',
    isApiKey: true,
    organizationId: defaultOrgIdFromEnv(),
  };
}

// Public middleware. Wires API-key fast path + JWT fallback.
function verifyJwtOrIntelligenceKey(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  const token = m && m[1];

  if (token && isOiedApiKey(token)) {
    req.user = buildServiceAccountUser();
    return next();
  }
  return verifyToken(req, res, next);
}

module.exports = {
  verifyJwtOrIntelligenceKey,
  isOiedApiKey,
  buildServiceAccountUser,
  MIN_KEY_LENGTH,
};
