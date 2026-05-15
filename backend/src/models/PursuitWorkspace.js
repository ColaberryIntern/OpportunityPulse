// Deep Research Phase 7 — proposal-pursuit workspace (a planning surface
// anchored to a venture / cluster / pattern / custom opportunity).
// Read-only operationally: no auto-submission, no auto-execution.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const PursuitWorkspace = sequelize.define('PursuitWorkspace', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    anchorKind: { type: DataTypes.STRING(30), allowNull: false, field: 'anchor_kind' },
    anchorId: { type: DataTypes.INTEGER, allowNull: true, field: 'anchor_id' },
    summary: { type: DataTypes.TEXT, allowNull: true },
    positioning: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
    linkedOpportunityIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'linked_opportunity_ids' },
    linkedOutputIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'linked_output_ids' },
    staffingRecommendation: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'staffing_recommendation' },
    readinessSummary: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'readiness_summary' },
    notes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    createdBy: { type: DataTypes.STRING(120), allowNull: true, field: 'created_by' },
  }, {
    tableName: 'pursuit_workspaces', timestamps: true, underscored: true,
    indexes: [{ fields: ['anchor_kind', 'anchor_id'] }, { fields: ['status'] }],
  });
  return PursuitWorkspace;
};
