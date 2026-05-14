// Research Intelligence Phase 3c — research_relationships graph edges.
// Materializes Phase 2.2's cross-channel matches as queryable edges.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ResearchRelationship = sequelize.define('ResearchRelationship', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    researchOpportunityId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'research_opportunity_id',
    },
    relatedOpportunityId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'related_opportunity_id',
    },
    relationshipType: {
      type: DataTypes.STRING(40), allowNull: false, defaultValue: 'cross_channel', field: 'relationship_type',
    },
    relatedChannel: { type: DataTypes.STRING(40), allowNull: true, field: 'related_channel' },
    score: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'research_relationships',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['research_opportunity_id'] },
      { fields: ['related_opportunity_id'] },
      { fields: ['relationship_type'] },
      { unique: true, fields: ['research_opportunity_id', 'related_opportunity_id', 'relationship_type'] },
    ],
  });

  ResearchRelationship.associate = (models) => {
    ResearchRelationship.belongsTo(models.Opportunity, { foreignKey: 'research_opportunity_id', as: 'researchOpportunity' });
    ResearchRelationship.belongsTo(models.Opportunity, { foreignKey: 'related_opportunity_id', as: 'relatedOpportunity' });
  };

  return ResearchRelationship;
};
