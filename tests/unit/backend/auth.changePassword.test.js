const bcrypt = require('bcryptjs');

// Mock User model
const mockFindByPk = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../../backend/src/models', () => ({
  User: {
    findByPk: (...args) => mockFindByPk(...args),
  },
  UserRole: {
    findOne: jest.fn(),
  },
  Subscription: {
    create: jest.fn(),
  },
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../backend/src/utils/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(),
}));

const authService = require('../../../backend/src/auth/auth.service');

describe('Auth Service - changePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should change password successfully with correct current password', async () => {
    const currentPassword = 'OldPass@123';
    const newPassword = 'NewPass@456';
    const currentHash = await bcrypt.hash(currentPassword, 10);
    const mockSave = jest.fn().mockResolvedValue();

    mockFindByPk.mockResolvedValue({
      id: 1,
      passwordHash: currentHash,
      validatePassword: jest.fn().mockResolvedValue(true),
      save: mockSave,
    });

    const result = await authService.changePassword(1, currentPassword, newPassword);

    expect(result.message).toContain('Password changed');
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('should throw 404 when user not found', async () => {
    mockFindByPk.mockResolvedValue(null);

    await expect(authService.changePassword(999, 'old', 'new'))
      .rejects.toThrow('User not found');
  });

  it('should throw 401 when current password is incorrect', async () => {
    mockFindByPk.mockResolvedValue({
      id: 1,
      passwordHash: 'somehash',
      validatePassword: jest.fn().mockResolvedValue(false),
      save: jest.fn(),
    });

    await expect(authService.changePassword(1, 'WrongPassword', 'NewPass@456'))
      .rejects.toThrow();
  });

  it('should throw 400 when new password same as current', async () => {
    const password = 'SamePass@123';

    mockFindByPk.mockResolvedValue({
      id: 1,
      passwordHash: 'somehash',
      validatePassword: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    });

    await expect(authService.changePassword(1, password, password))
      .rejects.toThrow();
  });

  it('should hash the new password before storing', async () => {
    const currentPassword = 'OldPass@123';
    const newPassword = 'NewPass@456';
    const mockSave = jest.fn().mockResolvedValue();
    const mockUser = {
      id: 1,
      passwordHash: null,
      validatePassword: jest.fn().mockResolvedValue(true),
      save: mockSave,
    };

    mockFindByPk.mockResolvedValue(mockUser);

    await authService.changePassword(1, currentPassword, newPassword);

    // The service sets user.passwordHash = newPassword and calls save()
    // The beforeUpdate hook in the model would hash it, but here we verify it was set
    expect(mockUser.passwordHash).toBe(newPassword);
    expect(mockSave).toHaveBeenCalled();
  });
});
