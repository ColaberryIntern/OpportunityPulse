const logger = require('../logging/logger');

function broadcast(eventType, payload, options = {}) {
  try {
    const { getIO } = require('./socket');
    const io = getIO();

    if (options.userId) {
      io.to(`user:${options.userId}`).emit(eventType, payload);
    } else {
      io.emit(eventType, payload);
    }

    logger.info(`Socket broadcast: ${eventType}`, { targeted: !!options.userId });
  } catch (err) {
    // Socket not initialized (e.g., in tests) — silently skip
    logger.debug(`Socket broadcast skipped: ${err.message}`);
  }
}

module.exports = { broadcast };
