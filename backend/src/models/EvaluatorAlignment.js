// Deep Research Phase 14 — evaluator alignment analysis.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('EvaluatorAlignment', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    opportunityOutputId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_output_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    alignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'alignment_score' },
    prioritiesTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'priorities_total' },
    prioritiesAddressed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'priorities_addressed' },
    missingPriorities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'missing_priorities' },
    addressedPriorities: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'addressed_priorities' },
    recurringAgencySignals: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'recurring_agency_signals' },
    strategicPatternsMatched: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'strategic_patterns_matched' },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'computed_at' },
  }, { tableName: 'evaluator_alignment', timestamps: true, underscored: true, updatedAt: false });
};
