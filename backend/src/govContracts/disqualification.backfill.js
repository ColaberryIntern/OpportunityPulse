// Apply the disqualification engine across active Bonfire + gov/SBIR opportunities
// and persist the verdict (bonfire_opportunities.vet_verdict / ai_analysis.vetVerdict).
// Document deep-vet verdicts (the real AI reads of the RFP, scorer 'document_deep_vet')
// are never clobbered; nulls, tentative auto-flags, AND code-defined KNOWN_VERDICTS
// refresh — the last so a change to the known list or to cert posture (e.g. SOC 2 now a
// watchlist conditional) propagates to already-stored rows on the next run.
const { Op } = require('sequelize');
const { Opportunity, BonfireOpportunity } = require('../models');
const { verdictFor } = require('./disqualification.service');
const logger = require('../logging/logger');

// The only verdicts we must NOT re-derive are the document deep-vets — they come from
// reading the actual documents and verdictFor cannot reproduce them. Everything else
// (null, auto-flag, or a deterministic KNOWN_VERDICTS match) is safe to recompute.
const isDocVet = (v) => !!v && v.auto === false && v.scorer === 'document_deep_vet';

// Meaningful-field equality so the backfill stays idempotent (re-stamping vetted_at
// alone is not a change worth a write).
function sameVerdict(a, b) {
  if (!a || !b) return false;
  return a.status === b.status
    && (a.disqualifier || null) === (b.disqualifier || null)
    && (a.label || null) === (b.label || null)
    && (a.unblocked_by || null) === (b.unblocked_by || null);
}

// Decide whether to write the freshly-computed verdict over the existing one.
function shouldWrite(existing, next) {
  if (!next) return false;                 // nothing to write
  if (isDocVet(existing)) return false;    // sacrosanct — never overwrite a document read
  // Never downgrade a confirmed verdict to a tentative heuristic auto-flag.
  if (existing && existing.auto === false && next.auto === true) return false;
  if (sameVerdict(existing, next)) return false; // idempotent: no meaningful change
  return true;
}

async function backfillDisqualification({ limit = 6000 } = {}) {
  let bonfireUpdated = 0;
  let govUpdated = 0;

  const bf = await BonfireOpportunity.findAll({ limit });
  for (const o of bf) {
    if (isDocVet(o.vetVerdict)) continue;
    const v = verdictFor({ title: o.title, agency: o.agency, description: o.description });
    if (shouldWrite(o.vetVerdict, v)) {
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
    if (isDocVet(ai.vetVerdict)) continue;
    const v = verdictFor({ title: o.title, agency: o.sourceData && o.sourceData.fullParentPathName, description: o.description });
    if (shouldWrite(ai.vetVerdict, v)) {
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

module.exports = { backfillDisqualification, isDocVet, sameVerdict, shouldWrite };
