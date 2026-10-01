const winston = require('winston');

// Keys whose VALUES must never reach a log destination. Matched case-insensitively
// against the key name at any depth.
//
// Deliberately omits a bare `auth` so ordinary keys like `author` are not redacted.
const SENSITIVE_KEY =
  /(pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|credential|session|private[-_]?key|access[-_]?key|connection[-_]?string|dsn)/i;

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

function redactDeep(value, depth) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return value;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redactDeep(v, depth + 1);
  }
  return out;
}

/**
 * Redact sensitive values before ANY transport sees them.
 *
 * This sits in the shared format chain rather than on a single transport, so the
 * file transports are covered too. Production stdout logging (below) therefore
 * does not create a second, less-protected copy of the same records — which is
 * the only safe way to add a destination to a logger that previously had no
 * redaction at all.
 *
 * LIMITATION, stated rather than implied: this is KEY-based. A secret
 * interpolated into a free-text `message` string is not detected. Preventing
 * that is a code-review concern at the call site, and a secret already exposed
 * must be rotated, not merely hidden.
 */
const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactDeep(info[key], 1);
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'opportunity-pulse' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Production: structured JSON to stdout, as the platform expects.
//
// Previously the Console transport was added ONLY when NODE_ENV !== 'production',
// so in production winston wrote exclusively to files inside the container and
// `docker logs` showed nothing but dotenv's startup tips. Any operational check
// that greps container logs — including release.yml's post-rollout
// ingestion_scheduler_disabled assertion — could therefore never pass, for any
// flag value. Observed 2026-10-01: the schedulers were provably disabled in
// logs/combined.log while the release failed asserting the opposite.
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console());
} else {
  // Development keeps the readable, colourised form.
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

module.exports = logger;
