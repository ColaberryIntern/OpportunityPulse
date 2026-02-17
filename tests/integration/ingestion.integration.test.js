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
const { sequelize, UserRole, User, DataSource, Opportunity } = require('../../backend/src/models');

describe('Ingestion Integration Tests', () => {
  let dbAvailable = false;
  let adminToken;
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

      // Create admin user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'ingestadmin@test.com', password: 'Str0ng!Pass' });
      const adminUser = await User.findOne({ where: { email: 'ingestadmin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ingestadmin@test.com', password: 'Str0ng!Pass' });
      adminToken = adminLogin.body.data.accessToken;

      // Create non-admin user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'ingestuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ingestuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;

      // Seed DataSource records
      await DataSource.bulkCreate([
        { name: 'mock_jobs', type: 'mock', config: {}, enabled: true },
        { name: 'mock_investments', type: 'mock', config: {}, enabled: true },
        { name: 'sam_gov', type: 'api', config: { apiKeyEnvVar: 'SAM_GOV_API_KEY' }, enabled: false },
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

  describe('POST /api/v1/ingestion/run/:dataSourceName', () => {
    skipIfNoDb('should return 200 for admin running mock_jobs ingestion', async () => {
      const res = await request(app)
        .post('/api/v1/ingestion/run/mock_jobs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data.summary).toHaveProperty('recordsFetched');
      expect(res.body.data.summary).toHaveProperty('recordsCreated');
      expect(res.body.data.summary.status).toBe('success');
    });

    skipIfNoDb('should create opportunities in database after mock_jobs run', async () => {
      const opps = await Opportunity.findAndCountAll({
        where: { source: 'mock_jobs' },
      });

      expect(opps.count).toBeGreaterThan(0);
      opps.rows.forEach((opp) => {
        expect(opp.type).toBe('ai_job');
        expect(opp.source).toBe('mock_jobs');
      });
    });

    skipIfNoDb('should return 200 for admin running mock_investments ingestion', async () => {
      const res = await request(app)
        .post('/api/v1/ingestion/run/mock_investments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.summary.status).toBe('success');
      expect(res.body.data.summary.recordsCreated).toBeGreaterThan(0);
    });

    skipIfNoDb('should return 404 for unknown data source', async () => {
      const res = await request(app)
        .post('/api/v1/ingestion/run/unknown_source')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    skipIfNoDb('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .post('/api/v1/ingestion/run/mock_jobs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/ingestion/run-all', () => {
    skipIfNoDb('should return 200 for admin and run all enabled sources', async () => {
      const res = await request(app)
        .post('/api/v1/ingestion/run-all')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('summary');
      expect(Array.isArray(res.body.data.summary.results)).toBe(true);
      // Should have run mock_jobs and mock_investments (sam_gov is disabled)
      expect(res.body.data.summary.results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/ingestion/logs', () => {
    skipIfNoDb('should return paginated logs for admin', async () => {
      const res = await request(app)
        .get('/api/v1/ingestion/logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    skipIfNoDb('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .get('/api/v1/ingestion/logs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/ingestion/data-sources', () => {
    skipIfNoDb('should return data source list for admin', async () => {
      const res = await request(app)
        .get('/api/v1/ingestion/data-sources')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.dataSources)).toBe(true);
      expect(res.body.data.dataSources.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Authentication requirements', () => {
    skipIfNoDb('should return 401 without token for all ingestion endpoints', async () => {
      const endpoints = [
        { method: 'post', url: '/api/v1/ingestion/run/mock_jobs' },
        { method: 'post', url: '/api/v1/ingestion/run-all' },
        { method: 'get', url: '/api/v1/ingestion/logs' },
        { method: 'get', url: '/api/v1/ingestion/data-sources' },
      ];

      for (const endpoint of endpoints) {
        const res = await request(app)[endpoint.method](endpoint.url);
        expect(res.status).toBe(401);
      }
    });
  });
});
