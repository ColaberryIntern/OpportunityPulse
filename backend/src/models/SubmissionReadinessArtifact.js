// Deep Research Phase 8 — submission readiness FOUNDATIONS only.
// Per the Phase 8 spec, this is the asset/compliance-matrix model that the
// future Phase 9 Submission Readiness Engine will build on. No engine work
// here; just the storage shape so pursuits can track required artifacts.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const SubmissionReadinessArtifact = sequelize.define('SubmissionReadinessArtifact', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_id' },
    artifactKind: { type: DataTypes.STRING(40), allowNull: false, field: 'artifact_kind' },
    label: { type: DataTypes.STRING(200), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'missing' },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    contentRef: { type: DataTypes.STRING(500), allowNull: true, field: 'content_ref' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'submission_readiness_artifacts', timestamps: true, underscored: true,
    indexes: [
      { fields: ['pursuit_id'] },
      { fields: ['opportunity_id'] },
      { fields: ['artifact_kind', 'status'] },
    ],
  });
  return SubmissionReadinessArtifact;
};
