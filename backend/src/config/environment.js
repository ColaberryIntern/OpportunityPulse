const dotenv = require('dotenv');

dotenv.config();

const requiredVars = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'BCRYPT_ROUNDS',
];

function validateEnv() {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in all required values.'
    );
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }

  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10);
  if (isNaN(bcryptRounds) || bcryptRounds < 10 || bcryptRounds > 14) {
    throw new Error('BCRYPT_ROUNDS must be a number between 10 and 14.');
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3001,
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  email: {
    service: 'gmail',
    user: process.env.GMAIL_USER,
    appPassword: process.env.GMAIL_APP_PASSWORD,
    from: process.env.EMAIL_FROM || process.env.GMAIL_USER || 'noreply@opportunitypulse.com',
    verificationUrl: process.env.EMAIL_VERIFICATION_URL || 'http://localhost:3002/verify-email',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 20,
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  auditLogEnabled: process.env.AUDIT_LOG_ENABLED === 'true',
  encryptionKey: process.env.ENCRYPTION_KEY,
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  bonfire: {
    engineEnabled: String(process.env.BONFIRE_ENGINE_ENABLED || '').toLowerCase() === 'true',
    scraper: {
      enabled: String(process.env.BONFIRE_SCRAPER_ENABLED || '').toLowerCase() === 'true',
      cronEnabled: String(process.env.BONFIRE_SCRAPER_CRON_ENABLED || '').toLowerCase() === 'true',
      cron: process.env.BONFIRE_SCRAPER_CRON || '0 7 * * 1,4',
      headless: String(process.env.BONFIRE_SCRAPER_HEADLESS || 'true').toLowerCase() !== 'false',
      username: process.env.BONFIRE_SCRAPER_USERNAME || '',
      password: process.env.BONFIRE_SCRAPER_PASSWORD || '',
      phase: (process.env.BONFIRE_SCRAPER_PHASE || 'C').toUpperCase(),
      agencyAllowlist: (process.env.BONFIRE_SCRAPER_AGENCY_ALLOWLIST || '')
        .split(',').map((s) => s.trim()).filter(Boolean),
      storageDir: process.env.BONFIRE_SCRAPER_STORAGE_DIR || './.bonfire-session',
      sessionTtlMin: parseInt(process.env.BONFIRE_SCRAPER_SESSION_TTL_MIN, 10) || 25,
      perAgencyDelayMs: parseInt(process.env.BONFIRE_SCRAPER_PER_AGENCY_DELAY_MS, 10) || 4000,
      autoEnrich: String(process.env.BONFIRE_SCRAPER_AUTO_ENRICH || 'true').toLowerCase() !== 'false',
      // Anti-detection / footprint controls. Default 72h means an agency that
      // was scraped successfully <3 days ago gets skipped on the next run —
      // cuts our portal-load count by ~3x without losing data freshness.
      agencyFreshnessHours: parseInt(process.env.BONFIRE_SCRAPER_AGENCY_FRESHNESS_HOURS, 10) || 72,
      shuffleAgencies: String(process.env.BONFIRE_SCRAPER_SHUFFLE_AGENCIES || 'true').toLowerCase() !== 'false',
    },
  },
};

module.exports = { env, validateEnv };
