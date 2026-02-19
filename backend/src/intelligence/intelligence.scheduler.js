const cron = require('node-cron');
const logger = require('../logging/logger');

let schedulerStarted = false;

/**
 * Start the Intelligence Engine schedulers.
 * Idempotent — calling multiple times only starts once.
 *
 * Jobs:
 * 1. Domain classification: every 2h at :20
 * 2. Capability classification: every 2h at :25
 * 3. Strategic intent: every 2h at :30
 * 4. Monetization angle: every 2h at :35
 * 5. Maturity phase: every 2h at :40
 * 6. Geographic tagging: every 2h at :45
 * 7. Meta signal computation: daily 4 AM UTC
 * 8. Cluster detection: daily 4:30 AM UTC
 */
function startIntelligenceScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const domainSchedule = process.env.DOMAIN_CLASS_SCHEDULE || '20 */2 * * *';
  const capabilitySchedule = process.env.CAPABILITY_CLASS_SCHEDULE || '25 */2 * * *';
  const intentSchedule = process.env.INTENT_CLASS_SCHEDULE || '30 */2 * * *';
  const monetizationSchedule = process.env.MONETIZATION_CLASS_SCHEDULE || '35 */2 * * *';
  const maturitySchedule = process.env.MATURITY_CLASS_SCHEDULE || '40 */2 * * *';
  const geoSchedule = process.env.GEO_CLASS_SCHEDULE || '45 */2 * * *';
  const metaSignalSchedule = process.env.META_SIGNAL_SCHEDULE || '0 4 * * *';
  const clusterSchedule = process.env.CLUSTER_SCHEDULE || '30 4 * * *';

  // Domain classification
  cron.schedule(domainSchedule, async () => {
    logger.info('Scheduled: Domain classification starting');
    try {
      const { classifyDomains } = require('./domainClassifier.service');
      const result = await classifyDomains();
      logger.info('Scheduled: Domain classification complete', { input: result.inputCount, output: result.outputCount });
    } catch (error) {
      logger.error('Scheduled: Domain classification failed', { error: error.message });
    }
  });

  // Capability classification
  cron.schedule(capabilitySchedule, async () => {
    logger.info('Scheduled: Capability classification starting');
    try {
      const { classifyCapabilities } = require('./capabilityClassifier.service');
      const result = await classifyCapabilities();
      logger.info('Scheduled: Capability classification complete', { input: result.inputCount, output: result.outputCount });
    } catch (error) {
      logger.error('Scheduled: Capability classification failed', { error: error.message });
    }
  });

  // Strategic intent
  cron.schedule(intentSchedule, async () => {
    logger.info('Scheduled: Strategic intent classification starting');
    try {
      const { classifyStrategicIntents } = require('./strategicIntentEngine.service');
      const result = await classifyStrategicIntents();
      logger.info('Scheduled: Strategic intent classification complete', { input: result.inputCount, output: result.outputCount });
    } catch (error) {
      logger.error('Scheduled: Strategic intent classification failed', { error: error.message });
    }
  });

  // Monetization angle
  cron.schedule(monetizationSchedule, async () => {
    logger.info('Scheduled: Monetization angle classification starting');
    try {
      const { classifyMonetizationAngles } = require('./monetizationEngine.service');
      const result = await classifyMonetizationAngles();
      logger.info('Scheduled: Monetization angle classification complete', { input: result.inputCount, output: result.outputCount });
    } catch (error) {
      logger.error('Scheduled: Monetization angle classification failed', { error: error.message });
    }
  });

  // Maturity phase
  cron.schedule(maturitySchedule, async () => {
    logger.info('Scheduled: Maturity phase classification starting');
    try {
      const { classifyMaturityPhases } = require('./maturityEngine.service');
      const result = await classifyMaturityPhases();
      logger.info('Scheduled: Maturity phase classification complete', { input: result.inputCount, output: result.outputCount });
    } catch (error) {
      logger.error('Scheduled: Maturity phase classification failed', { error: error.message });
    }
  });

  // Geographic tagging
  cron.schedule(geoSchedule, async () => {
    logger.info('Scheduled: Geographic tagging starting');
    try {
      const { classifyGeographicTags } = require('./geographicEngine.service');
      const result = await classifyGeographicTags();
      logger.info('Scheduled: Geographic tagging complete', { input: result.inputCount, output: result.outputCount });
    } catch (error) {
      logger.error('Scheduled: Geographic tagging failed', { error: error.message });
    }
  });

  // Meta signal computation (daily)
  cron.schedule(metaSignalSchedule, async () => {
    logger.info('Scheduled: Meta signal computation starting');
    try {
      const { computeMetaSignals } = require('./metaSignalEngine.service');
      await computeMetaSignals();
      logger.info('Scheduled: Meta signal computation complete');
    } catch (error) {
      logger.error('Scheduled: Meta signal computation failed', { error: error.message });
    }
  });

  // Cluster detection (daily)
  cron.schedule(clusterSchedule, async () => {
    logger.info('Scheduled: Cluster detection starting');
    try {
      const { detectClusters } = require('./clusterEngine.service');
      await detectClusters();
      logger.info('Scheduled: Cluster detection complete');
    } catch (error) {
      logger.error('Scheduled: Cluster detection failed', { error: error.message });
    }
  });

  logger.info('Intelligence Engine scheduler started — 8 jobs registered');
}

module.exports = { startIntelligenceScheduler };
