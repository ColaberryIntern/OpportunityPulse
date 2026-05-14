// Deep Research Phase 2 — DB-driven scan config for the briefing center.
// One row per recurring scan topic: how often, who gets the email, on/off.
// The daily scheduler reads enabled rows and runs the ones that are due.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const BriefingSubscription = sequelize.define('BriefingSubscription', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    scanTopic: { type: DataTypes.STRING(200), allowNull: false, field: 'scan_topic' },
    frequency: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'daily' },
    recipients: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastScanAt: { type: DataTypes.DATE, allowNull: true, field: 'last_scan_at' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
  }, {
    tableName: 'briefing_subscriptions',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['enabled'] }],
  });

  return BriefingSubscription;
};
