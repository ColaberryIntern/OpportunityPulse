// Deep Research Phase 5 — per-venture trajectory classification snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const VentureTrajectory = sequelize.define('VentureTrajectory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    classification: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'unknown' },
    scoreDelta: { type: DataTypes.DECIMAL(6, 2), allowNull: true, field: 'score_delta' },
    confidenceDelta: { type: DataTypes.DECIMAL(5, 3), allowNull: true, field: 'confidence_delta' },
    readinessDelta: { type: DataTypes.DECIMAL(6, 2), allowNull: true, field: 'readiness_delta' },
    lifecycleVelocity: { type: DataTypes.DECIMAL(6, 3), allowNull: true, field: 'lifecycle_velocity' },
    periodDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30, field: 'period_days' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'venture_trajectories', timestamps: false, underscored: true,
    indexes: [{ fields: ['venture_idea_id', 'computed_at'] }],
  });
  return VentureTrajectory;
};
