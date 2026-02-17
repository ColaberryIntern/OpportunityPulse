const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3095';
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
const { sequelize, UserRole } = require('../../backend/src/models');

describe('Search Integration Tests', () => {
  let dbAvailable = false;
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

      // Create user and get token
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'searchuser@test.com', password: 'Str0ng!Pass' });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'searchuser@test.com', password: 'Str0ng!Pass' });
      userToken = loginRes.body.data.accessToken;

      // Seed content for search
      await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'AI Government Contract Analysis',
          body: 'Deep dive into federal AI procurement trends.',
          category: 'contracts',
          tags: ['AI', 'government', 'federal'],
          status: 'published',
        });

      await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Machine Learning Job Market Report',
          body: 'Analysis of ML engineering positions across industries.',
          category: 'jobs',
          tags: ['ML', 'jobs', 'engineering'],
          status: 'published',
        });

      await request(app)
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Startup Investment Draft',
          body: 'Draft report on AI startup funding rounds.',
          category: 'investments',
          tags: ['AI', 'startups', 'funding'],
          status: 'draft',
        });
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

  describe('GET /api/v1/search', () => {
    skipIfNoDb('should return all content with no filters', async () => {
      const res = await request(app)
        .get('/api/v1/search')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.results)).toBe(true);
      expect(res.body.data.results.length).toBe(3);
      expect(res.body.data).toHaveProperty('pagination');
      expect(res.body.data).toHaveProperty('filters');
    });

    skipIfNoDb('should search by keyword in title', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=Government')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.results[0].title).toContain('Government');
    });

    skipIfNoDb('should search by keyword in body', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=procurement')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThanOrEqual(1);
    });

    skipIfNoDb('should be case-insensitive', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=machine+learning')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThanOrEqual(1);
    });

    skipIfNoDb('should filter by category', async () => {
      const res = await request(app)
        .get('/api/v1/search?category=jobs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBe(1);
      expect(res.body.data.results[0].category).toBe('jobs');
    });

    skipIfNoDb('should filter by status', async () => {
      const res = await request(app)
        .get('/api/v1/search?status=draft')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.results.forEach((item) => {
        expect(item.status).toBe('draft');
      });
    });

    skipIfNoDb('should combine keyword and category filters', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=AI&category=contracts')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThanOrEqual(1);
      res.body.data.results.forEach((item) => {
        expect(item.category).toBe('contracts');
      });
    });

    skipIfNoDb('should return empty results for no match (not 404)', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=xyznonexistent')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
    });

    skipIfNoDb('should respect pagination', async () => {
      const res = await request(app)
        .get('/api/v1/search?page=1&limit=1')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBe(1);
      expect(res.body.data.pagination.limit).toBe(1);
      expect(res.body.data.pagination.pages).toBeGreaterThanOrEqual(3);
    });

    skipIfNoDb('should sort by oldest', async () => {
      const res = await request(app)
        .get('/api/v1/search?sort=oldest')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      const results = res.body.data.results;
      if (results.length > 1) {
        const first = new Date(results[0].created_at);
        const second = new Date(results[1].created_at);
        expect(first.getTime()).toBeLessThanOrEqual(second.getTime());
      }
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/search?q=AI');
      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return applied filters in response', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=AI&category=contracts&status=published')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.filters.q).toBe('AI');
      expect(res.body.data.filters.category).toBe('contracts');
      expect(res.body.data.filters.status).toBe('published');
    });
  });
});
