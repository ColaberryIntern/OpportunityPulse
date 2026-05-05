// v1 OIED digest scheduler — REMOVED in v5. The v4 briefing service +
// scheduler is the production surface. This file is kept as a no-op
// shim so any legacy `require('./oied.scheduler')` still resolves.
//
// To enable a daily digest, use:
//   OIED_BRIEFING_ENABLED=true
//   OIED_BRIEFING_TO=...
// from oied/briefing.scheduler.js.

const logger = require('../logging/logger');

function startOiedDigestScheduler() {
  logger.info('OIED digest scheduler is a no-op since v5 (use briefing scheduler)');
  return null;
}

function stopOiedDigestScheduler() { /* nothing to stop */ }

module.exports = { startOiedDigestScheduler, stopOiedDigestScheduler };
