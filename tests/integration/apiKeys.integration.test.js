const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3101';
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

describe('API Keys Integration Tests', () => {
  let dbAvailable = false;
  let userToken;
  let createdKeyId;

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
        .send({ email: 'apikeyuser@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'apikeyuser@test.com', password: 'Str0ng!Pass' });
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

  // ── GET /api/v1/api-keys ────────────────────────────────────────────

  describe('GET /api/v1/api-keys', () => {
    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/api-keys');

      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/v1/api-keys ───────────────────────────────────────────

  describe('POST /api/v1/api-keys', () => {
    skipIfNoDb('should create an API key and return 201 with key value', async () => {
      const res = await request(app)
        .post('/api/v1/api-keys')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'My Test Key', scopes: ['read', 'write'] });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('apiKey');
      expect(res.body.data.apiKey).toMatch(/^op_/);
      expect(res.body.data).toHaveProperty('record');
      expect(res.body.data.record).toHaveProperty('id');
      expect(res.body.data.record).toHaveProperty('name', 'My Test Key');
      expect(res.body.data.record).toHaveProperty('keyPrefix');
      expect(res.body.data.record.scopes).toEqual(['read', 'write']);

      // Store ID for subsequent tests
      createdKeyId = res.body.data.record.id;
    });
  });

  // ── GET /api/v1/api-keys (list after create) ────────────────────────

  describe('GET /api/v1/api-keys (list)', () => {
    skipIfNoDb('should list API keys without exposing the plaintext key or hash', async () => {
      const res = await request(app)
        .get('/api/v1/api-keys')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('apiKeys');
      expect(Array.isArray(res.body.data.apiKeys)).toBe(true);
      expect(res.body.data.apiKeys.length).toBeGreaterThanOrEqual(1);

      // Verify no plaintext key or hash is exposed
      const responseBody = JSON.stringify(res.body);
      expect(responseBody).not.toContain('keyHash');
      expect(responseBody).not.toContain('key_hash');

      // Verify the created key appears in the list
      const found = res.body.data.apiKeys.find((k) => k.id === createdKeyId);
      expect(found).toBeDefined();
      expect(found.name).toBe('My Test Key');
    });
  });

  // ── PATCH /api/v1/api-keys/:id ──────────────────────────────────────

  describe('PATCH /api/v1/api-keys/:id', () => {
    skipIfNoDb('should update API key name via PATCH', async () => {
      const res = await request(app)
        .patch(`/api/v1/api-keys/${createdKeyId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Renamed Key' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('apiKey');
      expect(res.body.data.apiKey.name).toBe('Renamed Key');
    });
  });

  // ── DELETE /api/v1/api-keys/:id ─────────────────────────────────────

  describe('DELETE /api/v1/api-keys/:id', () => {
    skipIfNoDb('should revoke API key via DELETE, then GET should not list it as active', async () => {
      const deleteRes = await request(app)
        .delete(`/api/v1/api-keys/${createdKeyId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.status).toBe('success');
      expect(deleteRes.body.data).toHaveProperty('apiKey');
      expect(deleteRes.body.data.apiKey.isActive).toBe(false);

      // Verify the key is still in the list but marked inactive
      const listRes = await request(app)
        .get('/api/v1/api-keys')
        .set('Authorization', `Bearer ${userToken}`);

      expect(listRes.status).toBe(200);
      const revokedKey = listRes.body.data.apiKeys.find((k) => k.id === createdKeyId);
      if (revokedKey) {
        expect(revokedKey.isActive).toBe(false);
      }
    });
  });
});
