module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // Append-only event log of billable actions. One row per recorded
  // event. Aggregations (per-month, per-metric) live in queries via
  // billing.service so we don't have a rolling counter to keep
  // consistent.
  const UsageMetric = sequelize.define('UsageMetric', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    organizationId: {
      type: DataTypes.INTEGER, allowNull: true, field: 'organization_id',
    },
    metricName: {
      type: DataTypes.STRING(60), allowNull: false, field: 'metric_name',
    },
    count:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'usage_metrics',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  return UsageMetric;
};
