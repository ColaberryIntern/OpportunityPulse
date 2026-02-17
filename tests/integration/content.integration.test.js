const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3096';
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

describe('Content Integration Tests', () => {
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
        .send({ email: 'contentuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'contentuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;
      userId = userLogin.body.data.user.id;

      // Create admin user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'contentadmin@test.com', password: 'Str0ng!Pass' });
      const adminUser = await User.findOne({ where: { email: 'contentadmin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      adminId = adminUser.id;
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'contentadmin@test.com', password: 'Str0ng!Pass' });
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

  describe('POST /api/v1/content', () => {
    skipIfNoDb('should create content and return 201', async () => {
      const res = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'AI Contract Analysis',
          body: 'Detailed analysis of recent government AI contracts.',
          category: 'contracts',
          tags: ['AI', 'government'],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.content).toHaveProperty('id');
      expect(res.body.data.content.title).toBe('AI Contract Analysis');
      expect(res.body.data.content.status).toBe('draft');
      expect(res.body.data.content.userId).toBe(userId);
    });

    skipIfNoDb('should return 400 for missing title', async () => {
      const res = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ body: 'Some body text' });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 400 for missing body', async () => {
      const res = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Some Title' });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 400 for invalid status', async () => {
      const res = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Test',
          body: 'Body',
          status: 'invalid_status',
        });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/content')
        .send({ title: 'Test', body: 'Body' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/content', () => {
    skipIfNoDb('should return paginated content list', async () => {
      const res = await request(app)
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.content)).toBe(true);
      expect(res.body.data).toHaveProperty('pagination');
    });

    skipIfNoDb('should filter by category', async () => {
      // Create content with specific category
      await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Jobs Report', body: 'AI job trends.', category: 'jobs' });

      const res = await request(app)
        .get('/api/v1/content?category=jobs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.content.forEach((item) => {
        expect(item.category).toBe('jobs');
      });
    });

    skipIfNoDb('should filter by status', async () => {
      const res = await request(app)
        .get('/api/v1/content?status=draft')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.content.forEach((item) => {
        expect(item.status).toBe('draft');
      });
    });

    skipIfNoDb('should respect pagination parameters', async () => {
      const res = await request(app)
        .get('/api/v1/content?page=1&limit=1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.content.length).toBeLessThanOrEqual(1);
      expect(res.body.data.pagination.limit).toBe(1);
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/content');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/content/:id', () => {
    skipIfNoDb('should return content by id', async () => {
      // Create first
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Get Test', body: 'Body for get test.' });
      const contentId = createRes.body.data.content.id;

      const res = await request(app)
        .get(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.content.id).toBe(contentId);
      expect(res.body.data.content.title).toBe('Get Test');
    });

    skipIfNoDb('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .get('/api/v1/content/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/v1/content/:id', () => {
    skipIfNoDb('should update own content', async () => {
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Update Test', body: 'Original body.' });
      const contentId = createRes.body.data.content.id;

      const res = await request(app)
        .put(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Updated Title', status: 'published' });

      expect(res.status).toBe(200);
      expect(res.body.data.content.title).toBe('Updated Title');
      expect(res.body.data.content.status).toBe('published');
    });

    skipIfNoDb('should allow admin to update other users content', async () => {
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Admin Edit Test', body: 'User content.' });
      const contentId = createRes.body.data.content.id;

      const res = await request(app)
        .put(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin Updated' });

      expect(res.status).toBe(200);
      expect(res.body.data.content.title).toBe('Admin Updated');
    });

    skipIfNoDb('should return 403 when non-owner tries to update', async () => {
      // Create content as admin
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Admin Content', body: 'Admin body.' });
      const contentId = createRes.body.data.content.id;

      // Try to update as regular user
      const res = await request(app)
        .put(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Hacked' });

      expect(res.status).toBe(403);
    });

    skipIfNoDb('should return 404 for non-existent content', async () => {
      const res = await request(app)
        .put('/api/v1/content/99999')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Does not exist' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/content/:id', () => {
    skipIfNoDb('should soft delete own content', async () => {
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Delete Test', body: 'To be deleted.' });
      const contentId = createRes.body.data.content.id;

      const res = await request(app)
        .delete(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');

      // Verify it's gone from list
      const getRes = await request(app)
        .get(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(getRes.status).toBe(404);
    });

    skipIfNoDb('should allow admin to delete any content', async () => {
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Admin Delete Test', body: 'Body.' });
      const contentId = createRes.body.data.content.id;

      const res = await request(app)
        .delete(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    skipIfNoDb('should return 403 when non-owner tries to delete', async () => {
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Protected Content', body: 'Admin owns this.' });
      const contentId = createRes.body.data.content.id;

      const res = await request(app)
        .delete(`/api/v1/content/${contentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    skipIfNoDb('should return 404 for non-existent content', async () => {
      const res = await request(app)
        .delete('/api/v1/content/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });
});
