const { classifyOpportunities, classifySingle } = require('./classification.service');
const { computeSaturationIndex } = require('./saturation.service');
const { generateActionRecommendations, generateSingleActionPlan } = require('./actionRecommendation.service');
const { getExecutiveBrief, generateExecutiveBrief, getSectionBrief } = require('./executiveBrief.service');
const { createAction, updateAction, listActions, deleteAction, getActionAnalytics } = require('./opportunityAction.service');
const { Opportunity } = require('../models');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/apiResponse');
const logger = require('../logging/logger');

// --- Admin: Trigger batch operations ---

async function triggerClassification(req, res) {
  try {
    const useLLM = req.body.useLLM === true;
    const type = req.body.type || null;
    const run = await classifyOpportunities({ useLLM, type });
    return successResponse(res, run, 'Classification batch completed');
  } catch (error) {
    logger.error('Classification trigger failed', { error: error.message });
    return errorResponse(res, error.message, 500);
  }
}

async function triggerSaturation(req, res) {
  try {
    const run = await computeSaturationIndex();
    return successResponse(res, run, 'Saturation computation completed');
  } catch (error) {
    logger.error('Saturation trigger failed', { error: error.message });
    return errorResponse(res, error.message, 500);
  }
}

async function triggerRecommendations(req, res) {
  try {
    const useLLM = req.body.useLLM !== false;
    const run = await generateActionRecommendations({ useLLM });
    return successResponse(res, run, 'Action recommendations generated');
  } catch (error) {
    logger.error('Recommendations trigger failed', { error: error.message });
    return errorResponse(res, error.message, 500);
  }
}

async function triggerExecutiveBrief(req, res) {
  try {
    const brief = await generateExecutiveBrief();
    return successResponse(res, brief, 'Executive brief regenerated');
  } catch (error) {
    logger.error('Executive brief trigger failed', { error: error.message });
    return errorResponse(res, error.message, 500);
  }
}

// --- User: Executive brief ---

async function getExecutiveBriefHandler(req, res) {
  try {
    const userId = req.user?.userId || null;
    const brief = await getExecutiveBrief({ userId });
    return successResponse(res, brief, 'Executive brief retrieved');
  } catch (error) {
    logger.error('Get executive brief failed', { error: error.message });
    return errorResponse(res, error.message, 500);
  }
}

// --- User: Section brief ---

async function getSectionBriefHandler(req, res) {
  try {
    const { section } = req.params;
    const validSections = ['government', 'talent', 'freelance', 'capital', 'private-sector', 'alpha', 'all'];
    if (!validSections.includes(section)) {
      return errorResponse(res, `Invalid section: ${section}. Valid: ${validSections.join(', ')}`, 400);
    }
    const userId = req.user?.userId || null;
    const brief = await getSectionBrief(section, userId);
    return successResponse(res, brief, 'Section brief retrieved');
  } catch (error) {
    logger.error('Get section brief failed', { error: error.message, section: req.params.section });
    return errorResponse(res, error.message, 500);
  }
}

// --- User: Opportunity action plans ---

async function getOpportunityActionPlan(req, res) {
  try {
    const opp = await Opportunity.findByPk(req.params.id);
    if (!opp) return errorResponse(res, 'Opportunity not found', 404);

    const actionPlan = opp.aiAnalysis?.actionPlan || null;
    const classification = opp.aiAnalysis?.classification || null;
    const saturation = opp.aiAnalysis?.saturation || null;

    return successResponse(res, {
      opportunityId: opp.id,
      actionType: opp.actionType,
      quadrant: opp.opportunityQuadrant,
      saturationIndex: opp.saturationIndex,
      classification,
      saturation,
      actionPlan,
    }, 'Action plan retrieved');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

async function generateActionPlanHandler(req, res) {
  try {
    const useLLM = req.body.useLLM !== false;
    const plan = await generateSingleActionPlan(parseInt(req.params.id, 10), { useLLM });
    return successResponse(res, plan, 'Action plan generated');
  } catch (error) {
    logger.error('Generate action plan failed', { error: error.message });
    const status = error.message.includes('not found') ? 404 :
      (error.message.includes('classified') || error.message.includes('IGNORE')) ? 400 : 500;
    return errorResponse(res, error.message, status);
  }
}

// --- User: Action tracking CRUD ---

async function createActionHandler(req, res) {
  try {
    const { opportunityId, actionType, notes } = req.body;
    const action = await createAction(req.user.userId, opportunityId, { actionType, notes });
    return successResponse(res, action, 'Action tracked successfully', 201);
  } catch (error) {
    const status = error.message.includes('not found') ? 404 :
      error.message.includes('already tracked') ? 409 : 500;
    return errorResponse(res, error.message, status);
  }
}

async function updateActionHandler(req, res) {
  try {
    const { status, revenueGenerated, notes } = req.body;
    const action = await updateAction(req.user.userId, parseInt(req.params.id, 10), {
      status, revenueGenerated, notes,
    });
    return successResponse(res, action, 'Action updated');
  } catch (error) {
    return errorResponse(res, error.message, error.message.includes('not found') ? 404 : 500);
  }
}

async function listActionsHandler(req, res) {
  try {
    const { status, page, limit } = req.query;
    const result = await listActions(req.user.userId, { status, page, limit });
    return paginatedResponse(res, result.actions, result.pagination, 'Actions retrieved');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

async function deleteActionHandler(req, res) {
  try {
    await deleteAction(req.user.userId, parseInt(req.params.id, 10));
    return successResponse(res, null, 'Action deleted');
  } catch (error) {
    return errorResponse(res, error.message, error.message.includes('not found') ? 404 : 500);
  }
}

async function getAnalyticsHandler(req, res) {
  try {
    const analytics = await getActionAnalytics(req.user.userId);
    return successResponse(res, analytics, 'Analytics retrieved');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
}

module.exports = {
  triggerClassification,
  triggerSaturation,
  triggerRecommendations,
  triggerExecutiveBrief,
  getExecutiveBriefHandler,
  getSectionBriefHandler,
  getOpportunityActionPlan,
  generateActionPlanHandler,
  createActionHandler,
  updateActionHandler,
  listActionsHandler,
  deleteActionHandler,
  getAnalyticsHandler,
};
