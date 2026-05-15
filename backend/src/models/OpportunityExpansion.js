// Deep Research Phase 8 — cached expansion sets per anchor.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const OpportunityExpansion = sequelize.define('OpportunityExpansion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    anchorKind: { type: DataTypes.STRING(30), allowNull: false, field: 'anchor_kind' },
    anchorId: { type: DataTypes.STRING(200), allowNull: false, field: 'anchor_id' },
    relatedOpportunities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'related_opportunities' },
    adjacentAgencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'adjacent_agencies' },
    adjacentTechnologies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'adjacent_technologies' },
    recurringNaics: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'recurring_naics' },
    futureSignals: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'future_signals' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'opportunity_expansions', timestamps: false, underscored: true,
    indexes: [{ fields: ['anchor_kind', 'anchor_id'] }],
  });
  return OpportunityExpansion;
};
