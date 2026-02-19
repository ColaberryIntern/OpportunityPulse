const { query } = require('express-validator');

const listToolsValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('category').optional().isString().trim(),
  query('industry').optional().isString().trim(),
  query('q').optional().isString().trim().isLength({ max: 200 }).withMessage('search query must be at most 200 characters'),
  query('trendDirection').optional().isIn(['rising', 'stable', 'declining']).withMessage('trendDirection must be rising, stable, or declining'),
  query('sort').optional().isIn(['trending', 'updated', 'name', 'newest']).withMessage('sort must be trending, updated, name, or newest'),
];

module.exports = { listToolsValidation };
