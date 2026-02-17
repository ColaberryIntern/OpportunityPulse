const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3098';
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
const { sequelize, UserRole, User, AnalysisRun } = require('../../backend/src/models');

describe('Analysis Integration Tests', () => {
  let dbAvailable = false;
  let adminToken;
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

      // Create admin user (roleId = 1)
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'analysisadmin@test.com', password: 'Str0ng!Pass' });
      const adminUser = await User.findOne({ where: { email: 'analysisadmin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'analysisadmin@test.com', password: 'Str0ng!Pass' });
      adminToken = adminLogin.body.data.accessToken;

      // Create non-admin user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'analysisuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'analysisuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;

      // Seed AnalysisRun records for GET endpoint tests
      await AnalysisRun.bulkCreate([
        {
          type: 'insight_generation',
          status: 'success',
          inputCount: 10,
          outputCount: 1,
          results: { title: 'Weekly Briefing', executiveSummary: 'Test summary' },
          startedAt: new Date(),
          completedAt: new Date(),
        },
        {
          type: 'trend_detection',
          status: 'success',
          opportunityType: 'ai_job',
          inputCount: 20,
          outputCount: 3,
          results: { trends: [{ name: 'AI jobs rising', direction: 'emerging' }], summary: 'AI jobs on the rise' },
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ]);
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

  // ── Authentication: 401 without token ──────────────────────────────

  describe('Authentication — 401 without token', () => {
    skipIfNoDb('should return 401 without token for POST /score/:type', async () => {
      const res = await request(app)
        .post('/api/v1/analysis/score/ai_job');

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 401 without token for GET /latest-insights', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/latest-insights');

      expect(res.status).toBe(401);
    });
  });

  // ── Authorization: 403 for non-admin on POST endpoints ─────────────

  describe('Authorization — 403 for non-admin', () => {
    skipIfNoDb('should return 403 for non-admin user on POST /score/:type', async () => {
      const res = await request(app)
        .post('/api/v1/analysis/score/ai_job')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    skipIfNoDb('should return 403 for non-admin user on POST /trends/:type', async () => {
      const res = await request(app)
        .post('/api/v1/analysis/trends/ai_job')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    skipIfNoDb('should return 403 for non-admin user on POST /insights', async () => {
      const res = await request(app)
        .post('/api/v1/analysis/insights')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  // ── GET endpoints (read-only, using seeded AnalysisRun records) ────

  describe('GET /api/v1/analysis/latest-insights', () => {
    skipIfNoDb('should return the seeded insight run', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/latest-insights')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.insights).toBeDefined();
      expect(res.body.data.insights.title).toBe('Weekly Briefing');
      expect(res.body.data.insights.executiveSummary).toBe('Test summary');
      expect(res.body.data.run).toBeDefined();
      expect(res.body.data.run.type).toBe('insight_generation');
      expect(res.body.data.run.status).toBe('success');
    });
  });

  describe('GET /api/v1/analysis/trends/:type', () => {
    skipIfNoDb('should return the seeded trend run for ai_job type', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/trends/ai_job')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.trends).toBeDefined();
      expect(res.body.data.trends.summary).toBe('AI jobs on the rise');
      expect(Array.isArray(res.body.data.trends.trends)).toBe(true);
      expect(res.body.data.trends.trends[0].name).toBe('AI jobs rising');
      expect(res.body.data.run).toBeDefined();
      expect(res.body.data.run.type).toBe('trend_detection');
      expect(res.body.data.run.opportunityType).toBe('ai_job');
    });

    skipIfNoDb('should return null trends when none exist for that type', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/trends/gov_contract')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.trends).toBeNull();
    });
  });
});
