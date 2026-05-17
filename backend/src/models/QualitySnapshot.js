// Deep Research Phase 15 — consolidated quality snapshot per output.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  return sequelize.define('QualitySnapshot', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    opportunityOutputId: { type: DataTypes.INTEGER, allowNull: false, field: 'opportunity_output_id' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    proposalQualityId: { type: DataTypes.BIGINT, allowNull: true, field: 'proposal_quality_id' },
    groundednessId: { type: DataTypes.BIGINT, allowNull: true, field: 'groundedness_id' },
    coherenceId: { type: DataTypes.BIGINT, allowNull: true, field: 'coherence_id' },
    alignmentId: { type: DataTypes.BIGINT, allowNull: true, field: 'alignment_id' },
    compositeScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'composite_score' },
    groundednessScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'groundedness_score' },
    coherenceScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'coherence_score' },
    alignmentScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'alignment_score' },
    classification: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unscored' },
    runTrigger: { type: DataTypes.STRING(64), allowNull: true, field: 'run_trigger' },
    runStatus: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'completed', field: 'run_status' },
    runDurationMs: { type: DataTypes.INTEGER, allowNull: true, field: 'run_duration_ms' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: () => new Date(), field: 'computed_at' },
  }, { tableName: 'quality_snapshots', timestamps: true, underscored: true, updatedAt: false });
};
