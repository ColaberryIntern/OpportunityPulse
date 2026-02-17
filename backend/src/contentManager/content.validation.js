const { body, param } = require('express-validator');

const createContentValidation = [
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
    .isLength({ max: 100 })
    .withMessage('Category must not exceed 100 characters.')
    .trim(),
  body('tags')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Tags must be an array with at most 20 items.'),
  body('tags.*')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Each tag must be a string of at most 100 characters.'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Status must be draft, published, or archived.'),
];

const updateContentValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Content ID must be a positive integer.'),
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
    .isLength({ max: 100 })
    .withMessage('Category must not exceed 100 characters.')
    .trim(),
  body('tags')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Tags must be an array with at most 20 items.'),
  body('tags.*')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Each tag must be a string of at most 100 characters.'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Status must be draft, published, or archived.'),
];

module.exports = {
  createContentValidation,
  updateContentValidation,
};
