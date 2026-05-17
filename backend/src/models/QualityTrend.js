// Deep Research Phase 15 — periodic per-tenant quality trend snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('QualityTrend', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    windowDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7, field: 'window_days' },
    avgQualityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_quality_score' },
    avgGroundednessScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_groundedness_score' },
    avgCoherenceScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_coherence_score' },
    avgAlignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'avg_alignment_score' },
    openAlerts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'open_alerts' },
    qualityDeltaVsPrior: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'quality_delta_vs_prior' },
    direction: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'flat' },
    degradationWarnings: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'degradation_warnings' },
    improvementInsights: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'improvement_insights' },
    computedInputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'computed_inputs' },
    capturedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'captured_at' },
  }, { tableName: 'quality_trends', timestamps: true, underscored: true, updatedAt: false });
};
