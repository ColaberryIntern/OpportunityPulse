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
const { sequelize, UserRole, User, Subscription, DataSource, Opportunity } = require('../../backend/src/models');

describe('Subscription Integration Tests', () => {
  let dbAvailable = false;
  let freeUserToken;
  let premiumUserToken;
  let adminToken;
  let freeUser;
  let premiumUser;
  let adminUser;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ force: true });

      // Seed roles
      await UserRole.bulkCreate([
        { roleName: 'admin', description: 'Full access' },
        { roleName: 'consultant', description: 'Standard user' },
        { roleName: 'auditor', description: 'Compliance access' },
        { roleName: 'devops', description: 'Infrastructure access' },
      ]);

      dbAvailable = true;

      // --- Create free user ---
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'freeuser@test.com', password: 'Str0ng!Pass' });
      const freeLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'freeuser@test.com', password: 'Str0ng!Pass' });
      freeUserToken = freeLogin.body.data.accessToken;
      freeUser = await User.findOne({ where: { email: 'freeuser@test.com' } });

      // --- Create premium user ---
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'premiumuser@test.com', password: 'Str0ng!Pass' });
      premiumUser = await User.findOne({ where: { email: 'premiumuser@test.com' } });
      // Upgrade to premium
      await Subscription.update(
        { planType: 'premium' },
        { where: { userId: premiumUser.id } }
      );
      const premiumLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'premiumuser@test.com', password: 'Str0ng!Pass' });
      premiumUserToken = premiumLogin.body.data.accessToken;

      // --- Create admin user ---
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'subadmin@test.com', password: 'Str0ng!Pass' });
      adminUser = await User.findOne({ where: { email: 'subadmin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'subadmin@test.com', password: 'Str0ng!Pass' });
      adminToken = adminLogin.body.data.accessToken;

      // Seed DataSource
      await DataSource.bulkCreate([
        { name: 'sam_gov', type: 'api', config: {}, enabled: true },
        { name: 'mock_jobs', type: 'mock', config: {}, enabled: true },
      ]);

      // Seed Opportunities (for minScore filter tests)
      await Opportunity.bulkCreate([
        {
          type: 'gov_contract',
          title: 'Cloud Migration Contract',
          description: 'Cloud infrastructure modernization.',
          source: 'sam_gov',
          sourceId: 'SUB-SAM-001',
          status: 'active',
          category: 'IT',
          value: 5000000.00,
          publishedAt: new Date('2026-01-15'),
          expiresAt: new Date('2026-03-15'),
          aiScore: 90.0,
          sourceData: { naicsCode: '541512' },
          dataSourceId: 1,
        },
        {
          type: 'ai_job',
          title: 'ML Engineer Position',
          description: 'Build ML models at scale.',
          source: 'mock_jobs',
          sourceId: 'SUB-JOB-001',
          status: 'active',
          category: 'Engineering',
          location: 'Remote',
          publishedAt: new Date('2026-02-01'),
          aiScore: 75.0,
          sourceData: { skills: ['Python'] },
          dataSourceId: 2,
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

  // ---------------------------------------------------------------
  // Registration auto-creates subscription
  // ---------------------------------------------------------------
  describe('Registration auto-creates subscription', () => {
    skipIfNoDb('should create a free Subscription record upon registration', async () => {
      const sub = await Subscription.findOne({ where: { userId: freeUser.id } });

      expect(sub).not.toBeNull();
      expect(sub.planType).toBe('free');
      expect(sub.startDate).toBeTruthy();
      expect(sub.endDate).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Premium endpoint enforcement — GET /api/v1/analysis/latest-insights
  // ---------------------------------------------------------------
  describe('GET /api/v1/analysis/latest-insights (premium)', () => {
    skipIfNoDb('should return 403 with upgradeRequired for free user', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/latest-insights')
        .set('Authorization', `Bearer ${freeUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ upgradeRequired: true }),
        ])
      );
    });

    skipIfNoDb('should return 200 for premium user', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/latest-insights')
        .set('Authorization', `Bearer ${premiumUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    skipIfNoDb('should return 200 for admin (admin bypass)', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/latest-insights')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // ---------------------------------------------------------------
  // Premium endpoint — GET /api/v1/analysis/trends/:type
  // ---------------------------------------------------------------
  describe('GET /api/v1/analysis/trends/ai_job (premium)', () => {
    skipIfNoDb('should return 403 for free user', async () => {
      const res = await request(app)
        .get('/api/v1/analysis/trends/ai_job')
        .set('Authorization', `Bearer ${freeUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ upgradeRequired: true }),
        ])
      );
    });
  });

  // ---------------------------------------------------------------
  // Dashboard charts premium — GET /api/v1/dashboard/charts
  // ---------------------------------------------------------------
  describe('GET /api/v1/dashboard/charts (premium)', () => {
    skipIfNoDb('should return 403 for free user', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/charts')
        .set('Authorization', `Bearer ${freeUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ upgradeRequired: true }),
        ])
      );
    });
  });

  // ---------------------------------------------------------------
  // Premium query param — GET /api/v1/opportunities?minScore=80
  // ---------------------------------------------------------------
  describe('GET /api/v1/opportunities with minScore (premium query)', () => {
    skipIfNoDb('should return 403 when free user uses minScore', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?minScore=80')
        .set('Authorization', `Bearer ${freeUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('error');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ upgradeRequired: true }),
        ])
      );
    });

    skipIfNoDb('should return 200 when free user does NOT use minScore', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities')
        .set('Authorization', `Bearer ${freeUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    skipIfNoDb('should return 200 when premium user uses minScore', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?minScore=80')
        .set('Authorization', `Bearer ${premiumUserToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    skipIfNoDb('should return 200 when admin uses minScore', async () => {
      const res = await request(app)
        .get('/api/v1/opportunities?minScore=80')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });
});
