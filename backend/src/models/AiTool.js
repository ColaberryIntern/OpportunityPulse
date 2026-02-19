module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const AiTool = sequelize.define('AiTool', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },
    slug: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    logoUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'logo_url',
    },
    vendor: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['LLM', 'Image Generation', 'Code Assistant', 'Audio/Speech', 'Video', 'Analytics', 'Automation', 'Search', 'Writing', 'Design', 'Data Science', 'Other']],
      },
    },
    subcategory: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    industries: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    trendingScore: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
      field: 'trending_score',
    },
    mentionCount7d: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'mention_count_7d',
    },
    sentimentScore: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      field: 'sentiment_score',
    },
    trendDirection: {
      type: DataTypes.STRING(20),
      defaultValue: 'stable',
      field: 'trend_direction',
      validate: {
        isIn: [['rising', 'stable', 'declining']],
      },
    },
    lastMajorUpdate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_major_update',
    },
    lastMajorUpdateSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_major_update_summary',
    },
    updateHistory: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'update_history',
    },
    pricingTier: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'pricing_tier',
      validate: {
        isIn: [['free', 'freemium', 'paid', 'enterprise']],
      },
    },
    pricingDetails: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'pricing_details',
    },
    features: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'features',
    },
    aiAnalysis: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'ai_analysis',
    },
    sourceData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'source_data',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'deprecated', 'archived']],
      },
    },
    lastAnalyzedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_analyzed_at',
    },
  }, {
    tableName: 'ai_tools',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['name'] },
      { unique: true, fields: ['slug'] },
      { fields: ['category'] },
      { fields: ['trending_score'] },
      { fields: ['status'] },
    ],
  });

  AiTool.associate = (models) => {
    AiTool.hasMany(models.AiToolMention, { foreignKey: 'ai_tool_id', as: 'mentions' });
  };

  return AiTool;
};
