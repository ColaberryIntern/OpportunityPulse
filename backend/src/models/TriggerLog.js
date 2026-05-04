module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // Append-only audit log for the auto-execution trigger engine. Records
  // every fire/skip/dry_run/failure so admins can review what would have
  // happened before flipping triggers from dry-run to live.
  const TriggerLog = sequelize.define('TriggerLog', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER, allowNull: true, field: 'organization_id',
    },
    ruleName: {
      type: DataTypes.STRING(80), allowNull: false, field: 'rule_name',
    },
    targetType: {
      type: DataTypes.STRING(40), allowNull: false, field: 'target_type',
      validate: { isIn: [['opportunity', 'bundle']] },
    },
    targetId: {
      type: DataTypes.INTEGER, allowNull: false, field: 'target_id',
    },
    action: {
      type: DataTypes.STRING(40), allowNull: false,
      validate: { isIn: [['generate_proposal', 'generate_strategy']] },
    },
    status: {
      type: DataTypes.STRING(20), allowNull: false,
      validate: { isIn: [['success', 'skipped', 'failed', 'dry_run']] },
    },
    reason:   { type: DataTypes.TEXT,    allowNull: true },
    outputId: { type: DataTypes.INTEGER, allowNull: true, field: 'output_id' },
  }, {
    tableName: 'trigger_logs',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  return TriggerLog;
};
