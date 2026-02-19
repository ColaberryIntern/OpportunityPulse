const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3104';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'opportunity_pulse_test';
process.env.DB_USER = 'opportunity_pulse';
process.env.DB_PASSWORD = 'dev_password_change_me';
process.env.JWT_SECRET = 'integration-test-secret-key-minimum-32-characters';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.BCRYPT_ROUNDS = '10';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOG_LEVEL = 'error';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
process.env.OPENAI_API_KEY = 'test-key-for-integration';

const { app } = require('../../backend/src/server');
const { sequelize, UserRole } = require('../../backend/src/models');

describe('Alert Preferences Integration Tests', () => {
  let dbAvailable = false;
  let userToken;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ force: true });
      await UserRole.bulkCreate([
        { roleName: 'admin', description: 'Full access' },
        { roleName: 'consultant', description: 'Standard user' },
        { roleName: 'auditor', description: 'Compliance access' },
        { roleName: 'devops', description: 'Infrastructure access' },
      ]);
      dbAvailable = true;

      // Create user and get token
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'alertprefuser@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alertprefuser@test.com', password: 'Str0ng!Pass' });
      userToken = loginRes.body.data.accessToken;
    } catch (error) {
      console.warn('Database not available, skipping integration tests:', error.message);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await sequelize.close();
    }
  });

  const skipIfNoDb = (name, fn) => {
    it(name, async () => {
      if (!dbAvailable) {
        console.warn(`  Skipped: ${name} (no database)`);
        return;
      }
      await fn();
    });
  };

  // ── GET /api/v1/alert-preferences ───────────────────────────────────

  describe('GET /api/v1/alert-preferences', () => {
    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/alert-preferences');

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 200 and auto-create default preferences', async () => {
      const res = await request(app)
        .get('/api/v1/alert-preferences')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('preferences');

      const prefs = res.body.data.preferences;
      // Default preferences should be returned even if none exist in DB
      expect(prefs).toHaveProperty('govContracts', true);
      expect(prefs).toHaveProperty('aiJobs', true);
      expect(prefs).toHaveProperty('investments', true);
      expect(prefs).toHaveProperty('minScore', 0);
      expect(prefs).toHaveProperty('emailNotify', false);
      expect(prefs).toHaveProperty('inAppNotify', true);
    });
  });

  // ── PUT /api/v1/alert-preferences ───────────────────────────────────

  describe('PUT /api/v1/alert-preferences', () => {
    skipIfNoDb('should update preferences successfully', async () => {
      const res = await request(app)
        .put('/api/v1/alert-preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          emailNotify: true,
          inAppNotify: false,
          minScore: 50,
          govContracts: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('preferences');
      expect(res.body.data.preferences.emailNotify).toBe(true);
      expect(res.body.data.preferences.inAppNotify).toBe(false);
      expect(res.body.data.preferences.minScore).toBe(50);
      expect(res.body.data.preferences.govContracts).toBe(false);
    });
  });

  // ── GET /api/v1/alert-preferences (after update) ───────────────────

  describe('GET /api/v1/alert-preferences (after update)', () => {
    skipIfNoDb('should return the updated preference values', async () => {
      const res = await request(app)
        .get('/api/v1/alert-preferences')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      const prefs = res.body.data.preferences;
      expect(prefs.emailNotify).toBe(true);
      expect(prefs.inAppNotify).toBe(false);
      expect(prefs.minScore).toBe(50);
      expect(prefs.govContracts).toBe(false);
      // Fields not updated should retain defaults
      expect(prefs.aiJobs).toBe(true);
      expect(prefs.investments).toBe(true);
    });
  });
});
