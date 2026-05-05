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
      // v6: 'auto_submit' joins the v4 generate_* actions.
      validate: { isIn: [['generate_proposal', 'generate_strategy', 'auto_submit']] },
    },
    status: {
      type: DataTypes.STRING(20), allowNull: false,
      validate: { isIn: [['success', 'skipped', 'failed', 'dry_run']] },
    },
    reason:   { type: DataTypes.TEXT,    allowNull: true },
    outputId: { type: DataTypes.INTEGER, allowNull: true, field: 'output_id' },
    // v6: confidence_score is populated for the auto_submit rule.
    // null for v4 rule rows (legacy auto_proposal / auto_strategy).
    confidenceScore: {
      type: DataTypes.DECIMAL(4, 3),
      allowNull: true,
      field: 'confidence_score',
    },
  }, {
    tableName: 'trigger_logs',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  return TriggerLog;
};
