// Deep Research Phase 9 — reusable proposal artifact vault.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ProposalArtifact = sequelize.define('ProposalArtifact', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    artifactKind: { type: DataTypes.STRING(40), allowNull: false, field: 'artifact_kind' },
    label: { type: DataTypes.STRING(300), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: true },
    contentRef: { type: DataTypes.STRING(1000), allowNull: true, field: 'content_ref' },
    tags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    capabilityTags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'capability_tags' },
    agencies: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    reuseScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 50, field: 'reuse_score' },
    timesUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'times_used' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    uploadedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'uploaded_by' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'proposal_artifacts', timestamps: true, underscored: true,
    indexes: [
      { fields: ['artifact_kind'] }, { fields: ['status'] }, { fields: ['expires_at'] },
    ],
  });
  return ProposalArtifact;
};
