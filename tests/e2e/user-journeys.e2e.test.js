const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3090';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'opportunity_pulse_test';
process.env.DB_USER = 'opportunity_pulse';
process.env.DB_PASSWORD = 'dev_password_change_me';
process.env.JWT_SECRET = 'e2e-test-secret-key-minimum-32-characters-long';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.BCRYPT_ROUNDS = '10';
process.env.FRONTEND_URL = 'http://localhost:3002';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOG_LEVEL = 'error';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

const { app } = require('../../backend/src/server');
const { sequelize, User, UserRole, DataSource, Opportunity } = require('../../backend/src/models');

describe('E2E User Journeys', () => {
  let dbAvailable = false;

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
    } catch (error) {
      console.warn('Database not available, skipping E2E tests:', error.message);
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

  describe('Journey 1: Registration → Verify → Login → Dashboard → Create Content → Search', () => {
    skipIfNoDb('should complete full user journey', async () => {
      // Step 1: Register
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'journey1@test.com', password: 'Str0ng!Pass' });
      expect(registerRes.status).toBe(201);
      expect(registerRes.body.data).toHaveProperty('userId');

      // Step 2: Verify email
      const user = await User.findOne({ where: { email: 'journey1@test.com' } });
      const verifyRes = await request(app)
        .get(`/api/v1/auth/verify/${user.verificationToken}`);
      expect(verifyRes.status).toBe(200);

      // Step 3: Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'journey1@test.com', password: 'Str0ng!Pass' });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.data.accessToken;
      expect(token).toBeTruthy();

      // Step 4: View dashboard
      const dashRes = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Authorization', `Bearer ${token}`);
      expect(dashRes.status).toBe(200);
      expect(dashRes.body.data.stats.totalUsers).toBeGreaterThanOrEqual(1);

      // Step 5: Create content
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'E2E Test Article',
          body: 'This content was created during an E2E test journey.',
          category: 'testing',
          tags: ['e2e', 'automated'],
          status: 'published',
        });
      expect(createRes.status).toBe(201);
      const contentId = createRes.body.data.content.id;

      // Step 6: Search for that content
      const searchRes = await request(app)
        .get('/api/v1/search?q=E2E+Test')
        .set('Authorization', `Bearer ${token}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.results.length).toBeGreaterThanOrEqual(1);
      expect(searchRes.body.data.results.some((r) => r.id === contentId)).toBe(true);

      // Step 7: View activity
      const activityRes = await request(app)
        .get('/api/v1/dashboard/activity')
        .set('Authorization', `Bearer ${token}`);
      expect(activityRes.status).toBe(200);
    });
  });

  describe('Journey 2: Admin Role Assignment Flow', () => {
    skipIfNoDb('should allow admin to manage roles', async () => {
      // Register two users
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'admin-j2@test.com', password: 'Str0ng!Pass' });
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'user-j2@test.com', password: 'Str0ng!Pass' });

      // Promote first user to admin
      const adminUser = await User.findOne({ where: { email: 'admin-j2@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();

      // Login as admin
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin-j2@test.com', password: 'Str0ng!Pass' });
      const adminToken = adminLogin.body.data.accessToken;

      // List roles
      const rolesRes = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(rolesRes.status).toBe(200);
      expect(rolesRes.body.data.roles.length).toBe(4);

      // Assign auditor role to user
      const targetUser = await User.findOne({ where: { email: 'user-j2@test.com' } });
      const assignRes = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: targetUser.id, roleId: 3 }); // auditor
      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.user.roleId).toBe(3);

      // Verify user cannot access role management
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user-j2@test.com', password: 'Str0ng!Pass' });
      const userToken = userLogin.body.data.accessToken;

      const forbiddenRes = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${userToken}`);
      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe('Journey 3: Content CRUD Lifecycle', () => {
    skipIfNoDb('should create, read, update, and delete content', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'crud-j3@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'crud-j3@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Create
      const createRes = await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'CRUD Test', body: 'Initial body.', status: 'draft' });
      expect(createRes.status).toBe(201);
      const id = createRes.body.data.content.id;

      // Read
      const readRes = await request(app)
        .get(`/api/v1/content/${id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(readRes.status).toBe(200);
      expect(readRes.body.data.content.title).toBe('CRUD Test');

      // Update
      const updateRes = await request(app)
        .put(`/api/v1/content/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'CRUD Updated', status: 'published' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.content.title).toBe('CRUD Updated');
      expect(updateRes.body.data.content.status).toBe('published');

      // List (should appear in published filter)
      const listRes = await request(app)
        .get('/api/v1/content?status=published')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.content.some((c) => c.id === id)).toBe(true);

      // Delete
      const deleteRes = await request(app)
        .delete(`/api/v1/content/${id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.status).toBe(200);

      // Verify deleted (soft delete — not found)
      const afterDelete = await request(app)
        .get(`/api/v1/content/${id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(afterDelete.status).toBe(404);
    });
  });

  describe('Journey 4: Unauthorized Access Prevention', () => {
    skipIfNoDb('should block all protected routes without auth', async () => {
      const protectedRoutes = [
        { method: 'get', path: '/api/v1/dashboard/stats' },
        { method: 'get', path: '/api/v1/dashboard/activity' },
        { method: 'get', path: '/api/v1/content' },
        { method: 'post', path: '/api/v1/content' },
        { method: 'get', path: '/api/v1/search' },
        { method: 'get', path: '/api/v1/roles' },
        { method: 'get', path: '/api/v1/auth/me' },
        { method: 'put', path: '/api/v1/auth/profile' },
        { method: 'get', path: '/api/v1/opportunities' },
        { method: 'get', path: '/api/v1/alerts' },
        { method: 'post', path: '/api/v1/feedback' },
        { method: 'post', path: '/api/v1/forums' },
        { method: 'get', path: '/api/v1/alert-preferences' },
      ];

      for (const route of protectedRoutes) {
        const res = await request(app)[route.method](route.path);
        expect(res.status).toBe(401);
      }
    });

    skipIfNoDb('should block non-admin from role endpoints', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'nonadmin-j4@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonadmin-j4@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      const rolesRes = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${token}`);
      expect(rolesRes.status).toBe(403);

      const assignRes = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 1, roleId: 1 });
      expect(assignRes.status).toBe(403);
    });
  });

  describe('Journey 5: Search with Multiple Filters', () => {
    skipIfNoDb('should search and filter across content', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'search-j5@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'search-j5@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Create diverse content
      await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Federal AI Procurement', body: 'Federal procurement analysis.', category: 'contracts', tags: ['AI', 'federal'], status: 'published' });
      await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'State AI Budget', body: 'State-level AI budget review.', category: 'contracts', tags: ['AI', 'state'], status: 'draft' });
      await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'ML Engineer Salaries', body: 'Compensation trends.', category: 'jobs', tags: ['ML', 'salaries'], status: 'published' });

      // Search by keyword
      const keywordRes = await request(app)
        .get('/api/v1/search?q=AI')
        .set('Authorization', `Bearer ${token}`);
      expect(keywordRes.status).toBe(200);
      expect(keywordRes.body.data.results.length).toBeGreaterThanOrEqual(2);

      // Search by keyword + category
      const comboRes = await request(app)
        .get('/api/v1/search?q=AI&category=contracts')
        .set('Authorization', `Bearer ${token}`);
      expect(comboRes.status).toBe(200);
      comboRes.body.data.results.forEach((r) => {
        expect(r.category).toBe('contracts');
      });

      // Search by keyword + status
      const statusRes = await request(app)
        .get('/api/v1/search?q=AI&status=published')
        .set('Authorization', `Bearer ${token}`);
      expect(statusRes.status).toBe(200);
      statusRes.body.data.results.forEach((r) => {
        expect(r.status).toBe('published');
      });

      // Sort oldest
      const oldestRes = await request(app)
        .get('/api/v1/search?sort=oldest')
        .set('Authorization', `Bearer ${token}`);
      expect(oldestRes.status).toBe(200);
      const results = oldestRes.body.data.results;
      if (results.length > 1) {
        expect(new Date(results[0].created_at).getTime())
          .toBeLessThanOrEqual(new Date(results[1].created_at).getTime());
      }
    });
  });

  describe('Journey 6: Health Check', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('healthy');
    });
  });

  describe('Journey 7: Opportunity Browse & Alert Management', () => {
    skipIfNoDb('should browse opportunities and manage alerts', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'opp-j7@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'opp-j7@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Browse opportunities (may be empty but should return 200)
      const listRes = await request(app)
        .get('/api/v1/opportunities')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveProperty('opportunities');

      // Filter by type
      const filterRes = await request(app)
        .get('/api/v1/opportunities?type=gov_contract')
        .set('Authorization', `Bearer ${token}`);
      expect(filterRes.status).toBe(200);

      // View alerts (may be empty)
      const alertsRes = await request(app)
        .get('/api/v1/alerts')
        .set('Authorization', `Bearer ${token}`);
      expect(alertsRes.status).toBe(200);

      // Mark all alerts as read
      const readAllRes = await request(app)
        .put('/api/v1/alerts/read-all')
        .set('Authorization', `Bearer ${token}`);
      expect(readAllRes.status).toBe(200);

      // Check unread count is 0
      const unreadRes = await request(app)
        .get('/api/v1/alerts/unread')
        .set('Authorization', `Bearer ${token}`);
      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.data.unreadCount).toBe(0);
    });
  });

  describe('Journey 8: Feedback Submission & Stats', () => {
    skipIfNoDb('should create, read, update, and delete feedback', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'feedback-j8@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'feedback-j8@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Create feedback
      const createRes = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 5, type: 'platform', comments: 'Excellent platform!' });
      expect(createRes.status).toBe(201);
      const feedbackId = createRes.body.data.feedback.id;

      // List feedback
      const listRes = await request(app)
        .get('/api/v1/feedback')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.feedback.some((f) => f.id === feedbackId)).toBe(true);

      // Get stats
      const statsRes = await request(app)
        .get('/api/v1/feedback/stats')
        .set('Authorization', `Bearer ${token}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.data.stats).toHaveProperty('averageScore');

      // Update feedback
      const updateRes = await request(app)
        .put(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ score: 3 });
      expect(updateRes.status).toBe(200);

      // Verify update
      const getRes = await request(app)
        .get(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.feedback.score).toBe(3);

      // Delete
      const deleteRes = await request(app)
        .delete(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(deleteRes.status).toBe(200);

      // Verify deleted
      const afterDelete = await request(app)
        .get(`/api/v1/feedback/${feedbackId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(afterDelete.status).toBe(404);
    });
  });

  describe('Journey 9: Forum Post & Comment Flow', () => {
    skipIfNoDb('should create post, add comments, and clean up', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'forum-j9@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'forum-j9@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Create forum post
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'E2E Test Discussion', body: 'Testing the forum system end-to-end.', category: 'ai_jobs' });
      expect(createRes.status).toBe(201);
      const postId = createRes.body.data.post.id;

      // List posts
      const listRes = await request(app)
        .get('/api/v1/forums')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.posts.some((p) => p.id === postId)).toBe(true);

      // Get post detail (empty comments)
      const detailRes = await request(app)
        .get(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.post.comments).toEqual([]);

      // Add comment
      const commentRes = await request(app)
        .post(`/api/v1/forums/${postId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Great discussion topic!' });
      expect(commentRes.status).toBe(201);
      const commentId = commentRes.body.data.comment.id;

      // Verify comment appears
      const withComment = await request(app)
        .get(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(withComment.body.data.post.comments.length).toBe(1);

      // Delete comment
      const delComment = await request(app)
        .delete(`/api/v1/forums/${postId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delComment.status).toBe(200);

      // Delete post
      const delPost = await request(app)
        .delete(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delPost.status).toBe(200);
    });
  });

  describe('Journey 10: Opportunity Browsing & Filtering', () => {
    skipIfNoDb('should browse, filter, paginate, and view opportunity details', async () => {
      // Seed a DataSource and Opportunities for this journey
      const dataSource = await DataSource.create({
        name: 'e2e_test_source',
        type: 'mock',
        enabled: true,
        config: {},
      });

      await Opportunity.bulkCreate([
        {
          type: 'gov_contract',
          title: 'Federal AI Infrastructure Contract',
          description: 'Large-scale AI infrastructure deployment for federal agencies.',
          source: 'e2e_test_source',
          sourceId: 'e2e-gov-001',
          sourceUrl: 'https://example.gov/contracts/e2e-gov-001',
          status: 'active',
          category: 'infrastructure',
          tags: ['AI', 'federal', 'infrastructure'],
          location: 'Washington, DC',
          value: 5000000.00,
          publishedAt: new Date(),
          dataSourceId: dataSource.id,
        },
        {
          type: 'gov_contract',
          title: 'State Cybersecurity Modernization',
          description: 'Cybersecurity modernization initiative for state agencies.',
          source: 'e2e_test_source',
          sourceId: 'e2e-gov-002',
          sourceUrl: 'https://example.gov/contracts/e2e-gov-002',
          status: 'active',
          category: 'cybersecurity',
          tags: ['cybersecurity', 'state'],
          location: 'Austin, TX',
          value: 2000000.00,
          publishedAt: new Date(),
          dataSourceId: dataSource.id,
        },
        {
          type: 'ai_job',
          title: 'Senior ML Engineer - NLP Team',
          description: 'Seeking an experienced ML engineer for the NLP research team.',
          source: 'e2e_test_source',
          sourceId: 'e2e-job-001',
          sourceUrl: 'https://example.com/jobs/e2e-job-001',
          status: 'active',
          category: 'engineering',
          tags: ['ML', 'NLP', 'engineering'],
          location: 'San Francisco, CA',
          value: 250000.00,
          publishedAt: new Date(),
          dataSourceId: dataSource.id,
        },
      ]);

      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'opp-browse-j10@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'opp-browse-j10@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Step 1: GET all opportunities — verify 200, results array, and pagination
      const allRes = await request(app)
        .get('/api/v1/opportunities')
        .set('Authorization', `Bearer ${token}`);
      expect(allRes.status).toBe(200);
      expect(Array.isArray(allRes.body.data.results)).toBe(true);
      expect(allRes.body).toHaveProperty('pagination');
      expect(allRes.body.pagination).toHaveProperty('total');
      expect(allRes.body.pagination).toHaveProperty('page');
      expect(allRes.body.pagination).toHaveProperty('limit');
      expect(allRes.body.pagination).toHaveProperty('pages');
      expect(allRes.body.pagination.total).toBeGreaterThanOrEqual(3);

      // Step 2: Filter by type=gov_contract — verify filtered results
      const govRes = await request(app)
        .get('/api/v1/opportunities?type=gov_contract')
        .set('Authorization', `Bearer ${token}`);
      expect(govRes.status).toBe(200);
      expect(govRes.body.data.results.length).toBeGreaterThanOrEqual(2);
      govRes.body.data.results.forEach((opp) => {
        expect(opp.type).toBe('gov_contract');
      });

      // Step 3: Filter by status=active — verify status filter
      const activeRes = await request(app)
        .get('/api/v1/opportunities?status=active')
        .set('Authorization', `Bearer ${token}`);
      expect(activeRes.status).toBe(200);
      expect(activeRes.body.data.results.length).toBeGreaterThanOrEqual(3);
      activeRes.body.data.results.forEach((opp) => {
        expect(opp.status).toBe('active');
      });

      // Step 4: Verify pagination parameters — page=1&limit=2
      const pageRes = await request(app)
        .get('/api/v1/opportunities?page=1&limit=2')
        .set('Authorization', `Bearer ${token}`);
      expect(pageRes.status).toBe(200);
      expect(pageRes.body.data.results.length).toBeLessThanOrEqual(2);
      expect(pageRes.body.pagination.page).toBe(1);
      expect(pageRes.body.pagination.limit).toBe(2);
      expect(pageRes.body.pagination.pages).toBeGreaterThanOrEqual(2);

      // Step 5: GET detail for the first opportunity
      const firstOpp = allRes.body.data.results[0];
      const detailRes = await request(app)
        .get(`/api/v1/opportunities/${firstOpp.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.opportunity).toHaveProperty('id', firstOpp.id);
      expect(detailRes.body.data.opportunity).toHaveProperty('title');
      expect(detailRes.body.data.opportunity).toHaveProperty('type');
      expect(detailRes.body.data.opportunity).toHaveProperty('status');
      expect(detailRes.body.data.opportunity).toHaveProperty('description');
    });
  });

  describe('Journey 11: Forum Post Lifecycle', () => {
    skipIfNoDb('should create post, list, view detail, add comment, and verify comment appears', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'forum-j11@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'forum-j11@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Step 1: Create a forum post
      const createRes = await request(app)
        .post('/api/v1/forums')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'E2E Test Post', body: 'Testing forum lifecycle', category: 'general' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.data.post).toHaveProperty('id');
      expect(createRes.body.data.post.title).toBe('E2E Test Post');
      const postId = createRes.body.data.post.id;

      // Step 2: Verify the post appears in the list
      const listRes = await request(app)
        .get('/api/v1/forums')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.posts.some((p) => p.id === postId)).toBe(true);

      // Step 3: View post detail
      const detailRes = await request(app)
        .get(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.post.id).toBe(postId);
      expect(detailRes.body.data.post.title).toBe('E2E Test Post');
      expect(detailRes.body.data.post.body).toBe('Testing forum lifecycle');
      expect(detailRes.body.data.post.category).toBe('general');
      expect(detailRes.body.data.post.comments).toEqual([]);

      // Step 4: Add a comment
      const commentRes = await request(app)
        .post(`/api/v1/forums/${postId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Test comment' });
      expect(commentRes.status).toBe(201);
      expect(commentRes.body.data.comment).toHaveProperty('id');
      expect(commentRes.body.data.comment.body).toBe('Test comment');

      // Step 5: Verify comment appears on post detail
      const afterCommentRes = await request(app)
        .get(`/api/v1/forums/${postId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(afterCommentRes.status).toBe(200);
      expect(afterCommentRes.body.data.post.comments.length).toBe(1);
      expect(afterCommentRes.body.data.post.comments[0].body).toBe('Test comment');
    });
  });

  describe('Journey 12: Subscription & Premium Gating', () => {
    skipIfNoDb('should verify free plan, block premium endpoint, upgrade, access premium, downgrade', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'sub-j12@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'sub-j12@test.com', password: 'Str0ng!Pass' });
      const token = loginRes.body.data.accessToken;

      // Step 1: Check current subscription — should be null (no subscription = free)
      const subRes = await request(app)
        .get('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${token}`);
      expect(subRes.status).toBe(200);
      // New user has no subscription record — treated as free
      const currentSub = subRes.body.data.subscription;
      if (currentSub) {
        expect(currentSub.planType).toBe('free');
      } else {
        expect(currentSub).toBeNull();
      }

      // Step 2: Try premium-gated endpoint (GET /analysis/trends/gov_contract) — expect 403
      const premiumBlockedRes = await request(app)
        .get('/api/v1/analysis/trends/gov_contract')
        .set('Authorization', `Bearer ${token}`);
      expect(premiumBlockedRes.status).toBe(403);
      expect(premiumBlockedRes.body.errors).toBeDefined();
      expect(premiumBlockedRes.body.errors.some((e) => e.upgradeRequired === true)).toBe(true);

      // Step 3: Upgrade to premium
      const upgradeRes = await request(app)
        .post('/api/v1/subscriptions/upgrade')
        .set('Authorization', `Bearer ${token}`);
      expect(upgradeRes.status).toBe(201);
      expect(upgradeRes.body.data.subscription.planType).toBe('premium');

      // Step 4: Verify subscription is now premium
      const premiumSubRes = await request(app)
        .get('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${token}`);
      expect(premiumSubRes.status).toBe(200);
      expect(premiumSubRes.body.data.subscription.planType).toBe('premium');

      // Step 5: Try the same premium endpoint again — should NOT return 403 upgradeRequired
      const premiumAllowedRes = await request(app)
        .get('/api/v1/analysis/trends/gov_contract')
        .set('Authorization', `Bearer ${token}`);
      expect(premiumAllowedRes.status).not.toBe(403);

      // Step 6: Downgrade back to free
      const downgradeRes = await request(app)
        .post('/api/v1/subscriptions/downgrade')
        .set('Authorization', `Bearer ${token}`);
      expect(downgradeRes.status).toBe(200);
      expect(downgradeRes.body.data.subscription.planType).toBe('free');

      // Step 7: Verify subscription is back to free
      const freeSubRes = await request(app)
        .get('/api/v1/subscriptions')
        .set('Authorization', `Bearer ${token}`);
      expect(freeSubRes.status).toBe(200);
      expect(freeSubRes.body.data.subscription.planType).toBe('free');

      // Step 8: Verify premium endpoint is blocked again after downgrade
      const blockedAgainRes = await request(app)
        .get('/api/v1/analysis/trends/gov_contract')
        .set('Authorization', `Bearer ${token}`);
      expect(blockedAgainRes.status).toBe(403);
      expect(blockedAgainRes.body.errors.some((e) => e.upgradeRequired === true)).toBe(true);
    });
  });
});
