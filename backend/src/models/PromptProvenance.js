// Deep Research Phase 12 — append-only prompt provenance log.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const PromptProvenance = sequelize.define('PromptProvenance', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    auditHash: { type: DataTypes.STRING(64), allowNull: false, field: 'audit_hash' },
    promptVersion: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'v1', field: 'prompt_version' },
    pursuitId: { type: DataTypes.INTEGER, allowNull: true, field: 'pursuit_id' },
    opportunityId: { type: DataTypes.INTEGER, allowNull: true, field: 'opportunity_id' },
    outputId: { type: DataTypes.INTEGER, allowNull: true, field: 'output_id' },
    outputType: { type: DataTypes.STRING(32), allowNull: true, field: 'output_type' },
    includedSections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'included_sections' },
    excludedSections: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'excluded_sections' },
    charLength: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'char_length' },
    contextInputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'context_inputs' },
    blockPreview: { type: DataTypes.TEXT, allowNull: true, field: 'block_preview' },
    generatedBy: { type: DataTypes.STRING(255), allowNull: true, field: 'generated_by' },
  }, { tableName: 'prompt_provenance', timestamps: true, underscored: true, updatedAt: false });
  return PromptProvenance;
};
