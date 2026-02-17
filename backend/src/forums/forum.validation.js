const { body, param } = require('express-validator');

const createPostValidation = [
  body('title')
    .notEmpty()
    .withMessage('Title is required.')
    .isLength({ max: 255 })
    .withMessage('Title must not exceed 255 characters.')
    .trim(),
  body('body')
    .notEmpty()
    .withMessage('Body is required.')
    .trim(),
  body('category')
    .optional()
    .isIn(['general', 'gov_contracts', 'ai_jobs', 'investments', 'platform'])
    .withMessage('Invalid category.'),
];

const updatePostValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Post ID must be a positive integer.'),
  body('title')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Title must not exceed 255 characters.')
    .trim(),
  body('body')
    .optional()
    .trim(),
  body('category')
    .optional()
    .isIn(['general', 'gov_contracts', 'ai_jobs', 'investments', 'platform'])
    .withMessage('Invalid category.'),
  body('status')
    .optional()
    .isIn(['open', 'closed', 'pinned'])
    .withMessage('Status must be open, closed, or pinned.'),
];

const createCommentValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Post ID must be a positive integer.'),
  body('body')
    .notEmpty()
    .withMessage('Comment body is required.')
    .trim(),
];

const updateCommentValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Post ID must be a positive integer.'),
  param('commentId')
    .isInt({ min: 1 })
    .withMessage('Comment ID must be a positive integer.'),
  body('body')
    .notEmpty()
    .withMessage('Comment body is required.')
    .trim(),
];

module.exports = {
  createPostValidation,
  updatePostValidation,
  createCommentValidation,
  updateCommentValidation,
};
