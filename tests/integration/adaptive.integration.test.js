const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3103';
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

describe('Adaptive Learning Integration Tests', () => {
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
        .send({ email: 'adaptiveuser@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'adaptiveuser@test.com', password: 'Str0ng!Pass' });
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

  // ── GET /api/v1/adaptive-learning ───────────────────────────────────

  describe('GET /api/v1/adaptive-learning', () => {
    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/adaptive-learning');

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 200 with profile data for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/adaptive-learning')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('profile');
      expect(res.body.data.profile).toHaveProperty('interestScores');
      expect(res.body.data.profile).toHaveProperty('categoryPreferences');
      expect(res.body.data.profile).toHaveProperty('tagAffinities');
      expect(res.body.data.profile).toHaveProperty('searchPatterns');
      expect(res.body.data.profile).toHaveProperty('engagementMetrics');
    });
  });

  // ── POST /api/v1/adaptive-learning/track ────────────────────────────

  describe('POST /api/v1/adaptive-learning/track', () => {
    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/adaptive-learning/track')
        .send({ action: 'opportunity_view', metadata: { opportunityId: 1 } });

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 201 when tracking a valid action', async () => {
      const res = await request(app)
        .post('/api/v1/adaptive-learning/track')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          action: 'opportunity_view',
          metadata: { opportunityId: 1, type: 'ai_job' },
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
    });

    skipIfNoDb('should return 400 without action field', async () => {
      const res = await request(app)
        .post('/api/v1/adaptive-learning/track')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ metadata: { opportunityId: 1 } });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });
});
