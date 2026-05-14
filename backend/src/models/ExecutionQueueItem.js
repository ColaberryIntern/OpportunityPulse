// Deep Research Phase 3 — a venture's row in the execution queue. One per
// venture idea (unique); priority_score drives queue ordering.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ExecutionQueueItem = sequelize.define('ExecutionQueueItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    lifecycleState: {
      type: DataTypes.STRING(40), allowNull: false, defaultValue: 'discovered', field: 'lifecycle_state',
    },
    priorityScore: {
      type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, field: 'priority_score',
    },
    owner: { type: DataTypes.STRING(120), allowNull: true },
    blockers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  }, {
    tableName: 'execution_queue_items',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['venture_idea_id'] },
      { fields: ['lifecycle_state'] },
    ],
  });

  ExecutionQueueItem.associate = (models) => {
    ExecutionQueueItem.belongsTo(models.VentureIdea, { foreignKey: 'venture_idea_id', as: 'ventureIdea' });
  };

  return ExecutionQueueItem;
};
