// Score every active SAM.gov solicitation and persist the result on
// opportunities.ai_analysis.govFit. Idempotent — re-running with the same
// inputs produces the same output (and skips rows whose inputs are
// unchanged via a content hash).
//
// usage (inside container):
//   docker exec op-backend node -e "(async () => {
//     const { backfillGovContractFit } = require('/app/src/govContracts/govContractScoring.backfill');
//     console.log(await backfillGovContractFit());
//   })()"

const crypto = require('crypto');
const { Op } = require('sequelize');
const { Opportunity } = require('../models');
const { scoreGovContract } = require('./govContractScoring.service');
const { scoreSamWithBonfire } = require('./bonfireScoreSamGov.service');
const logger = require('../logging/logger');

// Skip seed/test rows (id < 100) — they have suspiciously perfect titles
// that pollute the rankings. Real SAM.gov ingest starts at high IDs.
const SEED_ID_CUTOFF = 100;

function inputHash(opp) {
  const blob = JSON.stringify({
    title: opp.title || '',
    description: opp.description ? String(opp.description).slice(0, 4000) : '',
    value: opp.value,
    source_data: opp.sourceData || {},
  });
  return crypto.createHash('sha1').update(blob).digest('hex').slice(0, 16);
}

async function backfillGovContractFit({ source = 'sam_gov', limit = 5000 } = {}) {
  const startTime = Date.now();
  const rows = await Opportunity.findAll({
    where: {
      type: 'gov_contract',
      source,
      status: 'active',
      id: { [Op.gte]: SEED_ID_CUTOFF },
    },
    attributes: ['id', 'title', 'description', 'value', 'sourceData', 'aiAnalysis', 'expiresAt'],
    limit,
  });

  let scored = 0;
  let skipped = 0;
  let unchanged = 0;
  let failed = 0;

  for (const opp of rows) {
    try {
      const hash = inputHash(opp);
      const existing = opp.aiAnalysis?.govFit;
      const fitUnchanged = existing && existing.input_hash === hash;
      const hasBonfire = opp.aiAnalysis?.bonfireScore?.priority_score != null;
      // Skip only when BOTH scores are already present and the fit inputs match.
      if (fitUnchanged && hasBonfire) {
        unchanged += 1;
        continue;
      }
      const fit = fitUnchanged
        ? existing
        : {
          ...scoreGovContract({
            title: opp.title,
            description: opp.description,
            value: opp.value,
            source_data: opp.sourceData,
          }),
          input_hash: hash,
          scored_at: new Date().toISOString(),
          scorer_version: 1,
        };
      // Same Bonfire scorer used for state/local bids, so SAM ranks comparably.
      const bonfireScore = scoreSamWithBonfire(opp);
      const newAnalysis = {
        ...(opp.aiAnalysis || {}),
        govFit: fit,
        bonfireScore,
      };
      // eslint-disable-next-line no-await-in-loop
      await Opportunity.update(
        { aiAnalysis: newAnalysis, aiScore: bonfireScore.priority_score },
        { where: { id: opp.id }, hooks: false }
      );
      scored += 1;
    } catch (e) {
      failed += 1;
      logger.warn('govContract scoring failed for row', { id: opp.id, error: e.message });
    }
  }

  const summary = {
    total_examined: rows.length, scored, unchanged, failed, skipped,
    duration_ms: Date.now() - startTime, source,
  };
  logger.info('Gov contract fit backfill complete', summary);
  return summary;
}

module.exports = { backfillGovContractFit, inputHash, SEED_ID_CUTOFF };
