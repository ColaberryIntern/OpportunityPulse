const { Op } = require('sequelize');
const { Opportunity, AnalysisRun, GeographicTag, OpportunityClassification, OpportunityMultiTag } = require('../models');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;

// Agency → geographic slug mapping
const AGENCY_GEO_MAP = {
  'dod': 'dod', 'army': 'dod', 'navy': 'dod', 'air force': 'dod', 'darpa': 'dod',
  'pentagon': 'dod', 'disa': 'dod', 'socom': 'dod',
  'hhs': 'healthcare_hubs', 'nih': 'healthcare_hubs', 'cdc': 'healthcare_hubs',
};

// State/city → geo slug mapping
const LOCATION_GEO_MAP = [
  { patterns: ['san francisco', 'bay area', 'palo alto', 'mountain view', 'san jose', 'silicon valley', 'menlo park', 'cupertino'], slug: 'silicon_valley' },
  { patterns: ['texas', ' tx', 'austin', 'dallas', 'houston', 'san antonio', 'fort worth'], slug: 'texas' },
  { patterns: ['boston', 'research triangle', 'baltimore', 'bethesda', 'cambridge, ma', 'johns hopkins'], slug: 'healthcare_hubs' },
  { patterns: ['northern virginia', 'arlington', 'mclean', 'dc metro', 'washington dc', 'huntsville', 'colorado springs', 'san diego'], slug: 'defense_clusters' },
  { patterns: ['pittsburgh', 'atlanta', 'denver', 'seattle', 'miami', 'nashville', 'phoenix', 'raleigh', 'portland'], slug: 'regional_innovation' },
  { patterns: ['eu', 'european union', 'europe', 'london', 'berlin', 'paris', 'amsterdam', 'brussels'], slug: 'eu' },
];

/**
 * Tag opportunities with geographic intelligence.
 */
async function classifyGeographicTags({ batchSize = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'geographic_tagging',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const geoTags = await GeographicTag.findAll();
    const geoMap = new Map(geoTags.map((g) => [g.slug, g]));

    const classified = await OpportunityClassification.findAll({
      where: { geographicTagId: { [Op.not]: null } },
      attributes: ['opportunityId'],
    });
    const classifiedIds = new Set(classified.map((c) => c.opportunityId));

    const opportunities = await Opportunity.findAll({
      where: {
        status: 'active',
        id: { [Op.notIn]: [...classifiedIds].slice(0, 10000) },
      },
      order: [['published_at', 'DESC']],
      limit: batchSize,
    });

    if (opportunities.length === 0) {
      await run.update({
        status: 'success', inputCount: 0, outputCount: 0,
        results: { message: 'No unclassified opportunities found.' },
        completedAt: new Date(),
      });
      return run;
    }

    let successCount = 0;
    const errors = [];

    for (const opp of opportunities) {
      try {
        const matches = matchGeography(opp, geoMap);
        if (matches.length === 0) continue;

        const primary = matches[0];
        const secondary = matches.slice(1);

        const [classification] = await OpportunityClassification.findOrCreate({
          where: { opportunityId: opp.id },
          defaults: {
            opportunityId: opp.id,
            geographicTagId: primary.geoId,
            classifiedAt: new Date(),
          },
        });

        if (classification.geographicTagId !== primary.geoId) {
          await classification.update({ geographicTagId: primary.geoId });
        }

        // Secondary geo tags
        for (const sec of secondary) {
          await OpportunityMultiTag.findOrCreate({
            where: {
              opportunityId: opp.id,
              dimension: 'geographic',
              dimensionValueId: sec.geoId,
            },
            defaults: { confidence: sec.score },
          });
        }

        successCount++;
      } catch (err) {
        errors.push({ opportunityId: opp.id, error: err.message });
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: opportunities.length,
      outputCount: successCount,
      results: { classifiedCount: successCount },
      errors: errors.length > 0 ? errors : [],
      completedAt: new Date(),
    });

    logger.info('Geographic tagging complete', {
      input: opportunities.length, classified: successCount, errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Geographic tagging failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

/**
 * Match geographic signals for a single opportunity.
 */
function matchGeography(opp, geoMap) {
  const location = (opp.location || '').toLowerCase();
  const source = (opp.source || '').toLowerCase();
  const sourceUrl = (opp.sourceUrl || '').toLowerCase();
  const sourceData = opp.sourceData || {};
  const agency = (sourceData.agency || sourceData.department || '').toLowerCase();
  const title = (opp.title || '').toLowerCase();

  const matches = [];
  const matched = new Set();

  // Federal indicators
  if (opp.type === 'gov_contract' || source.includes('.gov') || sourceUrl.includes('.gov') || title.includes('federal')) {
    const federal = geoMap.get('federal');
    if (federal && !matched.has('federal')) {
      matches.push({ geoId: federal.id, slug: 'federal', score: 15 });
      matched.add('federal');
    }
  }

  // Agency-based geo matching
  for (const [agencyKey, geoSlug] of Object.entries(AGENCY_GEO_MAP)) {
    if (agency.includes(agencyKey) || title.includes(agencyKey)) {
      const geo = geoMap.get(geoSlug);
      if (geo && !matched.has(geoSlug)) {
        matches.push({ geoId: geo.id, slug: geoSlug, score: 12 });
        matched.add(geoSlug);
      }
    }
  }

  // Location-based matching
  for (const entry of LOCATION_GEO_MAP) {
    if (matched.has(entry.slug)) continue;
    for (const pattern of entry.patterns) {
      if (location.includes(pattern) || title.includes(pattern)) {
        const geo = geoMap.get(entry.slug);
        if (geo) {
          matches.push({ geoId: geo.id, slug: entry.slug, score: 10 });
          matched.add(entry.slug);
        }
        break;
      }
    }
  }

  // State-level for US states not in specific clusters
  if (location && !matched.has('state_level') && matches.length === 0) {
    const usStates = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
      'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
      'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi',
      'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york',
      'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
      'south carolina', 'south dakota', 'tennessee', 'utah', 'vermont', 'virginia', 'washington',
      'west virginia', 'wisconsin', 'wyoming'];
    if (usStates.some((s) => location.includes(s))) {
      const stateGeo = geoMap.get('state_level');
      if (stateGeo) {
        matches.push({ geoId: stateGeo.id, slug: 'state_level', score: 5 });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

module.exports = { classifyGeographicTags, matchGeography };
