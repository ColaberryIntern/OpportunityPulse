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
// IMPORTANT: Also set OPENAI_API_KEY so server can load the analysis module
process.env.OPENAI_API_KEY = 'test-key-for-integration';

const { app } = require('../../backend/src/server');
const { sequelize, UserRole, User, Alert } = require('../../backend/src/models');

describe('Alerts Integration Tests', () => {
  let dbAvailable = false;
  let userToken;
  let otherUserToken;
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

      // Create first user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'alertuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alertuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;
      const user = await User.findOne({ where: { email: 'alertuser@test.com' } });
      userId = user.id;

      // Create second user (for isolation tests)
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'otheruser@test.com', password: 'Str0ng!Pass' });
      const otherLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'otheruser@test.com', password: 'Str0ng!Pass' });
      otherUserToken = otherLogin.body.data.accessToken;

      // Seed alerts for first user
      await Alert.bulkCreate([
        { userId, type: 'new_opportunity', title: 'High-score opp', message: 'Scored 95/100', severity: 'important', read: false, metadata: {} },
        { userId, type: 'system', title: 'Ingestion complete', message: 'Mock jobs ingested', severity: 'info', read: false, metadata: {} },
        { userId, type: 'trend_alert', title: 'AI rising', message: 'AI jobs trending up', severity: 'warning', read: true, metadata: {} },
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

  // ── GET /api/v1/alerts ────────────────────────────────────────────────

  describe('GET /api/v1/alerts', () => {
    skipIfNoDb('should return paginated alerts for authenticated user', async () => {
      const res = await request(app)
        .get('/api/v1/alerts')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('pages');
      expect(res.body.pagination.total).toBe(3);
    });

    skipIfNoDb('should filter by type when query param provided', async () => {
      const res = await request(app)
        .get('/api/v1/alerts?type=system')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].type).toBe('system');
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/alerts');

      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/v1/alerts/unread ─────────────────────────────────────────

  describe('GET /api/v1/alerts/unread', () => {
    skipIfNoDb('should return unread count for user', async () => {
      const res = await request(app)
        .get('/api/v1/alerts/unread')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.unreadCount).toBe(2);
    });
  });

  // ── PUT /api/v1/alerts/:id/read ───────────────────────────────────────

  describe('PUT /api/v1/alerts/:id/read', () => {
    skipIfNoDb('should mark an alert as read and return it', async () => {
      // Find an unread alert belonging to the first user
      const unreadAlert = await Alert.findOne({ where: { userId, read: false } });

      const res = await request(app)
        .put(`/api/v1/alerts/${unreadAlert.id}/read`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.alert).toBeDefined();
      expect(res.body.data.alert.id).toBe(unreadAlert.id);
      expect(res.body.data.alert.read).toBe(true);
    });

    skipIfNoDb('should return 404 for another user\'s alert', async () => {
      // Get any alert owned by the first user
      const alert = await Alert.findOne({ where: { userId } });

      const res = await request(app)
        .put(`/api/v1/alerts/${alert.id}/read`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ── PUT /api/v1/alerts/read-all ───────────────────────────────────────

  describe('PUT /api/v1/alerts/read-all', () => {
    skipIfNoDb('should mark all alerts as read', async () => {
      const res = await request(app)
        .put('/api/v1/alerts/read-all')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('updatedCount');
      expect(typeof res.body.data.updatedCount).toBe('number');
    });

    skipIfNoDb('should confirm unread count is 0 after mark-all-read', async () => {
      const res = await request(app)
        .get('/api/v1/alerts/unread')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(0);
    });
  });

  // ── DELETE /api/v1/alerts/:id ─────────────────────────────────────────

  describe('DELETE /api/v1/alerts/:id', () => {
    skipIfNoDb('should delete an alert', async () => {
      const alert = await Alert.findOne({ where: { userId } });

      const res = await request(app)
        .delete(`/api/v1/alerts/${alert.id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toBeNull();

      // Confirm the alert no longer exists
      const deleted = await Alert.findByPk(alert.id);
      expect(deleted).toBeNull();
    });

    skipIfNoDb('should return 404 for non-existent alert', async () => {
      const res = await request(app)
        .delete('/api/v1/alerts/999999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });
});
