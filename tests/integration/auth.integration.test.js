const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.PORT = '3099';
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

describe('Auth Integration Tests', () => {
  // These tests require a running PostgreSQL database.
  // They will be skipped if the DB is not available.
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ force: true }); // recreate tables
      // Seed roles
      await UserRole.bulkCreate([
        { roleName: 'admin', description: 'Full access' },
        { roleName: 'consultant', description: 'Standard user' },
        { roleName: 'auditor', description: 'Compliance access' },
        { roleName: 'devops', description: 'Infrastructure access' },
      ]);
      dbAvailable = true;
    } catch (error) {
      console.warn('Database not available, skipping integration tests:', error.message);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await sequelize.close();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      // Clean users table between tests (keep roles)
      await User.destroy({ where: {}, force: true });
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

  describe('POST /api/v1/auth/register', () => {
    skipIfNoDb('should register a new user and return 201', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'newuser@example.com', password: 'Str0ng!Pass' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('userId');

      // Verify user was created in DB
      const user = await User.findOne({ where: { email: 'newuser@example.com' } });
      expect(user).not.toBeNull();
      expect(user.emailVerified).toBe(false);
      expect(user.verificationToken).toBeTruthy();
      expect(user.roleId).toBe(2); // consultant
    });

    skipIfNoDb('should return 409 when email already exists', async () => {
      // First registration
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'duplicate@example.com', password: 'Str0ng!Pass' });

      // Duplicate registration
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'duplicate@example.com', password: 'Str0ng!Pass' });

      expect(res.status).toBe(409);
      expect(res.body.status).toBe('error');
    });

    skipIfNoDb('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'Str0ng!Pass' });

      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
    });

    skipIfNoDb('should return 400 for weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'user@example.com', password: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    skipIfNoDb('should return 400 for password without uppercase', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'user@example.com', password: 'nouppercase1!' });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 400 for password without number', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'user@example.com', password: 'NoNumbers!!' });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should return 400 for password without special char', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'user@example.com', password: 'NoSpecial1A' });

      expect(res.status).toBe(400);
    });

    skipIfNoDb('should not return password hash in response', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'safe@example.com', password: 'Str0ng!Pass' });

      expect(res.status).toBe(201);
      const responseBody = JSON.stringify(res.body);
      expect(responseBody).not.toContain('passwordHash');
      expect(responseBody).not.toContain('password_hash');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    skipIfNoDb('should login and return JWT token', async () => {
      // Register first
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'loginuser@example.com', password: 'Str0ng!Pass' });

      // Login
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'loginuser@example.com', password: 'Str0ng!Pass' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      // Verify JWT is valid
      const decoded = jwt.verify(res.body.data.accessToken, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('role', 'consultant');
    });

    skipIfNoDb('should return 401 for wrong password', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'wrongpass@example.com', password: 'Str0ng!Pass' });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'wrongpass@example.com', password: 'Wr0ng!Pass' });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid');
    });

    skipIfNoDb('should return 401 for nonexistent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'Str0ng!Pass' });

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'user@example.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/verify/:token', () => {
    skipIfNoDb('should verify email with valid token', async () => {
      // Register user
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'verify@example.com', password: 'Str0ng!Pass' });

      // Get verification token from DB
      const user = await User.findOne({ where: { email: 'verify@example.com' } });
      expect(user.verificationToken).toBeTruthy();

      // Verify email
      const res = await request(app)
        .get(`/api/v1/auth/verify/${user.verificationToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('verified');

      // Check DB was updated
      await user.reload();
      expect(user.emailVerified).toBe(true);
      expect(user.verificationToken).toBeNull();
    });

    skipIfNoDb('should return 400 for invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/verify/invalid-token-that-does-not-exist');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    skipIfNoDb('should return current user profile with valid JWT', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'me@example.com', password: 'Str0ng!Pass' });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'me@example.com', password: 'Str0ng!Pass' });

      const token = loginRes.body.data.accessToken;

      // Get profile
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user).toHaveProperty('email', 'me@example.com');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me');

      expect(res.status).toBe(401);
    });

    skipIfNoDb('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/v1/auth/profile', () => {
    skipIfNoDb('should update user profile', async () => {
      // Register and login
      await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'profile@example.com', password: 'Str0ng!Pass' });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'profile@example.com', password: 'Str0ng!Pass' });

      const token = loginRes.body.data.accessToken;

      // Update profile
      const res = await request(app)
        .put('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'John Doe',
          company: 'Acme Corp',
          interests: 'AI, Government Contracts',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.name).toBe('John Doe');
      expect(res.body.data.user.company).toBe('Acme Corp');
    });

    skipIfNoDb('should return 401 without token', async () => {
      const res = await request(app)
        .put('/api/v1/auth/profile')
        .send({ name: 'Hacker' });

      expect(res.status).toBe(401);
    });
  });

  describe('Full Registration Flow', () => {
    skipIfNoDb('should complete full register -> verify -> login -> profile flow', async () => {
      // Step 1: Register
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'fullflow@example.com', password: 'Str0ng!Pass' });
      expect(registerRes.status).toBe(201);

      // Step 2: Verify email
      const user = await User.findOne({ where: { email: 'fullflow@example.com' } });
      const verifyRes = await request(app)
        .get(`/api/v1/auth/verify/${user.verificationToken}`);
      expect(verifyRes.status).toBe(200);

      // Step 3: Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'fullflow@example.com', password: 'Str0ng!Pass' });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.data.accessToken;

      // Step 4: Get profile
      const profileRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.data.user.email).toBe('fullflow@example.com');

      // Step 5: Update profile
      const updateRes = await request(app)
        .put('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Full Flow User', company: 'Test Corp' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.user.name).toBe('Full Flow User');
    });
  });
});
