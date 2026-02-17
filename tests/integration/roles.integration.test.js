const request = require('supertest');
const jwt = require('jsonwebtoken');

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

describe('Roles Integration Tests', () => {
  let dbAvailable = false;
  let adminToken;
  let consultantToken;

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

      // Create admin user and get token
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'admin@test.com', password: 'Str0ng!Pass' });
      // Manually set admin role
      const adminUser = await User.findOne({ where: { email: 'admin@test.com' } });
      adminUser.roleId = 1;
      await adminUser.save();
      const adminLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: 'Str0ng!Pass' });
      adminToken = adminLogin.body.data.accessToken;

      // Create consultant user and get token
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'consultant@test.com', password: 'Str0ng!Pass' });
      const consultantLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'consultant@test.com', password: 'Str0ng!Pass' });
      consultantToken = consultantLogin.body.data.accessToken;
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

  describe('GET /api/v1/roles', () => {
    skipIfNoDb('should return all roles for admin', async () => {
      const res = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.roles).toHaveLength(4);
      expect(res.body.data.roles[0]).toHaveProperty('roleName');
    });

    skipIfNoDb('should return 403 for non-admin (consultant)', async () => {
      const res = await request(app)
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${consultantToken}`);

      expect(res.status).toBe(403);
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/roles');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/roles/assign', () => {
    skipIfNoDb('should assign a role to a user', async () => {
      const user = await User.findOne({ where: { email: 'consultant@test.com' } });

      const res = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user.id, roleId: 3 }); // auditor

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user).toHaveProperty('roleId', 3);

      // Reset back to consultant for other tests
      await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user.id, roleId: 2 });
    });

    skipIfNoDb('should return 403 for non-admin', async () => {
      const res = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${consultantToken}`)
        .send({ userId: 1, roleId: 2 });

      expect(res.status).toBe(403);
    });

    skipIfNoDb('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 99999, roleId: 2 });

      expect(res.status).toBe(404);
    });

    skipIfNoDb('should return 404 for non-existent role', async () => {
      const user = await User.findOne({ where: { email: 'consultant@test.com' } });

      const res = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: user.id, roleId: 99999 });

      expect(res.status).toBe(404);
    });

    skipIfNoDb('should return 400 for missing userId', async () => {
      const res = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: 2 });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 400 for missing roleId', async () => {
      const res = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 1 });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should prevent removing the last admin', async () => {
      const adminUser = await User.findOne({ where: { email: 'admin@test.com' } });

      const res = await request(app)
        .post('/api/v1/roles/assign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: adminUser.id, roleId: 2 }); // try to demote last admin

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('last admin');
    });
  });

  describe('PUT /api/v1/roles/:id', () => {
    skipIfNoDb('should update role description', async () => {
      const res = await request(app)
        .put('/api/v1/roles/2')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Updated consultant description' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.role.description).toBe('Updated consultant description');
    });

    skipIfNoDb('should not allow changing role name', async () => {
      const res = await request(app)
        .put('/api/v1/roles/2')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'New desc', roleName: 'hacker' });

      expect(res.status).toBe(200);
      // roleName should remain unchanged
      expect(res.body.data.role.roleName).toBe('consultant');
    });

    skipIfNoDb('should return 404 for non-existent role', async () => {
      const res = await request(app)
        .put('/api/v1/roles/99999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Does not exist' });

      expect(res.status).toBe(404);
    });

    skipIfNoDb('should return 403 for non-admin', async () => {
      const res = await request(app)
        .put('/api/v1/roles/2')
        .set('Authorization', `Bearer ${consultantToken}`)
        .send({ description: 'Hacked' });

      expect(res.status).toBe(403);
    });
  });
});
