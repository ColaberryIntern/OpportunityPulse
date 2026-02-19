const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Mock models
const mockApiKeyCreate = jest.fn();
const mockApiKeyFindAll = jest.fn();
const mockApiKeyFindOne = jest.fn();
const mockApiKeyUpdate = jest.fn();
const mockUserFindByPk = jest.fn();

jest.mock('../../../backend/src/models', () => ({
  ApiKey: {
    create: (...args) => mockApiKeyCreate(...args),
    findAll: (...args) => mockApiKeyFindAll(...args),
    findOne: (...args) => mockApiKeyFindOne(...args),
  },
  User: {
    findByPk: (...args) => mockUserFindByPk(...args),
  },
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const apiKeyService = require('../../../backend/src/apiKeys/apiKey.service');

describe('ApiKey Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createApiKey', () => {
    it('should create an API key and return plaintext key', async () => {
      mockApiKeyCreate.mockResolvedValue({
        id: 1,
        userId: 1,
        name: 'My Key',
        keyPrefix: 'op_abcd1234',
        scopes: ['read'],
        isActive: true,
        toJSON: () => ({ id: 1, userId: 1, name: 'My Key', keyPrefix: 'op_abcd1234', scopes: ['read'], isActive: true }),
      });

      const result = await apiKeyService.createApiKey(1, { name: 'My Key', scopes: ['read'] });

      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^op_[a-f0-9]{64}$/);
      expect(result.record).toBeDefined();
      expect(result.record.name).toBe('My Key');
      expect(mockApiKeyCreate).toHaveBeenCalledTimes(1);
      expect(mockApiKeyCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          name: 'My Key',
          scopes: ['read'],
          isActive: true,
        })
      );
    });

    it('should hash the key before storing', async () => {
      mockApiKeyCreate.mockImplementation(async (data) => ({
        ...data,
        id: 1,
        toJSON: () => ({ ...data, id: 1 }),
      }));

      const result = await apiKeyService.createApiKey(1, { name: 'Test' });

      const createCall = mockApiKeyCreate.mock.calls[0][0];
      expect(createCall.keyHash).toBeDefined();
      expect(createCall.keyHash).not.toBe(result.apiKey);
      // Verify the hash matches the returned plaintext key
      const matches = await bcrypt.compare(result.apiKey, createCall.keyHash);
      expect(matches).toBe(true);
    });

    it('should use default scopes when not provided', async () => {
      mockApiKeyCreate.mockResolvedValue({
        id: 1,
        toJSON: () => ({ id: 1, scopes: ['read'] }),
      });

      await apiKeyService.createApiKey(1, { name: 'Test' });

      expect(mockApiKeyCreate).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ['read'] })
      );
    });
  });

  describe('listApiKeys', () => {
    it('should return API keys for a user without hashes', async () => {
      mockApiKeyFindAll.mockResolvedValue([
        { id: 1, userId: 1, name: 'Key 1', keyPrefix: 'op_aaa', isActive: true, keyHash: 'should_not_appear' },
        { id: 2, userId: 1, name: 'Key 2', keyPrefix: 'op_bbb', isActive: false, keyHash: 'should_not_appear' },
      ]);

      const result = await apiKeyService.listApiKeys(1);

      expect(result).toHaveLength(2);
      expect(mockApiKeyFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
        })
      );
    });
  });

  describe('revokeApiKey', () => {
    it('should deactivate an API key', async () => {
      const mockSave = jest.fn();
      mockApiKeyFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        isActive: true,
        save: mockSave,
      });

      await apiKeyService.revokeApiKey(1, 1);

      expect(mockApiKeyFindOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, userId: 1 },
        })
      );
      expect(mockSave).toHaveBeenCalled();
    });

    it('should throw 404 when key not found', async () => {
      mockApiKeyFindOne.mockResolvedValue(null);

      await expect(apiKeyService.revokeApiKey(999, 1))
        .rejects.toThrow();
    });

    it('should throw when key belongs to different user', async () => {
      mockApiKeyFindOne.mockResolvedValue(null);

      await expect(apiKeyService.revokeApiKey(1, 999))
        .rejects.toThrow();
    });
  });

  describe('updateApiKey', () => {
    it('should update name and scopes', async () => {
      const mockSave = jest.fn();
      mockApiKeyFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        name: 'Old Name',
        scopes: ['read'],
        save: mockSave,
      });

      const result = await apiKeyService.updateApiKey(1, 1, { name: 'New Name', scopes: ['read', 'write'] });

      expect(mockSave).toHaveBeenCalled();
    });

    it('should throw 404 when key not found', async () => {
      mockApiKeyFindOne.mockResolvedValue(null);

      await expect(apiKeyService.updateApiKey(999, 1, { name: 'X' }))
        .rejects.toThrow();
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correct API key and return user info', async () => {
      const rawKey = 'op_' + crypto.randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(rawKey, 10);

      const mockSave = jest.fn().mockResolvedValue();
      mockApiKeyFindOne.mockResolvedValue({
        id: 1,
        userId: 42,
        keyHash: hash,
        isActive: true,
        expiresAt: null,
        save: mockSave,
        user: { id: 42, email: 'test@example.com', role_id: 2 },
      });

      const result = await apiKeyService.validateApiKey(rawKey);

      expect(result).toBeDefined();
      expect(result.userId).toBe(42);
    });

    it('should reject an inactive API key', async () => {
      const rawKey = 'op_' + crypto.randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(rawKey, 10);

      mockApiKeyFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        keyHash: hash,
        isActive: false,
        expiresAt: null,
      });

      await expect(apiKeyService.validateApiKey(rawKey))
        .rejects.toThrow();
    });

    it('should reject an expired API key', async () => {
      const rawKey = 'op_' + crypto.randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(rawKey, 10);

      mockApiKeyFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        keyHash: hash,
        isActive: true,
        expiresAt: new Date('2020-01-01'),
      });

      await expect(apiKeyService.validateApiKey(rawKey))
        .rejects.toThrow();
    });

    it('should reject when no key matches prefix', async () => {
      mockApiKeyFindOne.mockResolvedValue(null);

      await expect(apiKeyService.validateApiKey('op_nonexistent1234567890abcdef1234567890abcdef1234567890abcdef12345678'))
        .rejects.toThrow();
    });

    it('should reject when hash does not match', async () => {
      const rawKey = 'op_' + crypto.randomBytes(32).toString('hex');
      const differentHash = await bcrypt.hash('op_different' + crypto.randomBytes(32).toString('hex'), 10);

      mockApiKeyFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        keyHash: differentHash,
        isActive: true,
        expiresAt: null,
      });

      await expect(apiKeyService.validateApiKey(rawKey))
        .rejects.toThrow();
    });
  });
});
