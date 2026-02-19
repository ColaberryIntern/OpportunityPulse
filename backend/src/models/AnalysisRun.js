module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const AnalysisRun = sequelize.define('AnalysisRun', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['scoring', 'trend_detection', 'insight_generation', 'ai_tool_mention_extraction', 'ai_tool_trend_analysis', 'ai_tool_github_discovery', 'ai_tool_producthunt_discovery']],
      },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'running',
      validate: {
        isIn: [['running', 'success', 'partial', 'failed']],
      },
    },
    opportunityType: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'opportunity_type',
    },
    inputCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'input_count',
    },
    outputCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'output_count',
    },
    results: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    errors: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    tokensUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'tokens_used',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  }, {
    tableName: 'analysis_runs',
    timestamps: false,
    underscored: true,
  });

  return AnalysisRun;
};
