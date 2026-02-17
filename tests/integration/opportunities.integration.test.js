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
const { sequelize, UserRole, User, DataSource, Opportunity } = require('../../backend/src/models');

describe('Opportunities Integration Tests', () => {
  let dbAvailable = false;
  let userToken;
  let adminToken;

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
        .send({ email: 'oppuser@test.com', password: 'Str0ng!Pass' });
      const userLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'oppuser@test.com', password: 'Str0ng!Pass' });
      userToken = userLogin.body.data.accessToken;

      // Create admin user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'oppadmin@test.com', password: 'Str0ng!Pass' });
      const adminUser = await User.findOne({ where: { email: 'oppadmin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'oppadmin@test.com', password: 'Str0ng!Pass' });
      adminToken = adminLogin.body.data.accessToken;

      // Seed DataSource
      await DataSource.bulkCreate([
        { name: 'sam_gov', type: 'api', config: {}, enabled: true },
        { name: 'mock_jobs', type: 'mock', config: {}, enabled: true },
        { name: 'mock_investments', type: 'mock', config: {}, enabled: true },
      ]);

      // Seed sample Opportunities
      await Opportunity.bulkCreate([
        {
          type: 'gov_contract',
          title: 'Federal Cloud Migration Services',
          description: 'Cloud infrastructure modernization for DoD systems.',
          source: 'sam_gov',
          sourceId: 'SAM-001',
          status: 'active',
          category: 'IT',
          value: 5000000.00,
          publishedAt: new Date('2026-01-15'),
          expiresAt: new Date('2026-03-15'),
          aiScore: 85.5,
          sourceData: { naicsCode: '541512', setAside: 'SBA' },
          dataSourceId: 1,
        },
        {
          type: 'gov_contract',
          title: 'AI Analytics Platform for Intelligence Community',
          description: 'Develop ML-based analytics dashboard for IC agencies.',
          source: 'sam_gov',
          sourceId: 'SAM-002',
          status: 'active',
          category: 'IT',
          value: 12000000.00,
          publishedAt: new Date('2026-02-01'),
          expiresAt: new Date('2026-04-01'),
          aiScore: 92.0,
          sourceData: { naicsCode: '541511' },
          dataSourceId: 1,
        },
        {
          type: 'ai_job',
          title: 'Senior ML Engineer',
          description: 'Build and deploy machine learning models at scale.',
          source: 'mock_jobs',
          sourceId: 'JOB-001',
          status: 'active',
          category: 'Engineering',
          location: 'San Francisco, CA',
          publishedAt: new Date('2026-02-10'),
          aiScore: 78.0,
          sourceData: { skills: ['Python', 'TensorFlow', 'Kubernetes'] },
          dataSourceId: 2,
        },
        {
          type: 'ai_job',
          title: 'NLP Research Scientist',
          description: 'Research and develop natural language processing models.',
          source: 'mock_jobs',
          sourceId: 'JOB-002',
          status: 'closed',
          category: 'Research',
          location: 'New York, NY',
          publishedAt: new Date('2026-01-05'),
          aiScore: 88.0,
          sourceData: { skills: ['PyTorch', 'NLP', 'Transformers'] },
          dataSourceId: 2,
        },
        {
          type: 'investment',
          title: 'AI Startup Series A - NeuralVision',
          description: 'Computer vision startup raising Series A.',
          source: 'mock_investments',
          sourceId: 'INV-001',
          status: 'active',
          category: 'AI/ML',
          value: 8000000.00,
          publishedAt: new Date('2026-02-05'),
          aiScore: 71.0,
          sourceData: { round: 'Series A', investors: ['Sequoia', 'a16z'] },
          dataSourceId: 3,
        },
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

  describe('GET /api/v1/opportunities', () => {
    skipIfNoDb('should return 200 with paginated list', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.results)).toBe(true);
      expect(res.body.data.results.length).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('pages');
    });

    skipIfNoDb('should filter by type=gov_contract', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?type=gov_contract')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.results.forEach((opp) => {
        expect(opp.type).toBe('gov_contract');
      });
    });

    skipIfNoDb('should filter by type=ai_job', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?type=ai_job')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.results.forEach((opp) => {
        expect(opp.type).toBe('ai_job');
      });
    });

    skipIfNoDb('should search by keyword in title and description', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?q=machine+learning')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeGreaterThanOrEqual(1);
      // At least one result should contain the keyword in title or description
      const matchFound = res.body.data.results.some(
        (opp) =>
          opp.title.toLowerCase().includes('machine learning') ||
          (opp.description && opp.description.toLowerCase().includes('machine learning'))
      );
      expect(matchFound).toBe(true);
    });

    skipIfNoDb('should filter by category=IT', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?category=IT')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.results.forEach((opp) => {
        expect(opp.category).toBe('IT');
      });
    });

    skipIfNoDb('should filter by status=active (default)', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?status=active')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      res.body.data.results.forEach((opp) => {
        expect(opp.status).toBe('active');
      });
    });

    skipIfNoDb('should sort by oldest correctly', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?sort=oldest&status=active')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      const opps = res.body.data.opportunities;
      if (opps.length > 1) {
        const first = new Date(opps[0].publishedAt || opps[0].published_at);
        const second = new Date(opps[1].publishedAt || opps[1].published_at);
        expect(first.getTime()).toBeLessThanOrEqual(second.getTime());
      }
    });

    skipIfNoDb('should sort by AI score', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?sort=score&status=active')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      const opps = res.body.data.opportunities;
      if (opps.length > 1) {
        const firstScore = parseFloat(opps[0].aiScore || opps[0].ai_score);
        const secondScore = parseFloat(opps[1].aiScore || opps[1].ai_score);
        expect(firstScore).toBeGreaterThanOrEqual(secondScore);
      }
    });

    skipIfNoDb('should paginate correctly with page=1&limit=2', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?page=1&limit=2')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.page).toBe(1);
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/opportunities');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/opportunities/:id', () => {
    skipIfNoDb('should return 200 for existing opportunity', async () => {
      // Get the list first to find a valid id
      const listRes = await request(app)
        .get('/api/v1/opportunities')
        .set('Authorization', `Bearer ${userToken}`);

      const oppId = listRes.body.data.results[0].id;

      const res = await request(app)
        .get(`/api/v1/opportunities/${oppId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.opportunity).toHaveProperty('id', oppId);
      expect(res.body.data.opportunity).toHaveProperty('title');
      expect(res.body.data.opportunity).toHaveProperty('type');
      expect(res.body.data.opportunity).toHaveProperty('source');
    });

    skipIfNoDb('should return 404 for non-existent opportunity', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities/99999')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/opportunities/stats', () => {
    skipIfNoDb('should return aggregated stats', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('stats');
      expect(res.body.data.stats).toHaveProperty('byType');
      expect(res.body.data.stats).toHaveProperty('byStatus');
      expect(res.body.data.stats).toHaveProperty('total');
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/opportunities/stats');

      expect(res.status).toBe(401);
    });
  });
});
