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
process.env.OPENAI_API_KEY = 'test-key-for-integration';

const { app } = require('../../backend/src/server');
const { sequelize, UserRole, Opportunity, DataSource } = require('../../backend/src/models');

describe('Public Opportunities Integration Tests', () => {
  let dbAvailable = false;
  let activeGovId;
  let closedOppId;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ force: true });

      // Seed roles (required by model associations even though public routes skip auth)
      await UserRole.bulkCreate([
        { roleName: 'admin', description: 'Full access' },
        { roleName: 'consultant', description: 'Standard user' },
        { roleName: 'auditor', description: 'Compliance access' },
        { roleName: 'devops', description: 'Infrastructure access' },
      ]);

      dbAvailable = true;

      // Seed DataSources
      await DataSource.bulkCreate([
        { name: 'sam_gov', type: 'api', config: {}, enabled: true },
        { name: 'mock_jobs', type: 'mock', config: {}, enabled: true },
        { name: 'mock_investments', type: 'mock', config: {}, enabled: true },
      ]);

      // Seed Opportunities — mix of active and non-active, different types, with aiScore
      const opps = await Opportunity.bulkCreate([
        {
          type: 'gov_contract',
          title: 'Federal Cybersecurity Audit',
          description: 'Comprehensive cybersecurity assessment for federal systems.',
          source: 'sam_gov',
          sourceId: 'PUB-SAM-001',
          status: 'active',
          category: 'IT',
          value: 3000000.00,
          publishedAt: new Date('2026-01-10'),
          expiresAt: new Date('2026-04-10'),
          aiScore: 88.5,
          aiAnalysis: { summary: 'High relevance contract' },
          sourceData: { naicsCode: '541512', setAside: 'SBA' },
          dataSourceId: 1,
        },
        {
          type: 'gov_contract',
          title: 'Cloud Infrastructure Modernization',
          description: 'Modernize legacy cloud systems for DoD.',
          source: 'sam_gov',
          sourceId: 'PUB-SAM-002',
          status: 'active',
          category: 'IT',
          value: 7500000.00,
          publishedAt: new Date('2026-01-20'),
          expiresAt: new Date('2026-05-01'),
          aiScore: 92.0,
          aiAnalysis: { summary: 'Top-tier opportunity' },
          sourceData: { naicsCode: '541511' },
          dataSourceId: 1,
        },
        {
          type: 'ai_job',
          title: 'Senior Data Scientist',
          description: 'Build predictive analytics models.',
          source: 'mock_jobs',
          sourceId: 'PUB-JOB-001',
          status: 'active',
          category: 'Engineering',
          location: 'Austin, TX',
          publishedAt: new Date('2026-02-05'),
          aiScore: 81.0,
          aiAnalysis: { summary: 'Strong match' },
          sourceData: { skills: ['Python', 'Spark'] },
          dataSourceId: 2,
        },
        {
          type: 'investment',
          title: 'AI Startup Seed Round - VisionAI',
          description: 'Computer vision startup seeking seed funding.',
          source: 'mock_investments',
          sourceId: 'PUB-INV-001',
          status: 'active',
          category: 'AI/ML',
          value: 2000000.00,
          publishedAt: new Date('2026-02-08'),
          aiScore: 74.0,
          aiAnalysis: { summary: 'Moderate potential' },
          sourceData: { round: 'Seed', investors: ['Y Combinator'] },
          dataSourceId: 3,
        },
        {
          type: 'ai_job',
          title: 'Closed NLP Engineer Role',
          description: 'This position has been filled.',
          source: 'mock_jobs',
          sourceId: 'PUB-JOB-002',
          status: 'closed',
          category: 'Engineering',
          location: 'Remote',
          publishedAt: new Date('2025-12-01'),
          aiScore: 65.0,
          aiAnalysis: { summary: 'No longer available' },
          sourceData: { skills: ['NLP'] },
          dataSourceId: 2,
        },
        {
          type: 'gov_contract',
          title: 'Expired Defense Analytics',
          description: 'This contract has expired.',
          source: 'sam_gov',
          sourceId: 'PUB-SAM-003',
          status: 'expired',
          category: 'Defense',
          value: 1000000.00,
          publishedAt: new Date('2025-06-01'),
          expiresAt: new Date('2025-12-01'),
          aiScore: 55.0,
          aiAnalysis: {},
          sourceData: {},
          dataSourceId: 1,
        },
      ]);

      // Store IDs for individual-record tests
      activeGovId = opps[0].id;  // active gov_contract
      closedOppId = opps[4].id;  // closed ai_job
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

  // ---------------------------------------------------------------
  // GET /api/v1/public/opportunities
  // ---------------------------------------------------------------
  describe('GET /api/v1/public/opportunities', () => {
    skipIfNoDb('should return 200 without any auth token', async () => {
      const res = await request(app)
        .get('/api/v1/public/opportunities');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    skipIfNoDb('should return only active opportunities', async () => {
      const res = await request(app)
        .get('/api/v1/public/opportunities');

      expect(res.status).toBe(200);
      const opportunities = res.body.data;
      expect(opportunities.length).toBeGreaterThan(0);

      // Every returned opportunity must be active
      opportunities.forEach((opp) => {
        expect(opp.status).toBe('active');
      });

      // The closed and expired records must not appear
      const ids = opportunities.map((o) => o.id);
      expect(ids).not.toContain(closedOppId);
    });

    skipIfNoDb('should NOT contain aiScore, aiAnalysis, or sourceData fields', async () => {
      const res = await request(app)
        .get('/api/v1/public/opportunities');

      expect(res.status).toBe(200);
      const opportunities = res.body.data;
      expect(opportunities.length).toBeGreaterThan(0);

      opportunities.forEach((opp) => {
        expect(opp).not.toHaveProperty('aiScore');
        expect(opp).not.toHaveProperty('ai_score');
        expect(opp).not.toHaveProperty('aiAnalysis');
        expect(opp).not.toHaveProperty('ai_analysis');
        expect(opp).not.toHaveProperty('sourceData');
        expect(opp).not.toHaveProperty('source_data');
      });
    });

    skipIfNoDb('should support pagination (default limit)', async () => {
      const res = await request(app)
        .get('/api/v1/public/opportunities');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('limit');
      expect(res.body.pagination).toHaveProperty('pages');
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(4); // 4 active records
    });

    skipIfNoDb('should filter by type', async () => {
      const res = await request(app)
        .get('/api/v1/public/opportunities?type=gov_contract');

      expect(res.status).toBe(200);
      const opportunities = res.body.data;
      expect(opportunities.length).toBeGreaterThan(0);

      opportunities.forEach((opp) => {
        expect(opp.type).toBe('gov_contract');
      });
    });
  });

  // ---------------------------------------------------------------
  // GET /api/v1/public/opportunities/stats
  // ---------------------------------------------------------------
  describe('GET /api/v1/public/opportunities/stats', () => {
    skipIfNoDb('should return stats with totalActive and byType counts', async () => {
      const res = await request(app)
        .get('/api/v1/public/opportunities/stats');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('stats');
      expect(res.body.data.stats).toHaveProperty('totalActive');
      expect(res.body.data.stats).toHaveProperty('byType');
      expect(res.body.data.stats.byType).toHaveProperty('gov_contract');
      expect(res.body.data.stats.byType).toHaveProperty('ai_job');
      expect(res.body.data.stats.byType).toHaveProperty('investment');

      // Verify counts match seeded active data
      expect(res.body.data.stats.totalActive).toBe(4);
      expect(res.body.data.stats.byType.gov_contract).toBe(2);
      expect(res.body.data.stats.byType.ai_job).toBe(1);
      expect(res.body.data.stats.byType.investment).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/v1/public/opportunities/:id
  // ---------------------------------------------------------------
  describe('GET /api/v1/public/opportunities/:id', () => {
    skipIfNoDb('should return a single opportunity without premium fields', async () => {
      const res = await request(app)
        .get(`/api/v1/public/opportunities/${activeGovId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('opportunity');

      const opp = res.body.data.opportunity;
      expect(opp).toHaveProperty('id', activeGovId);
      expect(opp).toHaveProperty('title');
      expect(opp).toHaveProperty('type');

      // Premium fields must be excluded
      expect(opp).not.toHaveProperty('aiScore');
      expect(opp).not.toHaveProperty('ai_score');
      expect(opp).not.toHaveProperty('aiAnalysis');
      expect(opp).not.toHaveProperty('ai_analysis');
      expect(opp).not.toHaveProperty('sourceData');
      expect(opp).not.toHaveProperty('source_data');
    });

    skipIfNoDb('should return 404 for a non-active opportunity', async () => {
      const res = await request(app)
        .get(`/api/v1/public/opportunities/${closedOppId}`);

      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
    });
  });
});
