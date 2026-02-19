const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3100';
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
const { sequelize, UserRole, User, DataSource, Opportunity } = require('../../backend/src/models');

describe('Recommendations Integration Tests', () => {
  let dbAvailable = false;
  let userToken;
  let userId;

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

      // Create user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'recuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'recuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;
      const user = await User.findOne({ where: { email: 'recuser@test.com' } });
      userId = user.id;

      // Seed DataSource
      await DataSource.create({
        name: 'rec_test_source',
        type: 'mock',
        config: {},
        enabled: true,
      });

      // Seed Opportunities
      await Opportunity.bulkCreate([
        {
          type: 'gov_contract',
          title: 'AI Technology Platform for Federal Agencies',
          description: 'Building next-generation AI analytics for government.',
          source: 'rec_test_source',
          sourceId: 'REC-001',
          status: 'active',
          category: 'IT',
          aiScore: 90.0,
          dataSourceId: 1,
        },
        {
          type: 'ai_job',
          title: 'Senior Data Scientist',
          description: 'Work on cutting-edge machine learning models.',
          source: 'rec_test_source',
          sourceId: 'REC-002',
          status: 'active',
          category: 'Engineering',
          aiScore: 85.0,
          dataSourceId: 1,
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

  // ── GET /api/v1/recommendations ─────────────────────────────────────

  describe('GET /api/v1/recommendations', () => {
    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/recommendations');

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 200 with recommendations array for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/recommendations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('recommendations');
      expect(Array.isArray(res.body.data.recommendations)).toBe(true);
      expect(res.body.data).toHaveProperty('interests');
      expect(res.body.data).toHaveProperty('total');
      expect(typeof res.body.data.total).toBe('number');
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);
    });

    skipIfNoDb('should respect limit query parameter', async () => {
      const res = await request(app)
        .get('/api/v1/recommendations?limit=1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.recommendations.length).toBeLessThanOrEqual(1);
      expect(res.body.data.total).toBeLessThanOrEqual(1);
    });

    skipIfNoDb('should return interest-matched results when user has interests set', async () => {
      // Set user interests directly in the DB
      await User.update({ interests: 'technology,AI' }, { where: { id: userId } });

      const res = await request(app)
        .get('/api/v1/recommendations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.interests).toEqual(expect.arrayContaining(['technology', 'AI']));
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);

      // At least one recommendation should match the interest (title contains 'AI' or 'Technology')
      const hasMatch = res.body.data.recommendations.some(
        (rec) =>
          (rec.title && (rec.title.toLowerCase().includes('ai') || rec.title.toLowerCase().includes('technology'))) ||
          (rec.description && (rec.description.toLowerCase().includes('ai') || rec.description.toLowerCase().includes('technology')))
      );
      expect(hasMatch).toBe(true);

      // Clean up interests
      await User.update({ interests: null }, { where: { id: userId } });
    });

    skipIfNoDb('should return empty recommendations array when no opportunities exist', async () => {
      // Remove all opportunities
      await Opportunity.destroy({ where: {}, force: true });

      const res = await request(app)
        .get('/api/v1/recommendations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.recommendations).toEqual([]);
      expect(res.body.data.total).toBe(0);

      // Re-seed opportunities for any subsequent runs
      await Opportunity.bulkCreate([
        {
          type: 'gov_contract',
          title: 'AI Technology Platform for Federal Agencies',
          description: 'Building next-generation AI analytics for government.',
          source: 'rec_test_source',
          sourceId: 'REC-001-reseed',
          status: 'active',
          category: 'IT',
          aiScore: 90.0,
          dataSourceId: 1,
        },
        {
          type: 'ai_job',
          title: 'Senior Data Scientist',
          description: 'Work on cutting-edge machine learning models.',
          source: 'rec_test_source',
          sourceId: 'REC-002-reseed',
          status: 'active',
          category: 'Engineering',
          aiScore: 85.0,
          dataSourceId: 1,
        },
      ]);
    });
  });
});
