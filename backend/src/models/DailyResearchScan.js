// Deep Research Intelligence Engine — the log of once-per-day automated
// strategic scans. Each row records a scan topic, the report it produced,
// and the run status.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const DailyResearchScan = sequelize.define('DailyResearchScan', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    scanTopic: { type: DataTypes.STRING(200), allowNull: false, field: 'scan_topic' },
    reportId: { type: DataTypes.INTEGER, allowNull: true, field: 'report_id' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'running' },
    error: { type: DataTypes.TEXT, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  }, {
    tableName: 'daily_research_scans',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['created_at'] },
      { fields: ['scan_topic'] },
    ],
  });

  DailyResearchScan.associate = (models) => {
    DailyResearchScan.belongsTo(models.DeepResearchReport, {
      foreignKey: 'report_id',
      as: 'report',
    });
  };

  return DailyResearchScan;
};
