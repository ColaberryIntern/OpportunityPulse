// Deep Research Phase 8 — venture-idea ↔ existing-tool overlap rows.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const VentureConflict = sequelize.define('VentureConflict', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    aiToolId: { type: DataTypes.INTEGER, allowNull: false, field: 'ai_tool_id' },
    conflictType: { type: DataTypes.STRING(30), allowNull: false, field: 'conflict_type' },
    severity: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    matchedTerms: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'matched_terms' },
    differentiationHints: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'differentiation_hints' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'venture_conflicts', timestamps: false, underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }, { fields: ['ai_tool_id'] }],
  });
  return VentureConflict;
};
