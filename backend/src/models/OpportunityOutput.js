module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const OpportunityOutput = sequelize.define('OpportunityOutput', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'opportunity_id',
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['proposal', 'offer', 'analysis', 'resume']] },
    },
    content: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'draft',
      allowNull: false,
      validate: { isIn: [['draft', 'approved', 'rejected']] },
    },
    generatedBy: { type: DataTypes.INTEGER, allowNull: true, field: 'generated_by' },
    aiModel:     { type: DataTypes.STRING(60), allowNull: true, field: 'ai_model' },
    reviewerId:  { type: DataTypes.INTEGER, allowNull: true, field: 'reviewer_id' },
    reviewedAt:  { type: DataTypes.DATE, allowNull: true, field: 'reviewed_at' },
    reviewNotes: { type: DataTypes.TEXT, allowNull: true, field: 'review_notes' },
    // v3: execution-intelligence metadata — template_used, personalization_score,
    // past_wins_used, profile_hash, colaberry_positioning, generated_at.
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Phase 12: prompt provenance — every generated output traces back to
    // a deterministic prompt-context block via these two fields.
    promptProvenanceId: { type: DataTypes.BIGINT, allowNull: true, field: 'prompt_provenance_id' },
    promptAuditHash: { type: DataTypes.STRING(64), allowNull: true, field: 'prompt_audit_hash' },
  }, {
    tableName: 'opportunity_outputs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['opportunity_id'] },
      { fields: ['status'] },
      { fields: ['type'] },
    ],
  });

  return OpportunityOutput;
};
