// Deep Research Phase 2 — an immutable snapshot of a report at a point in
// time. A re-run snapshots the current state here before overwriting, so
// report history is preserved and auditable.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ReportVersion = sequelize.define('ReportVersion', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reportId: { type: DataTypes.INTEGER, allowNull: false, field: 'report_id' },
    version: { type: DataTypes.INTEGER, allowNull: false },
    snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'report_versions',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['report_id'] },
      { unique: true, fields: ['report_id', 'version'] },
    ],
  });

  ReportVersion.associate = (models) => {
    ReportVersion.belongsTo(models.DeepResearchReport, { foreignKey: 'report_id', as: 'report' });
  };

  return ReportVersion;
};
