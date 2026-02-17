const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3097';
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

const { app } = require('../../backend/src/server');
const { sequelize, User, UserRole, UserActivity } = require('../../backend/src/models');

describe('Dashboard Integration Tests', () => {
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

      // Create a user and get token
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'dashuser@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'dashuser@test.com', password: 'Str0ng!Pass' });
      userToken = loginRes.body.data.accessToken;
      userId = loginRes.body.data.user.id;

      // Seed some activity
      await UserActivity.bulkCreate([
        { userId, action: 'login', metadata: {} },
        { userId, action: 'content_view', metadata: { contentId: 1 } },
        { userId, action: 'search_query', metadata: { query: 'AI contracts' } },
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

  describe('GET /api/v1/dashboard/stats', () => {
    skipIfNoDb('should return dashboard stats for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.stats).toHaveProperty('totalUsers');
      expect(res.body.data.stats).toHaveProperty('totalContent');
      expect(res.body.data.stats).toHaveProperty('myContentCount');
      expect(res.body.data.stats).toHaveProperty('recentActivityCount');
      expect(typeof res.body.data.stats.totalUsers).toBe('number');
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stats');

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/dashboard/activity', () => {
    skipIfNoDb('should return paginated activity for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.activities)).toBe(true);
      expect(res.body.data.activities.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data).toHaveProperty('pagination');
      expect(res.body.data.pagination).toHaveProperty('total');
      expect(res.body.data.pagination).toHaveProperty('page');
      expect(res.body.data.pagination).toHaveProperty('limit');
      expect(res.body.data.pagination).toHaveProperty('pages');
    });

    skipIfNoDb('should respect pagination parameters', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity?page=1&limit=2')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.activities.length).toBeLessThanOrEqual(2);
      expect(res.body.data.pagination.limit).toBe(2);
    });

    skipIfNoDb('should return empty array for page beyond data', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity?page=999&limit=20')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.activities).toEqual([]);
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity');

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should order activities by most recent first', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      const activities = res.body.data.activities;
      if (activities.length > 1) {
        const first = new Date(activities[0].created_at);
        const second = new Date(activities[1].created_at);
        expect(first.getTime()).toBeGreaterThanOrEqual(second.getTime());
      }
    });
  });
});
