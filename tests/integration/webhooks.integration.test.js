const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3102';
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

describe('Webhooks Integration Tests', () => {
  let dbAvailable = false;
  let userToken;
  let createdWebhookId;

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
        .send({ email: 'webhookuser@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'webhookuser@test.com', password: 'Str0ng!Pass' });
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

  // ── GET /api/v1/webhooks (auth check) ───────────────────────────────

  describe('GET /api/v1/webhooks', () => {
    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/webhooks');

      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/v1/webhooks ───────────────────────────────────────────

  describe('POST /api/v1/webhooks', () => {
    skipIfNoDb('should create webhook and return 201 with secret', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          url: 'https://example.com/webhook-receiver',
          eventTypes: ['opportunity.created', 'alert.created'],
          description: 'Test webhook for integration tests',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('webhook');
      expect(res.body.data).toHaveProperty('secret');
      expect(typeof res.body.data.secret).toBe('string');
      expect(res.body.data.secret.length).toBeGreaterThan(0);
      expect(res.body.data.webhook).toHaveProperty('id');
      expect(res.body.data.webhook.url).toBe('https://example.com/webhook-receiver');
      expect(res.body.data.webhook.eventTypes).toEqual(['opportunity.created', 'alert.created']);
      expect(res.body.data.webhook.description).toBe('Test webhook for integration tests');
      expect(res.body.data.webhook.isActive).toBe(true);

      // Store ID for subsequent tests
      createdWebhookId = res.body.data.webhook.id;
    });
  });

  // ── GET /api/v1/webhooks (list after create) ────────────────────────

  describe('GET /api/v1/webhooks (list)', () => {
    skipIfNoDb('should list webhooks including the created one', async () => {
      const res = await request(app)
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('webhooks');
      expect(Array.isArray(res.body.data.webhooks)).toBe(true);
      expect(res.body.data.webhooks.length).toBeGreaterThanOrEqual(1);

      const found = res.body.data.webhooks.find((w) => w.id === createdWebhookId);
      expect(found).toBeDefined();
      expect(found.url).toBe('https://example.com/webhook-receiver');

      // Secret should not be exposed in list
      const responseBody = JSON.stringify(res.body);
      expect(responseBody).not.toContain('secret');
    });
  });

  // ── PUT /api/v1/webhooks/:id ────────────────────────────────────────

  describe('PUT /api/v1/webhooks/:id', () => {
    skipIfNoDb('should update webhook URL and description', async () => {
      const res = await request(app)
        .put(`/api/v1/webhooks/${createdWebhookId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          url: 'https://example.com/updated-webhook',
          description: 'Updated description',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('webhook');
      expect(res.body.data.webhook.url).toBe('https://example.com/updated-webhook');
      expect(res.body.data.webhook.description).toBe('Updated description');
    });
  });

  // ── GET /api/v1/webhooks/:id/deliveries ─────────────────────────────

  describe('GET /api/v1/webhooks/:id/deliveries', () => {
    skipIfNoDb('should return 200 with empty delivery log initially', async () => {
      const res = await request(app)
        .get(`/api/v1/webhooks/${createdWebhookId}/deliveries`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('deliveries');
      expect(Array.isArray(res.body.data.deliveries)).toBe(true);
      expect(res.body.data.deliveries.length).toBe(0);
      expect(res.body).toHaveProperty('pagination');
    });
  });

  // ── DELETE /api/v1/webhooks/:id ─────────────────────────────────────

  describe('DELETE /api/v1/webhooks/:id', () => {
    skipIfNoDb('should delete webhook and verify it is gone from list', async () => {
      const deleteRes = await request(app)
        .delete(`/api/v1/webhooks/${createdWebhookId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.status).toBe('success');

      // Verify webhook is no longer in the list
      const listRes = await request(app)
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${userToken}`);

      expect(listRes.status).toBe(200);
      const found = listRes.body.data.webhooks.find((w) => w.id === createdWebhookId);
      expect(found).toBeUndefined();
    });
  });
});
