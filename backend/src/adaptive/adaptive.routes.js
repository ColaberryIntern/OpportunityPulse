const express = require('express');
const router = express.Router();
const adaptiveController = require('./adaptive.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.get('/', adaptiveController.getAdaptiveLearning);
router.post('/track', adaptiveController.trackBehavior);

module.exports = router;
