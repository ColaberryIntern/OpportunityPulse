// OIED v9 - Partner controller.
//
// Two thin handlers backing the bridge-gated v9 routes:
//   POST /api/v1/oied/opportunities/:id/partner-search
//        body: {} — no DB candidate registry yet; returns the
//        partner_profile so the human team has a sketch to act on.
//   POST /api/v1/oied/opportunities/:id/partner-outreach
//        body: { prime_name } — composes a markdown teaming-outreach
//        draft. Sending stays human-gated (separate Mandrill flow).

const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { Opportunity } = require('../models');
const partnerSvc = require('./partner.service');
const emSvc = require('./executionMode.service');
const groundingSvc = require('./grounding.service');
const profileSvc = require('./profile.service');
const approvedAssetsSvc = require('./approvedAssets.service');

async function loadOppContext(id) {
  const opp = await Opportunity.findByPk(id);
  if (!opp) return null;
  const oppData = opp.toJSON ? opp.toJSON() : opp;
  const grounding = await groundingSvc.getOpportunityGrounding(id);
  const orgId = await profileSvc.resolveOrgId(null);
  const profile = await profileSvc.getOrDefaultByOrg(orgId);
  const approvedAssets = await approvedAssetsSvc.getApprovedAssets({ organizationId: orgId });
  const executionMode = emSvc.computeExecutionMode({
    opp: oppData, profile, approvedAssets, grounding,
  });
  return { oppData, grounding, profile, approvedAssets, executionMode };
}

// POST /api/v1/oied/opportunities/:id/partner-search
async function partnerSearch(req, res) {
  const id = Number(req.params.id);
  if (!id) return errorResponse(res, 'Invalid opportunity id', 400);
  try {
    const ctx = await loadOppContext(id);
    if (!ctx) return errorResponse(res, 'Opportunity not found', 404);
    if (ctx.executionMode.execution_mode !== 'partner_required') {
      return errorResponse(
        res,
        `partner-search only applies to partner_required opps; this one is ${ctx.executionMode.execution_mode}`,
        400,
        { execution_mode: ctx.executionMode.execution_mode },
      );
    }
    const result = partnerSvc.findCandidatePartners({
      opp: ctx.oppData,
      partnerProfile: ctx.executionMode.partner_profile,
    });
    logger.info('OIED v9: partner search', {
      opportunity_id: id,
      industry: result.partner_profile && result.partner_profile.industry,
      geography: result.partner_profile && result.partner_profile.geography,
    });
    return successResponse(res, result);
  } catch (e) {
    logger.error('partner.partnerSearch failed', { id, error: e.message });
    return errorResponse(res, 'Partner search failed: ' + e.message, 500);
  }
}

// POST /api/v1/oied/opportunities/:id/partner-outreach
// body: { prime_name: string }
async function partnerOutreach(req, res) {
  const id = Number(req.params.id);
  if (!id) return errorResponse(res, 'Invalid opportunity id', 400);
  const primeName = (req.body && req.body.prime_name) || '';
  if (!primeName || !String(primeName).trim()) {
    return errorResponse(res, 'prime_name is required in the request body', 400);
  }
  try {
    const ctx = await loadOppContext(id);
    if (!ctx) return errorResponse(res, 'Opportunity not found', 404);
    if (ctx.executionMode.execution_mode !== 'partner_required') {
      return errorResponse(
        res,
        `partner-outreach only applies to partner_required opps; this one is ${ctx.executionMode.execution_mode}`,
        400,
        { execution_mode: ctx.executionMode.execution_mode },
      );
    }
    const result = partnerSvc.composeOutreachDraft({
      opp: ctx.oppData,
      partnerProfile: ctx.executionMode.partner_profile,
      primeName: String(primeName).trim(),
      grounding: ctx.grounding,
      approvedAssets: ctx.approvedAssets,
    });
    logger.info('OIED v9: partner outreach drafted', {
      opportunity_id: id,
      prime_name: primeName,
      banned_terms_detected: result.banned_terms_detected,
    });
    return successResponse(res, result);
  } catch (e) {
    logger.error('partner.partnerOutreach failed', { id, error: e.message });
    return errorResponse(res, 'Partner outreach drafting failed: ' + e.message, 500);
  }
}

module.exports = {
  partnerSearch,
  partnerOutreach,
};
