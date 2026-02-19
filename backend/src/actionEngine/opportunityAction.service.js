const { Op, fn, col } = require('sequelize');
const { OpportunityAction, Opportunity, sequelize } = require('../models');
const { PAGINATION } = require('../config/constants');
const logger = require('../logging/logger');

/**
 * Create an action tracking record for a user.
 */
async function createAction(userId, opportunityId, { actionType, notes } = {}) {
  const opportunity = await Opportunity.findByPk(opportunityId);
  if (!opportunity) throw new Error('Opportunity not found');

  const existing = await OpportunityAction.findOne({
    where: { userId, opportunityId },
  });
  if (existing) throw new Error('Action already tracked for this opportunity');

  const action = await OpportunityAction.create({
    userId,
    opportunityId,
    actionType: actionType || opportunity.actionType || 'BUILD',
    status: 'planned',
    notes: notes || null,
  });

  return action;
}

/**
 * Update an existing action tracking record.
 */
async function updateAction(userId, actionId, { status, revenueGenerated, notes } = {}) {
  const action = await OpportunityAction.findOne({
    where: { id: actionId, userId },
  });
  if (!action) throw new Error('Action not found');

  const updates = {};
  if (status) updates.status = status;
  if (revenueGenerated !== undefined) updates.revenueGenerated = revenueGenerated;
  if (notes !== undefined) updates.notes = notes;

  await action.update(updates);
  return action;
}

/**
 * List user's tracked actions with pagination.
 */
async function listActions(userId, { status, page, limit } = {}) {
  const pageNum = parseInt(page, 10) || PAGINATION.DEFAULT_PAGE;
  const pageSize = Math.min(parseInt(limit, 10) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const offset = (pageNum - 1) * pageSize;

  const where = { userId };
  if (status) where.status = status;

  const { count, rows } = await OpportunityAction.findAndCountAll({
    where,
    include: [{
      model: Opportunity,
      as: 'opportunity',
      attributes: ['id', 'type', 'title', 'aiScore', 'actionType', 'opportunityQuadrant', 'value', 'sourceUrl', 'category'],
    }],
    order: [['updated_at', 'DESC']],
    limit: pageSize,
    offset,
  });

  return {
    actions: rows,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total: count,
      totalPages: Math.ceil(count / pageSize),
    },
  };
}

/**
 * Delete an action tracking record.
 */
async function deleteAction(userId, actionId) {
  const action = await OpportunityAction.findOne({
    where: { id: actionId, userId },
  });
  if (!action) throw new Error('Action not found');

  await action.destroy();
  return { deleted: true };
}

/**
 * Get signal-to-action analytics for a user.
 */
async function getActionAnalytics(userId) {
  const signalsProcessed = await Opportunity.count({
    where: { actionType: { [Op.ne]: null }, status: 'active' },
  });

  const signalsActedOn = await OpportunityAction.count({
    where: { userId },
  });

  const executedActions = await OpportunityAction.findAll({
    where: { userId, status: 'executed' },
    attributes: [
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('revenue_generated')), 'totalRevenue'],
    ],
    raw: true,
  });

  const totalRevenue = parseFloat(executedActions[0]?.totalRevenue) || 0;
  const executedCount = parseInt(executedActions[0]?.count, 10) || 0;

  const byActionType = await OpportunityAction.findAll({
    where: { userId },
    attributes: [
      'actionType',
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', col('revenue_generated')), 'revenue'],
    ],
    group: ['action_type'],
    raw: true,
  });

  const byStatus = await OpportunityAction.findAll({
    where: { userId },
    attributes: [
      'status',
      [fn('COUNT', col('id')), 'count'],
    ],
    group: ['status'],
    raw: true,
  });

  return {
    signalsProcessed,
    signalsActedOn,
    conversionRate: signalsProcessed > 0 ? Math.round((signalsActedOn / signalsProcessed) * 10000) / 100 : 0,
    totalRevenue,
    executedCount,
    revenuePerSignal: signalsActedOn > 0 ? Math.round(totalRevenue / signalsActedOn * 100) / 100 : 0,
    byActionType: byActionType.map((r) => ({
      actionType: r.actionType,
      count: parseInt(r.count, 10),
      revenue: parseFloat(r.revenue) || 0,
    })),
    byStatus: byStatus.map((r) => ({
      status: r.status,
      count: parseInt(r.count, 10),
    })),
  };
}

module.exports = {
  createAction,
  updateAction,
  listActions,
  deleteAction,
  getActionAnalytics,
};
