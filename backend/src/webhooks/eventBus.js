const crypto = require('crypto');
const logger = require('../logging/logger');

/**
 * Supported webhook event types.
 */
const EVENTS = {
  OPPORTUNITY_CREATED: 'opportunity.created',
  ALERT_CREATED: 'alert.created',
  INGESTION_COMPLETED: 'ingestion.completed',
  CONTENT_PUBLISHED: 'content.published',
};

/**
 * Sign a payload string with HMAC-SHA256 using the given secret.
 * Returns the signature in the format: sha256=<hex_digest>
 */
function signPayload(payloadString, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Deliver a webhook payload to a single webhook endpoint.
 * Creates a WebhookDelivery record and POSTs the payload.
 * Never throws — all errors are caught and logged.
 */
async function deliverToWebhook(webhook, eventType, payload, WebhookDelivery) {
  let delivery;
  try {
    // Create delivery record in pending state
    delivery = await WebhookDelivery.create({
      webhookId: webhook.id,
      eventType,
      payload,
      status: 'pending',
      attempts: 1,
    });

    const payloadString = JSON.stringify(payload);
    const signature = signPayload(payloadString, webhook.secret);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': eventType,
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const responseBody = await response.text().catch(() => '');

    delivery.status = response.ok ? 'success' : 'failed';
    delivery.responseCode = response.status;
    delivery.responseBody = responseBody.substring(0, 2000); // truncate long responses
    await delivery.save();

    if (!response.ok) {
      logger.warn(`Webhook delivery failed for webhook ${webhook.id}: HTTP ${response.status}`);
    }
  } catch (error) {
    logger.error(`Webhook delivery error for webhook ${webhook.id}: ${error.message}`);
    if (delivery) {
      try {
        delivery.status = 'failed';
        delivery.responseBody = error.message.substring(0, 2000);
        await delivery.save();
      } catch (saveError) {
        logger.error(`Failed to update delivery record: ${saveError.message}`);
      }
    }
  }
}

/**
 * Emit a webhook event.
 * Finds all active webhooks subscribed to the given eventType and
 * delivers the payload to each one. Never throws.
 *
 * @param {string} eventType - One of the EVENTS values
 * @param {object} payload - The event payload to deliver
 */
async function emit(eventType, payload) {
  try {
    // Lazy-require models to avoid circular dependency at startup
    const { Webhook, WebhookDelivery } = require('../models');
    const { Op } = require('sequelize');

    // Find all active webhooks that include this eventType
    const webhooks = await Webhook.findAll({
      where: {
        isActive: true,
        eventTypes: {
          [Op.contains]: [eventType],
        },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    logger.info(`Emitting ${eventType} to ${webhooks.length} webhook(s)`);

    // Deliver to all matching webhooks concurrently (fire-and-forget)
    const deliveryPromises = webhooks.map((webhook) =>
      deliverToWebhook(webhook, eventType, payload, WebhookDelivery)
    );

    // Wait for all deliveries but never throw
    await Promise.allSettled(deliveryPromises);

    // Also broadcast via Socket.IO for real-time updates (non-blocking)
    try {
      const { broadcast } = require('../config/socketBroadcaster');
      broadcast(eventType, payload);
    } catch (_) { /* socket not initialized */ }
  } catch (error) {
    // Top-level catch — emit must NEVER throw
    logger.error(`EventBus emit error: ${error.message}`);
  }
}

module.exports = {
  EVENTS,
  emit,
  signPayload,
};
