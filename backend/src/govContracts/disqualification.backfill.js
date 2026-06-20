// Apply the disqualification engine across active Bonfire + gov/SBIR opportunities
// and persist the verdict (bonfire_opportunities.vet_verdict / ai_analysis.vetVerdict).
// Human verdicts (auto:false) are never clobbered; nulls + tentative auto-flags refresh.
const { Op } = require('sequelize');
const { Opportunity, BonfireOpportunity } = require('../models');
const { verdictFor } = require('./disqualification.service');
const logger = require('../logging/logger');

// Refresh when there is no verdict yet, or only a tentative auto-flag. A confirmed
// human/AI verdict (auto === false) stays put.
const refreshable = (existing) => !existing || existing.auto === true;

async function backfillDisqualification({ limit = 6000 } = {}) {
  let bonfireUpdated = 0;
  let govUpdated = 0;

  const bf = await BonfireOpportunity.findAll({ limit });
  for (const o of bf) {
    if (!refreshable(o.vetVerdict)) continue;
    const v = verdictFor({ title: o.title, agency: o.agency, description: o.description });
    if (v) {
      // eslint-disable-next-line no-await-in-loop
      await o.update({ vetVerdict: v });
      bonfireUpdated += 1;
    }
  }

  const opps = await Opportunity.findAll({
    where: {
      type: 'gov_contract',
      source: { [Op.in]: ['sam_gov', 'sbir_gov'] },
      status: 'active',
    },
    limit,
  });
  for (const o of opps) {
    const ai = o.aiAnalysis || {};
    if (!refreshable(ai.vetVerdict)) continue;
    const v = verdictFor({ title: o.title, agency: o.sourceData && o.sourceData.fullParentPathName, description: o.description });
    if (v) {
      // eslint-disable-next-line no-await-in-loop
      await o.update({ aiAnalysis: { ...ai, vetVerdict: v } });
      govUpdated += 1;
    }
  }

  const summary = {
    bonfire_examined: bf.length, bonfire_updated: bonfireUpdated,
    gov_examined: opps.length, gov_updated: govUpdated,
  };
  logger.info('Disqualification backfill complete', summary);
  return summary;
}

module.exports = { backfillDisqualification };
