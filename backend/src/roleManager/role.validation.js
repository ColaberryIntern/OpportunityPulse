const { body, param } = require('express-validator');

const assignRoleValidation = [
  body('userId')
    .notEmpty()
    .withMessage('userId is required.')
    .isInt({ min: 1 })
    .withMessage('userId must be a positive integer.'),
  body('roleId')
    .notEmpty()
    .withMessage('roleId is required.')
    .isInt({ min: 1 })
    .withMessage('roleId must be a positive integer.'),
];

const updateRoleValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer.'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters.')
    .trim(),
];

module.exports = {
  assignRoleValidation,
  updateRoleValidation,
};
