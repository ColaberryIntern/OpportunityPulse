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

const { app } = require('../../backend/src/server');
const { sequelize, User, UserRole } = require('../../backend/src/models');

describe('Forum Integration Tests', () => {
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
        .send({ email: 'forumuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'forumuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;
      userId = userLogin.body.data.user.id;

      // Create admin user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'forumadmin@test.com', password: 'Str0ng!Pass' });
      const adminUser = await User.findOne({ where: { email: 'forumadmin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      adminId = adminUser.id;
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'forumadmin@test.com', password: 'Str0ng!Pass' });
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

  describe('POST /api/v1/forums', () => {
    skipIfNoDb('should create a forum post and return 201 with title, body, category, and status open', async () => {
      const res = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'AI in Government Contracts',
          body: 'Discussion about emerging AI opportunities in federal contracts.',
          category: 'gov_contracts',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.post).toHaveProperty('id');
      expect(res.body.data.post.title).toBe('AI in Government Contracts');
      expect(res.body.data.post.body).toBe('Discussion about emerging AI opportunities in federal contracts.');
      expect(res.body.data.post.category).toBe('gov_contracts');
      expect(res.body.data.post.status).toBe('open');
    });

    skipIfNoDb('should return 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          body: 'Post body without a title.',
        });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/forums')
        .send({
          title: 'No Auth Post',
          body: 'Should be rejected.',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/forums', () => {
    skipIfNoDb('should return paginated list of forum posts', async () => {
      const res = await request(app)
        .get('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.posts)).toBe(true);
      expect(res.body.data).toHaveProperty('pagination');
    });

    skipIfNoDb('should filter posts by category', async () => {
      // Create a post with a specific category to ensure the filter has data
      await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'AI Jobs Discussion',
          body: 'Trends in AI employment.',
          category: 'ai_jobs',
        });

      const res = await request(app)
        .get('/api/v1/forums?category=ai_jobs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.posts.forEach((post) => {
        expect(post.category).toBe('ai_jobs');
      });
    });
  });

  describe('GET /api/v1/forums/:id', () => {
    skipIfNoDb('should return a single post with comments array', async () => {
      // Create a post first
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Get By ID Test', body: 'Body for get test.' });
      const postId = createRes.body.data.post.id;

      const res = await request(app)
        .get(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.post.id).toBe(postId);
      expect(res.body.data.post.title).toBe('Get By ID Test');
      expect(Array.isArray(res.body.data.post.comments)).toBe(true);
    });
  });

  describe('PUT /api/v1/forums/:id', () => {
    skipIfNoDb('should update post as owner (change title)', async () => {
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Original Title', body: 'Original body.' });
      const postId = createRes.body.data.post.id;

      const res = await request(app)
        .put(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.post.title).toBe('Updated Title');
    });

    skipIfNoDb('should allow admin to change status to closed', async () => {
      // Create post as regular user
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Admin Close Test', body: 'Will be closed by admin.' });
      const postId = createRes.body.data.post.id;

      // Admin changes status to closed
      const res = await request(app)
        .put(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      expect(res.status).toBe(200);
      expect(res.body.data.post.status).toBe('closed');
    });
  });

  describe('DELETE /api/v1/forums/:id', () => {
    skipIfNoDb('should delete post as owner', async () => {
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Delete Test', body: 'To be deleted.' });
      const postId = createRes.body.data.post.id;

      const res = await request(app)
        .delete(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');

      // Verify it is gone
      const getRes = await request(app)
        .get(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('POST /api/v1/forums/:id/comments', () => {
    skipIfNoDb('should add a comment to a post and return 201', async () => {
      // Create a post first
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Comment Test Post', body: 'Post to receive comments.' });
      const postId = createRes.body.data.post.id;

      const res = await request(app)
        .post(`/api/v1/forums/${postId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ body: 'This is a great discussion!' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.comment).toHaveProperty('id');
      expect(res.body.data.comment.body).toBe('This is a great discussion!');
      expect(res.body.data.comment.userId).toBe(userId);
    });

    skipIfNoDb('should reject comment on a closed post with 403', async () => {
      // Create a post
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Closed Post Test', body: 'This will be closed.' });
      const postId = createRes.body.data.post.id;

      // Admin closes the post
      await request(app)
        .put(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'closed' });

      // Try to comment on the closed post
      const res = await request(app)
        .post(`/api/v1/forums/${postId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ body: 'Trying to comment on closed post.' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/forums/:id/comments/:commentId', () => {
    skipIfNoDb('should delete own comment', async () => {
      // Create a post
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Delete Comment Post', body: 'Post with comment to delete.' });
      const postId = createRes.body.data.post.id;

      // Add a comment
      const commentRes = await request(app)
        .post(`/api/v1/forums/${postId}/comments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ body: 'Comment to be deleted.' });
      const commentId = commentRes.body.data.comment.id;

      // Delete the comment
      const res = await request(app)
        .delete(`/api/v1/forums/${postId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
    });
  });
});
