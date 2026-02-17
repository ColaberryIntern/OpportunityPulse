// Mock models BEFORE importing service
jest.mock('../../../backend/src/models', () => ({
  AlertPreference: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

const { AlertPreference } = require('../../../backend/src/models');
const {
  getPreferences,
  updatePreferences,
  DEFAULT_PREFERENCES,
  AppError,
} = require('../../../backend/src/alertPreferences/alertPref.service');

describe('AlertPrefService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreferences', () => {
    it('should return existing preferences when found', async () => {
      const mockPrefs = {
        userId: 'user-1',
        govContracts: true,
        aiJobs: false,
        investments: true,
        minScore: 50,
        emailNotify: true,
        inAppNotify: true,
      };
      AlertPreference.findOne.mockResolvedValue(mockPrefs);

      const result = await getPreferences('user-1');

      expect(result).toEqual(mockPrefs);
      expect(AlertPreference.findOne).toHaveBeenCalledTimes(1);
      expect(AlertPreference.findOne).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('should return defaults with isDefault:true when none exist', async () => {
      AlertPreference.findOne.mockResolvedValue(null);

      const result = await getPreferences('user-new');

      expect(result).toEqual({
        ...DEFAULT_PREFERENCES,
        userId: 'user-new',
        isDefault: true,
      });
      expect(result.govContracts).toBe(true);
      expect(result.aiJobs).toBe(true);
      expect(result.investments).toBe(true);
      expect(result.minScore).toBe(0);
      expect(result.emailNotify).toBe(false);
      expect(result.inAppNotify).toBe(true);
    });
  });

  describe('updatePreferences', () => {
    it('should update existing record', async () => {
      const mockPrefs = {
        userId: 'user-1',
        govContracts: true,
        aiJobs: true,
        investments: true,
        minScore: 0,
        emailNotify: false,
        inAppNotify: true,
        update: jest.fn().mockResolvedValue(true),
      };
      AlertPreference.findOne.mockResolvedValue(mockPrefs);

      const result = await updatePreferences('user-1', { minScore: 75, emailNotify: true });

      expect(mockPrefs.update).toHaveBeenCalledWith({ minScore: 75, emailNotify: true });
      expect(result).toBe(mockPrefs);
    });

    it('should create new record when none exist', async () => {
      AlertPreference.findOne.mockResolvedValue(null);

      const createdPrefs = {
        userId: 'user-new',
        govContracts: true,
        aiJobs: false,
        investments: true,
        minScore: 30,
        emailNotify: false,
        inAppNotify: true,
      };
      AlertPreference.create.mockResolvedValue(createdPrefs);

      const result = await updatePreferences('user-new', { aiJobs: false, minScore: 30 });

      expect(AlertPreference.create).toHaveBeenCalledWith({
        userId: 'user-new',
        ...DEFAULT_PREFERENCES,
        aiJobs: false,
        minScore: 30,
      });
      expect(result).toEqual(createdPrefs);
    });

    it('should throw AppError(400) for invalid minScore', async () => {
      await expect(updatePreferences('user-1', { minScore: 150 }))
        .rejects.toThrow(AppError);
      await expect(updatePreferences('user-1', { minScore: 150 }))
        .rejects.toMatchObject({
          message: 'minScore must be between 0 and 100.',
          statusCode: 400,
        });
    });

    it('should throw AppError(400) for negative minScore', async () => {
      await expect(updatePreferences('user-1', { minScore: -5 }))
        .rejects.toMatchObject({
          statusCode: 400,
        });
    });

    it('should ignore non-allowed fields', async () => {
      const mockPrefs = {
        userId: 'user-1',
        update: jest.fn().mockResolvedValue(true),
      };
      AlertPreference.findOne.mockResolvedValue(mockPrefs);

      await updatePreferences('user-1', {
        govContracts: false,
        hackerField: 'malicious',
        role: 'admin',
        password: 'secret',
      });

      expect(mockPrefs.update).toHaveBeenCalledWith({ govContracts: false });
      // Verify non-allowed fields were stripped
      const updateArg = mockPrefs.update.mock.calls[0][0];
      expect(updateArg).not.toHaveProperty('hackerField');
      expect(updateArg).not.toHaveProperty('role');
      expect(updateArg).not.toHaveProperty('password');
    });
  });
});
