module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ToolSignal = sequelize.define('ToolSignal', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    aiToolId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'ai_tool_id',
      references: { model: 'ai_tools', key: 'id' },
    },
    signalType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'signal_type',
      validate: {
        isIn: [['github_growth', 'funding', 'enterprise_adoption', 'social_velocity', 'launch', 'mention_spike']],
      },
    },
    signalValue: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
      field: 'signal_value',
    },
    signalDelta: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'signal_delta',
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    sourceData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'source_data',
    },
  }, {
    tableName: 'tool_signals',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  });

  ToolSignal.associate = (models) => {
    ToolSignal.belongsTo(models.AiTool, { foreignKey: 'ai_tool_id', as: 'tool' });
  };

  return ToolSignal;
};
