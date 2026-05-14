// Deep Research Phase 2 — one row per AI call attempt. The observability
// substrate for the resilient aiProvider layer: provider, model, status,
// retry attempt, duration, tokens, and a typed error class.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const AiProviderLog = sequelize.define('AiProviderLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'openai' },
    operation: { type: DataTypes.STRING(60), allowNull: true },
    model: { type: DataTypes.STRING(60), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false },
    attempt: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    durationMs: { type: DataTypes.INTEGER, allowNull: true, field: 'duration_ms' },
    tokensUsed: { type: DataTypes.INTEGER, allowNull: true, field: 'tokens_used' },
    errorClass: { type: DataTypes.STRING(30), allowNull: true, field: 'error_class' },
    errorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'error_message' },
  }, {
    tableName: 'ai_provider_logs',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['created_at'] },
      { fields: ['status'] },
    ],
  });

  return AiProviderLog;
};
