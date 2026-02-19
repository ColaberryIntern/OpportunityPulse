const Redis = require('ioredis');
const logger = require('../logging/logger');

let client = null;
let isConnected = false;

function getRedisClient() {
  if (client) return client;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  client.on('connect', () => {
    isConnected = true;
    logger.info('Redis connected');
  });

  client.on('error', (err) => {
    isConnected = false;
    logger.warn('Redis error:', err.message);
  });

  client.on('close', () => {
    isConnected = false;
  });

  // Attempt connection but don't block
  client.connect().catch(() => {
    logger.warn('Redis connection failed, caching disabled');
  });

  return client;
}

function isRedisConnected() {
  return isConnected;
}

module.exports = { getRedisClient, isRedisConnected };
