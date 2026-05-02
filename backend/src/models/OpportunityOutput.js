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
      validate: { isIn: [['proposal', 'offer', 'analysis']] },
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
