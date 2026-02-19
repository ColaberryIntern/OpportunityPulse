const { body, param } = require('express-validator');

const VALID_EVENT_TYPES = [
  'opportunity.created',
  'alert.created',
  'ingestion.completed',
  'content.published',
];

const validateCreateWebhook = [
  body('url')
    .trim()
    .notEmpty()
    .withMessage('Webhook URL is required')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('URL must be a valid HTTP or HTTPS URL')
    .isLength({ max: 512 })
    .withMessage('URL must be 512 characters or fewer'),
  body('eventTypes')
    .isArray({ min: 1 })
    .withMessage('At least one event type is required')
    .custom((arr) => arr.every((e) => VALID_EVENT_TYPES.includes(e)))
    .withMessage(`Each event type must be one of: ${VALID_EVENT_TYPES.join(', ')}`),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be 255 characters or fewer'),
];

const validateUpdateWebhook = [
  param('id').isInt({ min: 1 }).withMessage('Webhook ID must be a positive integer'),
  body('url')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('URL cannot be empty')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('URL must be a valid HTTP or HTTPS URL')
    .isLength({ max: 512 })
    .withMessage('URL must be 512 characters or fewer'),
  body('eventTypes')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one event type is required')
    .custom((arr) => arr.every((e) => VALID_EVENT_TYPES.includes(e)))
    .withMessage(`Each event type must be one of: ${VALID_EVENT_TYPES.join(', ')}`),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must be 255 characters or fewer'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const validateWebhookId = [
  param('id').isInt({ min: 1 }).withMessage('Webhook ID must be a positive integer'),
];

module.exports = {
  validateCreateWebhook,
  validateUpdateWebhook,
  validateWebhookId,
  VALID_EVENT_TYPES,
};
