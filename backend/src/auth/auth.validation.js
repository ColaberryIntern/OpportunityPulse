const { body } = require('express-validator');

const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must not exceed 255 characters.'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters.')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number.')
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage('Password must contain at least one special character.'),
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
];

const profileUpdateValidation = [
  body('name')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Name must not exceed 255 characters.')
    .trim(),
  body('company')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Company must not exceed 255 characters.')
    .trim(),
  body('interests')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Interests must not exceed 2000 characters.')
    .trim(),
];

const resendVerificationValidation = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
];

module.exports = {
  registerValidation,
  loginValidation,
  profileUpdateValidation,
  resendVerificationValidation,
};
