// Deep Research Phase 3 — the go-to-market launch strategy for a venture
// idea: ICP, GTM, pricing, pilot / enterprise / government strategies.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const LaunchStrategy = sequelize.define('LaunchStrategy', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    icp: { type: DataTypes.TEXT, allowNull: true },
    gtm: { type: DataTypes.TEXT, allowNull: true },
    landingPage: { type: DataTypes.TEXT, allowNull: true, field: 'landing_page' },
    outreach: { type: DataTypes.TEXT, allowNull: true },
    channels: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    pricingStrategy: { type: DataTypes.TEXT, allowNull: true, field: 'pricing_strategy' },
    pilotStrategy: { type: DataTypes.TEXT, allowNull: true, field: 'pilot_strategy' },
    enterpriseStrategy: { type: DataTypes.TEXT, allowNull: true, field: 'enterprise_strategy' },
    govStrategy: { type: DataTypes.TEXT, allowNull: true, field: 'gov_strategy' },
    generatedBy: { type: DataTypes.STRING(60), allowNull: true, field: 'generated_by' },
  }, {
    tableName: 'launch_strategies',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['venture_idea_id'] }],
  });

  LaunchStrategy.associate = (models) => {
    LaunchStrategy.belongsTo(models.VentureIdea, { foreignKey: 'venture_idea_id', as: 'ventureIdea' });
  };

  return LaunchStrategy;
};
