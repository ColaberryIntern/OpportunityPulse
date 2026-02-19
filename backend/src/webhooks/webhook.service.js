const crypto = require('crypto');
const { Webhook, WebhookDelivery } = require('../models');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const { signPayload } = require('./eventBus');
const logger = require('../logging/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

/**
 * Create a new webhook for a user.
 * Generates a secret via crypto.randomBytes(32) and returns it once.
 */
async function createWebhook(userId, { url, eventTypes, description }) {
  const secret = crypto.randomBytes(32).toString('hex');

  const webhook = await Webhook.create({
    userId,
    url,
    eventTypes,
    secret,
    description: description || null,
    isActive: true,
  });

  logger.info(`Webhook created for user ${userId}: ${webhook.id}`);

  return {
    webhook: {
      id: webhook.id,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      description: webhook.description,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    },
    secret,
  };
}

/**
 * List all webhooks for a user, ordered by created_at DESC.
 */
async function listWebhooks(userId) {
  const webhooks = await Webhook.findAll({
    where: { userId },
    attributes: { exclude: ['secret'] },
    order: [['created_at', 'DESC']],
  });

  return webhooks;
}

/**
 * Update a webhook's fields.
 * Throws 404 if not found or not owned by user.
 */
async function updateWebhook(webhookId, userId, { url, eventTypes, description, isActive }) {
  const webhook = await Webhook.findOne({ where: { id: webhookId, userId } });

  if (!webhook) {
    throw new AppError('Webhook not found.', 404);
  }

  if (url !== undefined) webhook.url = url;
  if (eventTypes !== undefined) webhook.eventTypes = eventTypes;
  if (description !== undefined) webhook.description = description;
  if (isActive !== undefined) webhook.isActive = isActive;

  await webhook.save();

  logger.info(`Webhook ${webhookId} updated by user ${userId}`);

  return {
    id: webhook.id,
    url: webhook.url,
    eventTypes: webhook.eventTypes,
    description: webhook.description,
    isActive: webhook.isActive,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
  };
}

/**
 * Delete a webhook.
 * Throws 404 if not found or not owned by user.
 */
async function deleteWebhook(webhookId, userId) {
  const webhook = await Webhook.findOne({ where: { id: webhookId, userId } });

  if (!webhook) {
    throw new AppError('Webhook not found.', 404);
  }

  await webhook.destroy();

  logger.info(`Webhook ${webhookId} deleted by user ${userId}`);

  return { id: webhookId };
}

/**
 * Test a webhook by sending a test payload.
 * Throws 404 if not found or not owned by user.
 */
async function testWebhook(webhookId, userId) {
  const webhook = await Webhook.findOne({ where: { id: webhookId, userId } });

  if (!webhook) {
    throw new AppError('Webhook not found.', 404);
  }

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'Test webhook delivery' },
  };

  const payloadString = JSON.stringify(testPayload);
  const signature = signPayload(payloadString, webhook.secret);

  // Create delivery record
  const delivery = await WebhookDelivery.create({
    webhookId: webhook.id,
    eventType: 'test',
    payload: testPayload,
    status: 'pending',
    attempts: 1,
  });

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'test',
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000),
    });

    const responseBody = await response.text().catch(() => '');

    delivery.status = response.ok ? 'success' : 'failed';
    delivery.responseCode = response.status;
    delivery.responseBody = responseBody.substring(0, 2000);
    await delivery.save();

    return {
      success: response.ok,
      statusCode: response.status,
      deliveryId: delivery.id,
    };
  } catch (error) {
    delivery.status = 'failed';
    delivery.responseBody = error.message.substring(0, 2000);
    await delivery.save();

    return {
      success: false,
      error: error.message,
      deliveryId: delivery.id,
    };
  }
}

/**
 * Get paginated delivery log for a webhook.
 * Throws 404 if webhook not found or not owned by user.
 */
async function getDeliveryLog(webhookId, userId, query) {
  const webhook = await Webhook.findOne({ where: { id: webhookId, userId } });

  if (!webhook) {
    throw new AppError('Webhook not found.', 404);
  }

  const { page, limit, offset } = parsePagination(query);

  const { count, rows } = await WebhookDelivery.findAndCountAll({
    where: { webhookId },
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  return {
    deliveries: rows,
    pagination: buildPaginationMeta(count, page, limit),
  };
}

module.exports = {
  createWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getDeliveryLog,
  AppError,
};
