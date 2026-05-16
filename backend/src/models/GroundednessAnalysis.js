// Deep Research Phase 14 — groundedness + citation analysis.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('GroundednessAnalysis', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    opportunityOutputId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_output_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    groundednessScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'groundedness_score' },
    claimsTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'claims_total' },
    claimsSupported: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'claims_supported' },
    claimsWeak: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'claims_weak' },
    claimsUnsupported: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'claims_unsupported' },
    citationCoveragePct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'citation_coverage_pct' },
    unsupportedSamples: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'unsupported_samples' },
    evidenceSources: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'evidence_sources' },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'computed_at' },
  }, { tableName: 'groundedness_analysis', timestamps: true, underscored: true, updatedAt: false });
};
