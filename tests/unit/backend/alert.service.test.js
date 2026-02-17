// Mock logger before importing service
jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockAlert = {
    findAndCountAll: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    bulkCreate: jest.fn(),
  };
  const mockOpportunity = {};
  return { Alert: mockAlert, Opportunity: mockOpportunity };
});

const { Alert, Opportunity } = require('../../../backend/src/models');
const logger = require('../../../backend/src/logging/logger');
const alertService = require('../../../backend/src/alerts/alert.service');

describe('AlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── listAlerts ───────────────────────────────────────────────────────

  describe('listAlerts', () => {
    it('should return paginated alerts for a user', async () => {
      const mockAlerts = [
        { id: 1, title: 'New opportunity', type: 'new_opportunity' },
        { id: 2, title: 'Score changed', type: 'score_change' },
      ];
      Alert.findAndCountAll.mockResolvedValue({ rows: mockAlerts, count: 2 });

      const result = await alertService.listAlerts('user-1', {});

      expect(result.alerts).toEqual(mockAlerts);
      expect(result.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 20,
        pages: 1,
      });
      expect(Alert.findAndCountAll).toHaveBeenCalledTimes(1);
      const callArgs = Alert.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.userId).toBe('user-1');
      expect(callArgs.include).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ model: Opportunity, as: 'opportunity' }),
        ])
      );
      expect(callArgs.order).toEqual([['created_at', 'DESC']]);
    });

    it('should apply type filter when provided', async () => {
      Alert.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await alertService.listAlerts('user-1', { type: 'new_opportunity' });

      const callArgs = Alert.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.type).toBe('new_opportunity');
    });

    it('should apply unreadOnly filter (where.read = false)', async () => {
      Alert.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await alertService.listAlerts('user-1', { unreadOnly: true });

      const callArgs = Alert.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.read).toBe(false);
    });

    it('should return empty array when no alerts exist', async () => {
      Alert.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await alertService.listAlerts('user-1', {});

      expect(result.alerts).toEqual([]);
      expect(result.pagination).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        pages: 0,
      });
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('should return unread count for a user', async () => {
      Alert.count.mockResolvedValue(5);

      const result = await alertService.getUnreadCount('user-1');

      expect(result).toEqual({ unreadCount: 5 });
      expect(Alert.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
      });
    });

    it('should return 0 when all alerts are read', async () => {
      Alert.count.mockResolvedValue(0);

      const result = await alertService.getUnreadCount('user-1');

      expect(result).toEqual({ unreadCount: 0 });
    });
  });

  // ─── markAsRead ───────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('should mark an alert as read', async () => {
      const mockAlert = {
        id: 10,
        userId: 'user-1',
        read: false,
        save: jest.fn().mockResolvedValue(true),
      };
      Alert.findOne.mockResolvedValue(mockAlert);

      const result = await alertService.markAsRead(10, 'user-1');

      expect(Alert.findOne).toHaveBeenCalledWith({
        where: { id: 10, userId: 'user-1' },
      });
      expect(mockAlert.read).toBe(true);
      expect(mockAlert.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockAlert);
    });

    it('should throw AppError(404) when alert not found', async () => {
      Alert.findOne.mockResolvedValue(null);

      await expect(alertService.markAsRead(999, 'user-1'))
        .rejects.toMatchObject({ statusCode: 404, message: 'Alert not found.' });
    });
  });

  // ─── markAllAsRead ────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('should update all unread alerts for a user', async () => {
      Alert.update.mockResolvedValue([3]);

      const result = await alertService.markAllAsRead('user-1');

      expect(result).toEqual({ updatedCount: 3 });
      expect(Alert.update).toHaveBeenCalledWith(
        { read: true },
        { where: { userId: 'user-1', read: false } }
      );
    });

    it('should return updatedCount of 0 when no unread alerts', async () => {
      Alert.update.mockResolvedValue([0]);

      const result = await alertService.markAllAsRead('user-1');

      expect(result).toEqual({ updatedCount: 0 });
    });
  });

  // ─── deleteAlert ──────────────────────────────────────────────────────

  describe('deleteAlert', () => {
    it('should delete an alert successfully', async () => {
      const mockAlert = {
        id: 10,
        userId: 'user-1',
        destroy: jest.fn().mockResolvedValue(true),
      };
      Alert.findOne.mockResolvedValue(mockAlert);

      const result = await alertService.deleteAlert(10, 'user-1');

      expect(Alert.findOne).toHaveBeenCalledWith({
        where: { id: 10, userId: 'user-1' },
      });
      expect(mockAlert.destroy).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ deleted: true });
    });

    it('should throw AppError(404) when alert not found', async () => {
      Alert.findOne.mockResolvedValue(null);

      await expect(alertService.deleteAlert(999, 'user-1'))
        .rejects.toMatchObject({ statusCode: 404, message: 'Alert not found.' });
    });
  });

  // ─── createAlert ──────────────────────────────────────────────────────

  describe('createAlert', () => {
    it('should create a new alert with provided fields', async () => {
      const input = {
        userId: 'user-1',
        type: 'new_opportunity',
        title: 'New opportunity matched',
        message: 'A new AI contract matched your profile.',
        opportunityId: 'opp-42',
        severity: 'important',
        metadata: { source: 'sam_gov' },
      };
      const mockCreated = { id: 100, ...input };
      Alert.create.mockResolvedValue(mockCreated);

      const result = await alertService.createAlert(input);

      expect(Alert.create).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'new_opportunity',
        title: 'New opportunity matched',
        message: 'A new AI contract matched your profile.',
        opportunityId: 'opp-42',
        severity: 'important',
        metadata: { source: 'sam_gov' },
      });
      expect(result).toEqual(mockCreated);
    });
  });

  // ─── createAlertsBulk ────────────────────────────────────────────────

  describe('createAlertsBulk', () => {
    it('should bulk create alerts and log count', async () => {
      const records = [
        { userId: 'user-1', type: 'system', title: 'Alert A', message: 'msg A' },
        { userId: 'user-2', type: 'system', title: 'Alert B', message: 'msg B' },
        { userId: 'user-3', type: 'system', title: 'Alert C', message: 'msg C' },
      ];
      const mockCreated = records.map((r, i) => ({ id: i + 1, ...r }));
      Alert.bulkCreate.mockResolvedValue(mockCreated);

      const result = await alertService.createAlertsBulk(records);

      expect(Alert.bulkCreate).toHaveBeenCalledWith(records);
      expect(result).toEqual(mockCreated);
      expect(logger.info).toHaveBeenCalledWith('Bulk created 3 alerts');
    });
  });
});
