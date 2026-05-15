// Deep Research Phase 8 — research signal → revenue/procurement mapping.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ResearchRevenueLink = sequelize.define('ResearchRevenueLink', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    signalKind: { type: DataTypes.STRING(30), allowNull: false, field: 'signal_kind' },
    signalId: { type: DataTypes.STRING(200), allowNull: true, field: 'signal_id' },
    signalLabel: { type: DataTypes.STRING(300), allowNull: false, field: 'signal_label' },
    revenueOpportunityIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'revenue_opportunity_ids' },
    targetAgencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'target_agencies' },
    procurementThemes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'procurement_themes' },
    implementationDemand: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'implementation_demand' },
    strength: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'research_revenue_links', timestamps: false, underscored: true,
    indexes: [{ fields: ['signal_kind'] }],
  });
  return ResearchRevenueLink;
};
