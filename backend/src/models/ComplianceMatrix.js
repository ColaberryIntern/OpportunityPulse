// Deep Research Phase 9 — compliance matrix per pursuit/opportunity.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ComplianceMatrix = sequelize.define('ComplianceMatrix', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_id' },
    source: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
    sourceAttachmentId: { type: DataTypes.INTEGER, allowNull: true, field: 'source_attachment_id' },
    totalCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_count' },
    satisfiedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'satisfied_count' },
    partialCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'partial_count' },
    missingCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'missing_count' },
    completionPct: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'completion_pct' },
    submissionConstraints: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'submission_constraints' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'compliance_matrices', timestamps: false, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['opportunity_id'] }],
  });
  return ComplianceMatrix;
};
