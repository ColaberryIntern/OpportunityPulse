// Deep Research Phase 4 — ROI forecast row. scope='venture' for per-venture,
// scope='portfolio' for the rolled-up portfolio view. One row per scenario.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const RoiForecast = sequelize.define('RoiForecast', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: true, field: 'venture_idea_id' },
    scope: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'venture' },
    scenario: { type: DataTypes.STRING(20), allowNull: false },
    projectedMrr: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'projected_mrr' },
    implementationCost: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'implementation_cost' },
    staffingCost: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'staffing_cost' },
    infraCost: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'infra_cost' },
    breakevenMonths: { type: DataTypes.DECIMAL(6, 2), allowNull: true, field: 'breakeven_months' },
    projectedRoi12mo: { type: DataTypes.DECIMAL(6, 3), allowNull: true, field: 'projected_roi_12mo' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    runId: { type: DataTypes.STRING(60), allowNull: false, field: 'run_id' },
  }, {
    tableName: 'roi_forecasts',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }, { fields: ['run_id'] }],
  });
  return RoiForecast;
};
