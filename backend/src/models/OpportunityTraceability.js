// Deep Research Phase 7 — opportunity traceability links.
//
// Maps an insight (venture / cluster / pattern / recommendation / etc.) to
// the underlying opportunities that support it, with a relevance score and
// a typed contribution channel for auditability.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const OpportunityTraceability = sequelize.define('OpportunityTraceability', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    insightKind: { type: DataTypes.STRING(40), allowNull: false, field: 'insight_kind' },
    insightId: { type: DataTypes.INTEGER, allowNull: false, field: 'insight_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_id' },
    relevance: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    contribution: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'direct_link' },
    reasoning: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'opportunity_traceability', timestamps: true, updatedAt: false, underscored: true,
    indexes: [
      { fields: ['insight_kind', 'insight_id'] },
      { fields: ['opportunity_id'] },
    ],
  });
  return OpportunityTraceability;
};
