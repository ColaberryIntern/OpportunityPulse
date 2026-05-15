// Deep Research Phase 4 — edges in the venture dependency graph.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const VentureDependency = sequelize.define('VentureDependency', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    relatedVentureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'related_venture_idea_id' },
    dependencyType: { type: DataTypes.STRING(40), allowNull: false, field: 'dependency_type' },
    riskScore: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'risk_score' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'venture_dependencies',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['venture_idea_id'] },
      { unique: true, fields: ['venture_idea_id', 'related_venture_idea_id', 'dependency_type'] },
    ],
  });
  return VentureDependency;
};
