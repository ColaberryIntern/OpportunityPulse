const logger = require('../logging/logger');

async function broadcastDashboardUpdate() {
  try {
    const dashboardService = require('./dashboard.service');
    const { broadcast } = require('../config/socketBroadcaster');
    const oppStats = await dashboardService.getOpportunityStats();
    broadcast('dashboard.stats_updated', { opportunityStats: oppStats });
  } catch (err) {
    logger.warn('Dashboard realtime broadcast error:', err.message);
  }
}

module.exports = { broadcastDashboardUpdate };
