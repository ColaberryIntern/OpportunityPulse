// Deep Research Phase 3 — the audit trail of venture lifecycle transitions.
// One row per state change; venture_ideas.lifecycle_state is the fast-read
// denormalized current state.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const VentureLifecycleEvent = sequelize.define('VentureLifecycleEvent', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    fromState: { type: DataTypes.STRING(40), allowNull: true, field: 'from_state' },
    toState: { type: DataTypes.STRING(40), allowNull: false, field: 'to_state' },
    actor: { type: DataTypes.STRING(120), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'venture_lifecycle_events',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }],
  });

  VentureLifecycleEvent.associate = (models) => {
    VentureLifecycleEvent.belongsTo(models.VentureIdea, { foreignKey: 'venture_idea_id', as: 'ventureIdea' });
  };

  return VentureLifecycleEvent;
};
