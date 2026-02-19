module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const AiToolMention = sequelize.define('AiToolMention', {
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
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'opportunity_id',
      references: { model: 'opportunities', key: 'id' },
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    sourceUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'source_url',
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    snippet: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sentiment: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['positive', 'neutral', 'negative']],
      },
    },
    significance: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        isIn: [['major_update', 'review', 'mention', 'comparison']],
      },
    },
    mentionedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'mentioned_at',
    },
    sourceData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'source_data',
    },
  }, {
    tableName: 'ai_tool_mentions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['ai_tool_id'] },
      { fields: ['opportunity_id'] },
      { fields: ['source'] },
      { fields: ['mentioned_at'] },
      {
        unique: true,
        fields: ['ai_tool_id', 'source', 'source_url'],
        name: 'ai_tool_mentions_tool_source_url_unique',
      },
    ],
  });

  AiToolMention.associate = (models) => {
    AiToolMention.belongsTo(models.AiTool, { foreignKey: 'ai_tool_id', as: 'aiTool' });
    AiToolMention.belongsTo(models.Opportunity, { foreignKey: 'opportunity_id', as: 'opportunity' });
  };

  return AiToolMention;
};
