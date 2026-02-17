const { param } = require('express-validator');

const validateType = [
  param('type')
    .isIn(['gov_contract', 'ai_job', 'investment'])
    .withMessage('Type must be one of: gov_contract, ai_job, investment'),
];

module.exports = { validateType };
