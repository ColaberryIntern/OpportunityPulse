const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ApiKey, User } = require('../models');
const logger = require('../logging/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

const BCRYPT_ROUNDS = 10;

/**
 * Create a new API key for a user.
 * Returns the plaintext key (shown once) and the database record.
 */
async function createApiKey(userId, { name, scopes = ['read'] }) {
  // Generate a 32-byte random hex string (64 hex chars)
  const rawHex = crypto.randomBytes(32).toString('hex');
  const plainTextKey = `op_${rawHex}`;
  const keyPrefix = `op_${rawHex.substring(0, 8)}`;

  // Hash the full key for storage
  const keyHash = await bcrypt.hash(plainTextKey, BCRYPT_ROUNDS);

  const record = await ApiKey.create({
    userId,
    name,
    keyPrefix,
    keyHash,
    scopes,
    isActive: true,
  });

  logger.info(`API key created for user ${userId}: ${keyPrefix}...`);

  return {
    apiKey: plainTextKey,
    record: {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
      isActive: record.isActive,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    },
  };
}

/**
 * List all API keys for a user (without keyHash).
 */
async function listApiKeys(userId) {
  const keys = await ApiKey.findAll({
    where: { userId },
    attributes: { exclude: ['keyHash'] },
    order: [['created_at', 'DESC']],
  });

  return keys;
}

/**
 * Revoke an API key by setting is_active to false.
 */
async function revokeApiKey(apiKeyId, userId) {
  const key = await ApiKey.findOne({ where: { id: apiKeyId, userId } });

  if (!key) {
    throw new AppError('API key not found.', 404);
  }

  key.isActive = false;
  await key.save();

  logger.info(`API key ${key.keyPrefix} revoked by user ${userId}`);

  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    isActive: key.isActive,
  };
}

/**
 * Update an API key's name and/or scopes.
 */
async function updateApiKey(apiKeyId, userId, { name, scopes }) {
  const key = await ApiKey.findOne({ where: { id: apiKeyId, userId } });

  if (!key) {
    throw new AppError('API key not found.', 404);
  }

  if (name !== undefined) key.name = name;
  if (scopes !== undefined) key.scopes = scopes;

  await key.save();

  logger.info(`API key ${key.keyPrefix} updated by user ${userId}`);

  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    isActive: key.isActive,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

/**
 * Validate a raw API key.
 * Extracts the prefix, finds the matching record, verifies the hash,
 * checks active status and expiry, and updates lastUsedAt.
 * Returns user information if valid.
 */
async function validateApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith('op_') || rawKey.length < 11) {
    throw new AppError('Invalid API key format.', 401);
  }

  // Extract prefix: "op_" + first 8 hex chars of the raw hex portion
  const keyPrefix = rawKey.substring(0, 11); // "op_" (3) + 8 chars = 11

  const keyRecord = await ApiKey.findOne({
    where: { keyPrefix },
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'role_id'] }],
  });

  if (!keyRecord) {
    throw new AppError('Invalid API key.', 401);
  }

  // Verify the full key hash
  const isValid = await bcrypt.compare(rawKey, keyRecord.keyHash);
  if (!isValid) {
    throw new AppError('Invalid API key.', 401);
  }

  // Check if key is active
  if (!keyRecord.isActive) {
    throw new AppError('API key has been revoked.', 401);
  }

  // Check expiration
  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    throw new AppError('API key has expired.', 401);
  }

  // Update lastUsedAt (fire-and-forget, don't block the request)
  keyRecord.lastUsedAt = new Date();
  keyRecord.save().catch((err) => {
    logger.error('Failed to update API key lastUsedAt:', err);
  });

  return {
    userId: keyRecord.user.id,
    email: keyRecord.user.email,
    roleId: keyRecord.user.role_id,
    scopes: keyRecord.scopes,
  };
}

module.exports = {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  updateApiKey,
  validateApiKey,
  AppError,
};
