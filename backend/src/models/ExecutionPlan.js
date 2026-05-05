module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // One row per bundle (unique on bundle_id). Built deterministically
  // from the bundle's blueprint by executionPlanner.service. Status
  // flows draft → in_progress → completed; cancelled is the escape
  // hatch.
  const ExecutionPlan = sequelize.define('ExecutionPlan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    bundleId: {
      type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'bundle_id',
    },
    organizationId: {
      type: DataTypes.INTEGER, allowNull: true, field: 'organization_id',
    },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft',
      validate: { isIn: [['draft', 'in_progress', 'completed', 'cancelled']] },
    },
    tasks:           { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    timeline:        { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    assignedAgents:  { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'assigned_agents' },
    startedAt:       { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt:     { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  }, {
    tableName: 'execution_plans',
    timestamps: true,
    underscored: true,
  });

  return ExecutionPlan;
};
