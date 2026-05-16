// Deep Research Phase 14 — periodic quality metrics snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('QualityMetric', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    avgQualityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_quality_score' },
    avgGroundednessScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_groundedness_score' },
    avgCoherenceScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_coherence_score' },
    avgAlignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_alignment_score' },
    outputsScored: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'outputs_scored' },
    outputsTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'outputs_total' },
    coveragePct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'coverage_pct' },
    capturedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'captured_at' },
  }, { tableName: 'quality_metrics', timestamps: true, underscored: true, updatedAt: false });
};
