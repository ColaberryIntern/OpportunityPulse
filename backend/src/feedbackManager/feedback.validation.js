const { body, param } = require('express-validator');

const createFeedbackValidation = [
  body('score')
    .isInt({ min: 1, max: 5 })
    .withMessage('Score must be between 1 and 5.'),
  body('comments')
    .optional()
    .isString()
    .trim(),
  body('type')
    .optional()
    .isIn(['platform', 'opportunity', 'content'])
    .withMessage('Type must be platform, opportunity, or content.'),
  body('targetId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Target ID must be a positive integer.'),
];

const updateFeedbackValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Feedback ID must be a positive integer.'),
  body('score')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Score must be between 1 and 5.'),
  body('comments')
    .optional()
    .isString()
    .trim(),
  body('status')
    .optional()
    .isIn(['pending', 'reviewed', 'resolved'])
    .withMessage('Status must be pending, reviewed, or resolved.'),
];

module.exports = {
  createFeedbackValidation,
  updateFeedbackValidation,
};
