const { classifyDomains } = require('./domainClassifier.service');
const { classifyCapabilities } = require('./capabilityClassifier.service');
const {
  AiDomain, AiCapability, StrategicIntent, MonetizationAngle,
  MaturityPhase, GeographicTag, MetaSignal, StrategicCluster,
  OpportunityClassification, sequelize,
} = require('../models');
const logger = require('../logging/logger');

/**
 * List dimension values with opportunity counts.
 */
async function listDimension(model, fkColumn) {
  const tableName = model.getTableName();
  const rows = await model.findAll({
    attributes: {
      include: [
        [
          sequelize.literal(`(SELECT COUNT(*) FROM opportunity_classifications WHERE ${fkColumn} = "${tableName}"."id")`),
          'opportunityCount',
        ],
      ],
    },
    order: [['name', 'ASC']],
  });
  return rows;
}

async function getDomains(req, res, next) {
  try {
    const rows = await listDimension(AiDomain, 'domain_id');
    res.json({ domains: rows });
  } catch (err) { next(err); }
}

async function getCapabilities(req, res, next) {
  try {
    const rows = await listDimension(AiCapability, 'capability_id');
    res.json({ capabilities: rows });
  } catch (err) { next(err); }
}

async function getIntents(req, res, next) {
  try {
    const rows = await listDimension(StrategicIntent, 'strategic_intent_id');
    res.json({ intents: rows });
  } catch (err) { next(err); }
}

async function getMonetizationAngles(req, res, next) {
  try {
    const rows = await listDimension(MonetizationAngle, 'monetization_angle_id');
    res.json({ monetizationAngles: rows });
  } catch (err) { next(err); }
}

async function getMaturityPhases(req, res, next) {
  try {
    const rows = await listDimension(MaturityPhase, 'maturity_phase_id');
    res.json({ maturityPhases: rows });
  } catch (err) { next(err); }
}

async function getGeographicTags(req, res, next) {
  try {
    const rows = await listDimension(GeographicTag, 'geographic_tag_id');
    res.json({ geographicTags: rows });
  } catch (err) { next(err); }
}

async function getMetaSignals(req, res, next) {
  try {
    const signals = await MetaSignal.findAll({ order: [['name', 'ASC']] });
    res.json({ metaSignals: signals });
  } catch (err) { next(err); }
}

async function getClusters(req, res, next) {
  try {
    const clusters = await StrategicCluster.findAll({
      where: { isActive: true },
      include: [
        { model: AiDomain, as: 'domain', attributes: ['slug', 'name'] },
        { model: AiCapability, as: 'capability', attributes: ['slug', 'name'] },
        { model: StrategicIntent, as: 'intent', attributes: ['slug', 'name'] },
      ],
      order: [['opportunity_count', 'DESC']],
    });
    res.json({ clusters });
  } catch (err) { next(err); }
}

async function getHeatmap(req, res, next) {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        d.slug AS domain_slug,
        d.name AS domain_name,
        COUNT(oc.id) AS opportunity_count,
        AVG(oc.demand_score) AS avg_demand,
        AVG(oc.competition_score) AS avg_competition
      FROM opportunity_classifications oc
      JOIN ai_domains d ON d.id = oc.domain_id
      GROUP BY d.slug, d.name
      ORDER BY opportunity_count DESC
    `);
    res.json({ heatmap: rows });
  } catch (err) { next(err); }
}

/**
 * Admin: trigger full classification pipeline.
 */
async function triggerClassify(req, res, next) {
  try {
    logger.info('Admin: Manual classification pipeline triggered');
    const domainRun = await classifyDomains();
    const capabilityRun = await classifyCapabilities();

    // Lazy-load optional engines (may not exist yet in early sprints)
    const results = { domain: domainRun.toJSON(), capability: capabilityRun.toJSON() };

    try {
      const { classifyStrategicIntents } = require('./strategicIntentEngine.service');
      results.intent = (await classifyStrategicIntents()).toJSON();
    } catch (e) { /* not yet implemented */ }

    try {
      const { classifyMonetizationAngles } = require('./monetizationEngine.service');
      results.monetization = (await classifyMonetizationAngles()).toJSON();
    } catch (e) { /* not yet implemented */ }

    try {
      const { classifyMaturityPhases } = require('./maturityEngine.service');
      results.maturity = (await classifyMaturityPhases()).toJSON();
    } catch (e) { /* not yet implemented */ }

    try {
      const { classifyGeographicTags } = require('./geographicEngine.service');
      results.geographic = (await classifyGeographicTags()).toJSON();
    } catch (e) { /* not yet implemented */ }

    res.json({ message: 'Classification pipeline complete', results });
  } catch (err) { next(err); }
}

async function triggerClusterDetection(req, res, next) {
  try {
    const { detectClusters } = require('./clusterEngine.service');
    const result = await detectClusters();
    res.json({ message: 'Cluster detection complete', result });
  } catch (err) { next(err); }
}

async function triggerMetaSignalComputation(req, res, next) {
  try {
    const { computeMetaSignals } = require('./metaSignalEngine.service');
    const result = await computeMetaSignals();
    res.json({ message: 'Meta signal computation complete', result });
  } catch (err) { next(err); }
}

module.exports = {
  getDomains,
  getCapabilities,
  getIntents,
  getMonetizationAngles,
  getMaturityPhases,
  getGeographicTags,
  getMetaSignals,
  getClusters,
  getHeatmap,
  triggerClassify,
  triggerClusterDetection,
  triggerMetaSignalComputation,
};
