const { Op } = require('sequelize');
const { StrategicCluster, OpportunityClassification, AiDomain, AiCapability, StrategicIntent, sequelize } = require('../models');
const logger = require('../logging/logger');

const MIN_CLUSTER_SIZE = 5;
const DEACTIVATE_BELOW = 3;

/**
 * Detect strategic clusters by grouping opportunities by (domain, capability, intent) tuples.
 * Creates/updates clusters for groups with >= MIN_CLUSTER_SIZE opportunities.
 * Deactivates clusters that fall below DEACTIVATE_BELOW.
 */
async function detectClusters() {
  try {
    // Group opportunities by (domain_id, capability_id, intent_id)
    const [groups] = await sequelize.query(`
      SELECT
        oc.domain_id,
        oc.capability_id,
        oc.strategic_intent_id AS intent_id,
        COUNT(oc.id) AS opp_count,
        AVG(CAST(o.ai_score AS FLOAT)) AS avg_score
      FROM opportunity_classifications oc
      JOIN opportunities o ON o.id = oc.opportunity_id
      WHERE oc.domain_id IS NOT NULL
        AND oc.capability_id IS NOT NULL
      GROUP BY oc.domain_id, oc.capability_id, oc.strategic_intent_id
      HAVING COUNT(oc.id) >= :minSize
      ORDER BY COUNT(oc.id) DESC
    `, { replacements: { minSize: MIN_CLUSTER_SIZE } });

    // Load dimension names for slug/name generation
    const domains = await AiDomain.findAll();
    const capabilities = await AiCapability.findAll();
    const intents = await StrategicIntent.findAll();

    const domainMap = new Map(domains.map((d) => [d.id, d]));
    const capMap = new Map(capabilities.map((c) => [c.id, c]));
    const intentMap = new Map(intents.map((i) => [i.id, i]));

    let created = 0;
    let updated = 0;

    for (const group of groups) {
      const domainId = group.domain_id;
      const capabilityId = group.capability_id;
      const intentId = group.intent_id || null;
      const count = parseInt(group.opp_count, 10);
      const avgScore = parseFloat(group.avg_score) || 0;

      const domain = domainMap.get(domainId);
      const capability = capMap.get(capabilityId);
      const intent = intentId ? intentMap.get(intentId) : null;

      if (!domain || !capability) continue;

      const slug = [domain.slug, capability.slug, intent?.slug].filter(Boolean).join('_');
      const name = [domain.name, capability.name, intent?.name].filter(Boolean).join(' + ');

      const [cluster, isNew] = await StrategicCluster.findOrCreate({
        where: { slug },
        defaults: {
          slug,
          name,
          domainId,
          capabilityId,
          intentId,
          opportunityCount: count,
          avgAiScore: avgScore,
          isActive: true,
          detectedAt: new Date(),
        },
      });

      if (!isNew) {
        // Compute growth rate: (new count - old count) / old count
        const oldCount = cluster.opportunityCount || 1;
        const growthRate = ((count - oldCount) / oldCount) * 100;

        await cluster.update({
          opportunityCount: count,
          avgAiScore: avgScore,
          growthRate: Math.round(growthRate * 100) / 100,
          isActive: true,
        });
        updated++;
      } else {
        created++;
      }
    }

    // Deactivate clusters that have fallen below threshold
    const activeClusters = await StrategicCluster.findAll({ where: { isActive: true } });
    const activeSlugs = new Set(groups.map((g) => {
      const d = domainMap.get(g.domain_id);
      const c = capMap.get(g.capability_id);
      const i = g.intent_id ? intentMap.get(g.intent_id) : null;
      if (!d || !c) return null;
      return [d.slug, c.slug, i?.slug].filter(Boolean).join('_');
    }).filter(Boolean));

    let deactivated = 0;
    for (const cluster of activeClusters) {
      if (!activeSlugs.has(cluster.slug)) {
        await cluster.update({ isActive: false });
        deactivated++;
      }
    }

    logger.info('Cluster detection complete', { created, updated, deactivated, totalActive: groups.length });
    return { created, updated, deactivated, totalActive: groups.length };
  } catch (error) {
    logger.error('Cluster detection failed', { error: error.message });
    throw error;
  }
}

module.exports = { detectClusters };
