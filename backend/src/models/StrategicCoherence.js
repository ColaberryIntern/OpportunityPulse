// Deep Research Phase 14 — strategic coherence analysis.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('StrategicCoherence', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    opportunityOutputId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_output_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    coherenceScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'coherence_score' },
    conflicts: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    consistencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    pursuitAlignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'pursuit_alignment_score' },
    positioningAlignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'positioning_alignment_score' },
    readinessAlignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'readiness_alignment_score' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'computed_at' },
  }, { tableName: 'strategic_coherence', timestamps: true, underscored: true, updatedAt: false });
};
