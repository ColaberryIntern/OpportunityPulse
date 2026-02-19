const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('../logging/logger');

/**
 * Express middleware that caches JSON responses.
 * @param {string} keyPrefix - Cache key prefix (e.g., 'dashboard:stats')
 * @param {number} ttlSeconds - Time-to-live in seconds
 */
function cacheResponse(keyPrefix, ttlSeconds = 60) {
  return async (req, res, next) => {
    if (!isRedisConnected()) return next();

    const redis = getRedisClient();
    // Build cache key from prefix + query params + user ID (if auth'd)
    const userId = req.user?.userId || 'anon';
    const queryKey = JSON.stringify(req.query);
    const cacheKey = `cache:${keyPrefix}:${userId}:${queryKey}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.info(`Cache HIT: ${keyPrefix}`);
        return res.json(JSON.parse(cached));
      }
    } catch (err) {
      logger.warn('Cache read error:', err.message);
    }

    // Intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const redis = getRedisClient();
          if (isRedisConnected()) {
            redis.setex(cacheKey, ttlSeconds, JSON.stringify(data)).catch(() => {});
          }
        } catch (err) {
          // silently fail
        }
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate all cache entries matching a pattern.
 * @param {string} pattern - Pattern like 'cache:dashboard:*'
 */
async function invalidateCache(pattern) {
  if (!isRedisConnected()) return;

  const redis = getRedisClient();
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cache invalidated: ${keys.length} keys matching ${pattern}`);
    }
  } catch (err) {
    logger.warn('Cache invalidation error:', err.message);
  }
}

module.exports = { cacheResponse, invalidateCache };
