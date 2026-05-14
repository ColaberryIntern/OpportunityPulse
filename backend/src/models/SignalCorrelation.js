// Deep Research Phase 2 — the cross-channel correlation engine's output for
// one report: how strongly the channels reinforce each other, what kind of
// convergence it is, and the per-channel signal breakdown.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const SignalCorrelation = sequelize.define('SignalCorrelation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reportId: { type: DataTypes.INTEGER, allowNull: false, field: 'report_id' },
    correlationStrength: {
      type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0, field: 'correlation_strength',
    },
    acceleration: { type: DataTypes.DECIMAL(5, 3), allowNull: false, defaultValue: 1 },
    convergenceType: {
      type: DataTypes.STRING(40), allowNull: false, defaultValue: 'none', field: 'convergence_type',
    },
    signalBreakdown: {
      type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'signal_breakdown',
    },
    supportingEvidence: {
      type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'supporting_evidence',
    },
  }, {
    tableName: 'signal_correlations',
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ['report_id'] }],
  });

  SignalCorrelation.associate = (models) => {
    SignalCorrelation.belongsTo(models.DeepResearchReport, { foreignKey: 'report_id', as: 'report' });
  };

  return SignalCorrelation;
};
