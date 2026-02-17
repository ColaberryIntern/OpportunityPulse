const express = require('express');
const router = express.Router();
const roleController = require('./role.controller');
const { assignRoleValidation, updateRoleValidation } = require('./role.validation');
const { handleValidationErrors } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');

// All role routes require authentication + admin role
router.use(verifyToken, checkPermissions(ROLES.ADMIN));

/**
 * @swagger
 * /roles:
 *   get:
 *     tags: [Roles]
 *     summary: List all roles (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all roles
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.get(
  '/',
  roleController.listRoles
);

/**
 * @swagger
 * /roles/assign:
 *   post:
 *     tags: [Roles]
 *     summary: Assign role to a user (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, roleId]
 *             properties:
 *               userId:
 *                 type: integer
 *               roleId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Role assigned successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.post(
  '/assign',
  assignRoleValidation,
  handleValidationErrors,
  roleController.assignRole
);

/**
 * @swagger
 * /roles/{id}:
 *   put:
 *     tags: [Roles]
 *     summary: Update a role (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Role ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               permissions:
 *                 type: object
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.put(
  '/:id',
  updateRoleValidation,
  handleValidationErrors,
  roleController.updateRole
);

module.exports = router;
