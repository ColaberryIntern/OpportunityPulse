// Deep Research Phase 14 — proposal quality score.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('ProposalQuality', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    opportunityOutputId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_output_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    compositeScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'composite_score' },
    strategicAlignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'strategic_alignment_score' },
    completenessScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'completeness_score' },
    evaluatorAlignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'evaluator_alignment_score' },
    differentiationScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'differentiation_score' },
    clarityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'clarity_score' },
    readinessConsistencyScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'readiness_consistency_score' },
    groundednessScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'groundedness_score' },
    operationalCoherenceScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'operational_coherence_score' },
    classification: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unscored' },
    strengths: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    weaknesses: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    recommendations: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'computed_at' },
  }, { tableName: 'proposal_quality', timestamps: true, underscored: true, updatedAt: false });
};
