// Deep Research Phase 9 — assembled submission package metadata snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const SubmissionPackage = sequelize.define('SubmissionPackage', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: false, field: 'pursuit_id' },
    name: { type: DataTypes.STRING(300), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    outputIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'output_ids' },
    attachmentIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'attachment_ids' },
    artifactIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'artifact_ids' },
    completenessScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'completeness_score' },
    missingComponents: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'missing_components' },
    complianceMatrixId: { type: DataTypes.INTEGER, allowNull: true, field: 'compliance_matrix_id' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    assembledBy: { type: DataTypes.STRING(120), allowNull: true, field: 'assembled_by' },
    assembledAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'assembled_at' },
    submittedAt: { type: DataTypes.DATE, allowNull: true, field: 'submitted_at' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'submission_packages', timestamps: false, underscored: true,
    indexes: [{ fields: ['pursuit_id'] }, { fields: ['status'] }],
  });
  return SubmissionPackage;
};
