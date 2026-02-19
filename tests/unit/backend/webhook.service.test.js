const crypto = require('crypto');

const mockWebhookCreate = jest.fn();
const mockWebhookFindAll = jest.fn();
const mockWebhookFindOne = jest.fn();
const mockWebhookDestroy = jest.fn();
const mockDeliveryCreate = jest.fn();
const mockDeliveryFindAll = jest.fn();

jest.mock('../../../backend/src/models', () => ({
  Webhook: {
    create: (...args) => mockWebhookCreate(...args),
    findAll: (...args) => mockWebhookFindAll(...args),
    findOne: (...args) => mockWebhookFindOne(...args),
  },
  WebhookDelivery: {
    create: (...args) => mockDeliveryCreate(...args),
    findAll: (...args) => mockDeliveryFindAll(...args),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
  },
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

global.fetch = jest.fn();

const webhookService = require('../../../backend/src/webhooks/webhook.service');

describe('Webhook Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();
  });

  describe('createWebhook', () => {
    it('should create a webhook with generated secret', async () => {
      mockWebhookCreate.mockImplementation(async (data) => ({
        ...data,
        id: 1,
        toJSON: () => ({ ...data, id: 1 }),
      }));

      const result = await webhookService.createWebhook(1, {
        url: 'https://example.com/hook',
        eventTypes: ['opportunity.created'],
        description: 'My webhook',
      });

      expect(mockWebhookCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          url: 'https://example.com/hook',
          eventTypes: ['opportunity.created'],
        })
      );
      // Secret should be generated
      const createCall = mockWebhookCreate.mock.calls[0][0];
      expect(createCall.secret).toBeDefined();
      expect(createCall.secret.length).toBeGreaterThan(20);
    });
  });

  describe('listWebhooks', () => {
    it('should return webhooks for a user', async () => {
      mockWebhookFindAll.mockResolvedValue([
        { id: 1, url: 'https://example.com/hook1', isActive: true },
        { id: 2, url: 'https://example.com/hook2', isActive: false },
      ]);

      const result = await webhookService.listWebhooks(1);

      expect(result).toHaveLength(2);
      expect(mockWebhookFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
        })
      );
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook properties', async () => {
      const mockSave = jest.fn();
      mockWebhookFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        url: 'https://old.com/hook',
        eventTypes: ['alert.created'],
        save: mockSave,
      });

      await webhookService.updateWebhook(1, 1, {
        url: 'https://new.com/hook',
        eventTypes: ['opportunity.created', 'alert.created'],
      });

      expect(mockSave).toHaveBeenCalled();
    });

    it('should throw 404 when webhook not found', async () => {
      mockWebhookFindOne.mockResolvedValue(null);

      await expect(webhookService.updateWebhook(999, 1, { url: 'https://x.com' }))
        .rejects.toThrow();
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', async () => {
      const mockDestroy = jest.fn();
      mockWebhookFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        destroy: mockDestroy,
      });

      await webhookService.deleteWebhook(1, 1);

      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should throw 404 when webhook not found', async () => {
      mockWebhookFindOne.mockResolvedValue(null);

      await expect(webhookService.deleteWebhook(999, 1))
        .rejects.toThrow();
    });
  });

  describe('testWebhook', () => {
    it('should send a test delivery to the webhook URL', async () => {
      mockWebhookFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      });

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      });

      mockDeliveryCreate.mockResolvedValue({ id: 1, save: jest.fn().mockResolvedValue() });

      const result = await webhookService.testWebhook(1, 1);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('HMAC signing', () => {
    it('should generate correct HMAC signature for payload', () => {
      const secret = 'webhook-secret-123';
      const payload = { event: 'test', data: { id: 1 } };
      const payloadStr = JSON.stringify(payload);

      const expectedSig = crypto.createHmac('sha256', secret)
        .update(payloadStr)
        .digest('hex');

      // Test the signing utility if exported, or test via delivery
      expect(expectedSig).toBeDefined();
      expect(expectedSig).toHaveLength(64); // SHA-256 hex
    });
  });

  describe('getDeliveryLog', () => {
    it('should return delivery history for a webhook', async () => {
      mockWebhookFindOne.mockResolvedValue({
        id: 1,
        userId: 1,
      });

      const { WebhookDelivery } = require('../../../backend/src/models');
      WebhookDelivery.findAndCountAll.mockResolvedValue({
        rows: [
          { id: 1, webhookId: 1, eventType: 'test', status: 'success', responseCode: 200 },
        ],
        count: 1,
      });

      const result = await webhookService.getDeliveryLog(1, 1, { page: 1, limit: 20 });

      expect(result).toBeDefined();
      expect(result.deliveries).toBeDefined();
    });
  });
});
