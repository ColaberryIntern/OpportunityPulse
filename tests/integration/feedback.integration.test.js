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
const { sequelize, User, UserRole } = require('../../backend/src/models');

describe('Feedback Integration Tests', () => {
  let dbAvailable = false;
  let userToken;
  let adminToken;
  let userId;
  let adminId;

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

      // Create regular user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'feedbackuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'feedbackuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;
      userId = userLogin.body.data.user.id;

      // Create admin user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'feedbackadmin@test.com', password: 'Str0ng!Pass' });
      const adminUser = await User.findOne({ where: { email: 'feedbackadmin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      adminId = adminUser.id;
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'feedbackadmin@test.com', password: 'Str0ng!Pass' });
      adminToken = adminLogin.body.data.accessToken;
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

  describe('POST /api/v1/feedback', () => {
    skipIfNoDb('should create feedback and return 201 with score, type, and status', async () => {
      const res = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          score: 4,
          comments: 'Great platform experience!',
          type: 'platform',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.feedback).toHaveProperty('id');
      expect(res.body.data.feedback.score).toBe(4);
      expect(res.body.data.feedback.type).toBe('platform');
      expect(res.body.data.feedback.status).toBe('pending');
      expect(res.body.data.feedback.userId).toBe(userId);
    });

    skipIfNoDb('should return 400 for score below minimum (score: 0)', async () => {
      const res = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          score: 0,
          comments: 'Invalid low score',
        });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 400 for score above maximum (score: 6)', async () => {
      const res = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          score: 6,
          comments: 'Invalid high score',
        });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/feedback')
        .send({
          score: 3,
          comments: 'No auth',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/feedback', () => {
    skipIfNoDb('should return paginated feedback list with 200', async () => {
      const res = await request(app)
        .get('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.feedback)).toBe(true);
      expect(res.body.data).toHaveProperty('pagination');
    });

    skipIfNoDb('should filter feedback by type', async () => {
      // Create feedback with specific type to ensure filter works
      await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 5, comments: 'Filtering test', type: 'platform' });

      const res = await request(app)
        .get('/api/v1/feedback?type=platform')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.feedback.forEach((item) => {
        expect(item.type).toBe('platform');
      });
    });
  });

  describe('GET /api/v1/feedback/stats', () => {
    skipIfNoDb('should return stats object with totalCount and averageScore', async () => {
      const res = await request(app)
        .get('/api/v1/feedback/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.stats).toHaveProperty('totalCount');
      expect(res.body.data.stats).toHaveProperty('averageScore');
      expect(typeof res.body.data.stats.totalCount).toBe('number');
    });
  });

  describe('GET /api/v1/feedback/:id', () => {
    skipIfNoDb('should return a single feedback by id', async () => {
      // Create feedback first
      const createRes = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 3, comments: 'Get by ID test' });
      const feedbackId = createRes.body.data.feedback.id;

      const res = await request(app)
        .get(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.feedback.id).toBe(feedbackId);
      expect(res.body.data.feedback.score).toBe(3);
    });
  });

  describe('PUT /api/v1/feedback/:id', () => {
    skipIfNoDb('should update feedback as owner (change score)', async () => {
      // Create feedback first
      const createRes = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 2, comments: 'Will update' });
      const feedbackId = createRes.body.data.feedback.id;

      const res = await request(app)
        .put(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.feedback.score).toBe(5);
    });

    skipIfNoDb('should return 403 for non-owner trying to update admin feedback', async () => {
      // Create feedback as admin
      const createRes = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ score: 4, comments: 'Admin feedback' });
      const feedbackId = createRes.body.data.feedback.id;

      // Try to update as regular user
      const res = await request(app)
        .put(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 1 });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/feedback/:id', () => {
    skipIfNoDb('should delete feedback as owner then return 404 on GET', async () => {
      // Create feedback
      const createRes = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 1, comments: 'To be deleted' });
      expect(createRes.status).toBe(201);
      const feedbackId = createRes.body.data.feedback.id;

      // Delete it
      const deleteRes = await request(app)
        .delete(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toContain('deleted');

      // Verify it is gone
      const getRes = await request(app)
        .get(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(getRes.status).toBe(404);
    });
  });
});
