const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// We'll mock the models
jest.mock('../../../backend/src/models', () => {
  const mockUser = {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn(),
  };
  const mockUserRole = {
    findOne: jest.fn(),
  };
  const mockSubscription = {
    create: jest.fn().mockResolvedValue({ id: 1, planType: 'free' }),
  };
  return {
    User: mockUser,
    UserRole: mockUserRole,
    Subscription: mockSubscription,
    sequelize: { transaction: jest.fn((fn) => fn()) },
  };
});

// Set env vars for tests
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-chars';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.BCRYPT_ROUNDS = '10';

const { User, UserRole } = require('../../../backend/src/models');
const authService = require('../../../backend/src/auth/auth.service');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should create a new user with hashed password and return userId', async () => {
      User.findOne.mockResolvedValue(null); // no existing user
      UserRole.findOne.mockResolvedValue({ id: 2, roleName: 'consultant' });
      User.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        emailVerified: false,
        verificationToken: 'some-token',
        toSafeJSON: () => ({ id: 1, email: 'test@example.com' }),
      });

      const result = await authService.registerUser({
        email: 'test@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result).toHaveProperty('userId', 1);
      expect(User.create).toHaveBeenCalledTimes(1);

      // Verify password passed to create is the raw password (model hook hashes it)
      const createCall = User.create.mock.calls[0][0];
      expect(createCall.email).toBe('test@example.com');
      expect(createCall.passwordHash).toBe('Str0ng!Pass');
    });

    it('should throw 409 when email already exists', async () => {
      User.findOne.mockResolvedValue({ id: 1, email: 'test@example.com' });

      await expect(
        authService.registerUser({ email: 'test@example.com', password: 'Str0ng!Pass' })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('already'),
      });
    });

    it('should assign default consultant role to new users', async () => {
      User.findOne.mockResolvedValue(null);
      UserRole.findOne.mockResolvedValue({ id: 2, roleName: 'consultant' });
      User.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        roleId: 2,
        toSafeJSON: () => ({ id: 1, email: 'test@example.com' }),
      });

      await authService.registerUser({
        email: 'test@example.com',
        password: 'Str0ng!Pass',
      });

      const createCall = User.create.mock.calls[0][0];
      expect(createCall.roleId).toBe(2);
    });

    it('should generate a verification token', async () => {
      User.findOne.mockResolvedValue(null);
      UserRole.findOne.mockResolvedValue({ id: 2, roleName: 'consultant' });
      User.create.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        verificationToken: 'abc123',
        toSafeJSON: () => ({ id: 1, email: 'test@example.com' }),
      });

      const result = await authService.registerUser({
        email: 'test@example.com',
        password: 'Str0ng!Pass',
      });

      const createCall = User.create.mock.calls[0][0];
      expect(createCall.verificationToken).toBeDefined();
      expect(typeof createCall.verificationToken).toBe('string');
      expect(createCall.verificationToken.length).toBeGreaterThan(0);
    });
  });

  describe('loginUser', () => {
    it('should return accessToken and user on valid credentials', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        emailVerified: true,
        validatePassword: jest.fn().mockResolvedValue(true),
        toSafeJSON: () => ({ id: 1, email: 'test@example.com', role: 'consultant' }),
        role: { roleName: 'consultant' },
      };
      User.findOne.mockResolvedValue(mockUser);

      const result = await authService.loginUser({
        email: 'test@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
      expect(result.user).not.toHaveProperty('passwordHash');

      // Verify JWT is valid
      const decoded = jwt.verify(result.accessToken, process.env.JWT_SECRET);
      expect(decoded).toHaveProperty('userId', 1);
      expect(decoded).toHaveProperty('role', 'consultant');
    });

    it('should throw 401 when email not found', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(
        authService.loginUser({ email: 'nonexistent@example.com', password: 'Str0ng!Pass' })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Invalid'),
      });
    });

    it('should throw 401 when password is wrong', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        validatePassword: jest.fn().mockResolvedValue(false),
      };
      User.findOne.mockResolvedValue(mockUser);

      await expect(
        authService.loginUser({ email: 'test@example.com', password: 'WrongPass1!' })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Invalid'),
      });
    });

    it('should include role in JWT token payload', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        emailVerified: true,
        validatePassword: jest.fn().mockResolvedValue(true),
        toSafeJSON: () => ({ id: 1, email: 'test@example.com' }),
        role: { roleName: 'admin' },
      };
      User.findOne.mockResolvedValue(mockUser);

      const result = await authService.loginUser({
        email: 'test@example.com',
        password: 'Str0ng!Pass',
      });

      const decoded = jwt.verify(result.accessToken, process.env.JWT_SECRET);
      expect(decoded.role).toBe('admin');
    });
  });

  describe('verifyEmail', () => {
    it('should set emailVerified to true with valid token', async () => {
      const mockUser = {
        id: 1,
        verificationToken: 'valid-token',
        emailVerified: false,
        save: jest.fn().mockResolvedValue(true),
      };
      User.findOne.mockResolvedValue(mockUser);

      await authService.verifyEmail('valid-token');

      expect(mockUser.emailVerified).toBe(true);
      expect(mockUser.verificationToken).toBeNull();
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw 400 for invalid verification token', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(
        authService.verifyEmail('invalid-token')
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Invalid'),
      });
    });
  });

  describe('getUserProfile', () => {
    it('should return user without sensitive fields', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        toSafeJSON: () => ({ id: 1, email: 'test@example.com', name: 'Test User' }),
      };
      User.findByPk.mockResolvedValue(mockUser);

      const result = await authService.getUserProfile(1);

      expect(result).toHaveProperty('email', 'test@example.com');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('verificationToken');
    });

    it('should throw 404 when user not found', async () => {
      User.findByPk.mockResolvedValue(null);

      await expect(
        authService.getUserProfile(999)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('updateProfile', () => {
    it('should update name, company, and interests', async () => {
      const mockUser = {
        id: 1,
        name: 'Old Name',
        company: 'Old Company',
        interests: 'Old Interests',
        save: jest.fn().mockResolvedValue(true),
        toSafeJSON: () => ({
          id: 1, name: 'New Name', company: 'New Company', interests: 'AI, ML',
        }),
      };
      User.findByPk.mockResolvedValue(mockUser);

      const result = await authService.updateProfile(1, {
        name: 'New Name',
        company: 'New Company',
        interests: 'AI, ML',
      });

      expect(mockUser.save).toHaveBeenCalled();
      expect(result.name).toBe('New Name');
    });

    it('should throw 404 when user not found', async () => {
      User.findByPk.mockResolvedValue(null);

      await expect(
        authService.updateProfile(999, { name: 'Test' })
      ).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
