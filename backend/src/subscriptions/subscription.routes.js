const express = require('express');
const router = express.Router();
const subscriptionController = require('./subscription.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.get('/', subscriptionController.getCurrentSubscription);
router.post('/upgrade', subscriptionController.upgrade);
router.post('/downgrade', subscriptionController.downgrade);
router.get('/history', subscriptionController.getHistory);

module.exports = router;
