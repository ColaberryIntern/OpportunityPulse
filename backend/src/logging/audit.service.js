const logger = require('./logger');

/**
 * Log an audit event for security monitoring and compliance.
 * Audit events are retained for 12 months per compliance requirements.
 */
function logAuditEvent({ userId, action, resource, resourceId, ip, userAgent, metadata }) {
  logger.info('AUDIT', {
    type: 'audit',
    userId,
    action,
    resource,
    resourceId,
    ip,
    userAgent,
    metadata,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { logAuditEvent };
