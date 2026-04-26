const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const controller = require('./strategic.controller');

const router = express.Router();

// Reads — any authenticated user.
router.get('/', verifyToken, controller.listStrategic);
router.get('/:id', verifyToken, controller.getStrategic);

// Writes — admin only.
router.post('/run', verifyToken, checkPermissions(ROLES.ADMIN), controller.triggerRun);
router.patch('/:id', verifyToken, checkPermissions(ROLES.ADMIN), controller.patchStatus);

module.exports = router;
