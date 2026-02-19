const { Op } = require('sequelize');
const { Opportunity, AnalysisRun, AiDomain, OpportunityClassification, OpportunityMultiTag } = require('../models');
const logger = require('../logging/logger');

const BATCH_SIZE = 50;

// Agency → domain slug mapping for gov contracts
const AGENCY_DOMAIN_MAP = {
  'hhs': 'healthcare_ai', 'nih': 'healthcare_ai', 'cdc': 'healthcare_ai', 'fda': 'healthcare_ai', 'cms': 'healthcare_ai',
  'dod': 'defense_ai', 'army': 'defense_ai', 'navy': 'defense_ai', 'air force': 'defense_ai', 'darpa': 'defense_ai', 'pentagon': 'defense_ai', 'disa': 'defense_ai',
  'doe': 'energy_ai', 'ferc': 'energy_ai',
  'nasa': 'space_satellite_ai', 'noaa': 'space_satellite_ai',
  'sec': 'finance_ai', 'treasury': 'finance_ai', 'fdic': 'finance_ai',
  'epa': 'climate_ai',
  'ed': 'education_ai', 'nsf': 'education_ai',
  'nist': 'ai_governance', 'ostp': 'ai_governance', 'ftc': 'ai_governance',
  'nih': 'bio_genomics_ai',
  'gsa': 'gov_modernization_ai', 'omb': 'gov_modernization_ai', 'usds': 'gov_modernization_ai',
};

/**
 * Classify opportunities into AI domain verticals using deterministic rules.
 * Persists primary domain to opportunity_classifications, secondary to opportunity_multi_tags.
 */
async function classifyDomains({ batchSize = BATCH_SIZE } = {}) {
  const run = await AnalysisRun.create({
    type: 'domain_classification',
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // Load all domain definitions with keywords
    const domains = await AiDomain.findAll();
    const domainMap = new Map(domains.map((d) => [d.slug, d]));

    // Find opportunities not yet classified by domain
    const classified = await OpportunityClassification.findAll({
      where: { domainId: { [Op.not]: null } },
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
        const scores = scoreDomains(opp, domains);
        if (scores.length === 0) continue;

        const primary = scores[0];
        const secondary = scores.filter((s, i) => i > 0 && s.score >= 5);

        // Upsert primary classification
        const [classification] = await OpportunityClassification.findOrCreate({
          where: { opportunityId: opp.id },
          defaults: {
            opportunityId: opp.id,
            domainId: primary.domainId,
            domainConfidence: primary.score,
            classifiedAt: new Date(),
          },
        });

        if (classification.domainId !== primary.domainId) {
          await classification.update({
            domainId: primary.domainId,
            domainConfidence: primary.score,
            classifiedAt: new Date(),
          });
        }

        // Store secondary domains in multi-tag table
        for (const sec of secondary) {
          await OpportunityMultiTag.findOrCreate({
            where: {
              opportunityId: opp.id,
              dimension: 'domain',
              dimensionValueId: sec.domainId,
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

    logger.info('Domain classification batch complete', {
      input: opportunities.length, classified: successCount, errors: errors.length,
    });

    return run;
  } catch (error) {
    logger.error('Domain classification failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

/**
 * Score all domains for a single opportunity.
 * Returns sorted array of { domainId, slug, score }.
 */
function scoreDomains(opp, domains) {
  const title = (opp.title || '').toLowerCase();
  const desc = (opp.description || '').toLowerCase();
  const tags = (opp.tags || []).map((t) => t.toLowerCase());
  const source = (opp.source || '').toLowerCase();
  const category = (opp.category || '').toLowerCase();
  const sourceData = opp.sourceData || {};
  const agency = (sourceData.agency || sourceData.department || '').toLowerCase();

  const results = [];

  for (const domain of domains) {
    let score = 0;
    const keywords = (domain.keywords || []).map((k) => k.toLowerCase());
    const naicsCodes = domain.naicsCodes || [];

    // Keyword matching in title (strong signal)
    for (const kw of keywords) {
      if (title.includes(kw)) score += 10;
    }

    // Keyword matching in description
    for (const kw of keywords) {
      if (desc.includes(kw)) score += 5;
    }

    // Keyword matching in tags
    for (const kw of keywords) {
      if (tags.some((t) => t.includes(kw))) score += 8;
    }

    // Category matching
    for (const kw of keywords) {
      if (category.includes(kw)) score += 7;
    }

    // Agency matching for gov contracts
    if (opp.type === 'gov_contract' && agency) {
      for (const [agencyKey, domainSlug] of Object.entries(AGENCY_DOMAIN_MAP)) {
        if (agency.includes(agencyKey) && domainSlug === domain.slug) {
          score += 15;
        }
      }
    }

    // NAICS code matching for gov contracts
    if (opp.type === 'gov_contract' && sourceData.naicsCode && naicsCodes.length > 0) {
      const oppNaics = String(sourceData.naicsCode);
      for (const code of naicsCodes) {
        if (oppNaics.startsWith(code)) {
          score += 12;
          break;
        }
      }
    }

    if (score > 0) {
      results.push({ domainId: domain.id, slug: domain.slug, score: Math.min(100, score) });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

module.exports = { classifyDomains, scoreDomains };
