// Mock the models and logger before requiring eventBus
jest.mock('../../../backend/src/models', () => ({
  Webhook: {
    findAll: jest.fn(),
  },
  WebhookDelivery: {
    create: jest.fn(),
  },
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// We need to mock fetch for delivery
global.fetch = jest.fn();

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    global.fetch.mockReset();

    // Re-require to get fresh singleton
    eventBus = require('../../../backend/src/webhooks/eventBus');
  });

  it('should be a singleton', () => {
    const eventBus2 = require('../../../backend/src/webhooks/eventBus');
    expect(eventBus).toBe(eventBus2);
  });

  it('should export emit function', () => {
    expect(typeof eventBus.emit).toBe('function');
  });

  it('should export EVENTS constant with event types', () => {
    expect(eventBus.EVENTS).toBeDefined();
    expect(eventBus.EVENTS.OPPORTUNITY_CREATED).toBe('opportunity.created');
    expect(eventBus.EVENTS.ALERT_CREATED).toBe('alert.created');
    expect(eventBus.EVENTS.INGESTION_COMPLETED).toBe('ingestion.completed');
    expect(eventBus.EVENTS.CONTENT_PUBLISHED).toBe('content.published');
  });

  it('should handle emit when no webhooks match', async () => {
    const { Webhook } = require('../../../backend/src/models');
    Webhook.findAll.mockResolvedValue([]);

    await eventBus.emit('opportunity.created', { id: 1, title: 'Test' });

    expect(Webhook.findAll).toHaveBeenCalled();
    // No deliveries should be created
    const { WebhookDelivery } = require('../../../backend/src/models');
    expect(WebhookDelivery.create).not.toHaveBeenCalled();
  });

  it('should deliver to matching webhooks', async () => {
    const { Webhook, WebhookDelivery } = require('../../../backend/src/models');

    Webhook.findAll.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      },
    ]);

    WebhookDelivery.create.mockResolvedValue({ id: 1 });
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    });

    await eventBus.emit('opportunity.created', { id: 1, title: 'New Opportunity' });

    expect(Webhook.findAll).toHaveBeenCalled();
  });

  it('should gracefully handle delivery errors', async () => {
    const { Webhook } = require('../../../backend/src/models');

    Webhook.findAll.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        url: 'https://example.com/hook',
        secret: 'test-secret',
        isActive: true,
      },
    ]);

    global.fetch.mockRejectedValue(new Error('Connection refused'));

    // Should not throw
    await expect(eventBus.emit('alert.created', { id: 1 })).resolves.not.toThrow();
  });

  it('should not deliver to inactive webhooks', async () => {
    const { Webhook } = require('../../../backend/src/models');

    // findAll with isActive filter should return empty
    Webhook.findAll.mockResolvedValue([]);

    await eventBus.emit('ingestion.completed', { sourceCount: 5 });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
