const express = require('express');
const router = express.Router();
const savedOpportunityController = require('./savedOpportunity.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.get('/', savedOpportunityController.list);
router.post('/', savedOpportunityController.save);
router.post('/batch-check', savedOpportunityController.batchCheckSaved);
router.get('/:opportunityId/check', savedOpportunityController.checkSaved);
router.delete('/:opportunityId', savedOpportunityController.unsave);

module.exports = router;
