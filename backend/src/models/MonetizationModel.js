// Deep Research Phase 2 — one monetization model for a report. The
// monetization engine produces a set of these per report, one per relevant
// model type (SaaS / enterprise / government / education / services /
// marketplace).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const MonetizationModel = sequelize.define('MonetizationModel', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reportId: { type: DataTypes.INTEGER, allowNull: false, field: 'report_id' },
    modelType: { type: DataTypes.STRING(30), allowNull: false, field: 'model_type' },
    pricingSuggestion: { type: DataTypes.TEXT, allowNull: true, field: 'pricing_suggestion' },
    idealIcp: { type: DataTypes.TEXT, allowNull: true, field: 'ideal_icp' },
    revenueModel: { type: DataTypes.TEXT, allowNull: true, field: 'revenue_model' },
    implementationComplexity: {
      type: DataTypes.STRING(20), allowNull: true, field: 'implementation_complexity',
    },
    fitScore: { type: DataTypes.DECIMAL(4, 3), allowNull: true, field: 'fit_score' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'monetization_models',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['report_id'] }],
  });

  MonetizationModel.associate = (models) => {
    MonetizationModel.belongsTo(models.DeepResearchReport, { foreignKey: 'report_id', as: 'report' });
  };

  return MonetizationModel;
};
