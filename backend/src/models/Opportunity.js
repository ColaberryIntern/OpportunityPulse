module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const Opportunity = sequelize.define('Opportunity', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        // 'research' added in the Research Intelligence expansion (Phase 1) —
        // AI papers, benchmarks, technical breakthroughs as first-class opps.
        isIn: [['gov_contract', 'ai_job', 'investment', 'grant', 'ai_news', 'freelance', 'bonfire', 'bonfire_strategic', 'research']],
      },
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    sourceId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'source_id',
    },
    sourceUrl: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      field: 'source_url',
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'closed', 'expired', 'archived']],
      },
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    value: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: true,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    sourceData: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'source_data',
    },
    aiScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'ai_score',
    },
    aiAnalysis: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'ai_analysis',
    },
    actionType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'action_type',
      validate: {
        isIn: [['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH', 'IGNORE']],
      },
    },
    saturationIndex: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      field: 'saturation_index',
    },
    opportunityQuadrant: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'opportunity_quadrant',
    },
    dataSourceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'data_source_id',
      references: { model: 'data_sources', key: 'id' },
    },
    // Research Intelligence Phase 3a — text embedding stored as a JSONB float
    // array (not pgvector — see migration 20260510000010 for the rationale).
    embedding: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    embeddingModel: {
      type: DataTypes.STRING(60),
      allowNull: true,
      field: 'embedding_model',
    },
    embeddedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'embedded_at',
    },
  }, {
    tableName: 'opportunities',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['source'] },
      { unique: true, fields: ['source', 'source_id'] },
      { fields: ['status'] },
      { fields: ['category'] },
      { fields: ['published_at'] },
      { fields: ['ai_score'] },
      { fields: ['action_type'] },
      { fields: ['saturation_index'] },
      { fields: ['opportunity_quadrant'] },
    ],
  });

  Opportunity.associate = (models) => {
    Opportunity.belongsTo(models.DataSource, { foreignKey: 'data_source_id', as: 'dataSource' });
    Opportunity.hasMany(models.OpportunityAction, { foreignKey: 'opportunity_id', as: 'actions' });
    Opportunity.hasOne(models.OpportunityClassification, { foreignKey: 'opportunity_id', as: 'classification' });
    Opportunity.hasMany(models.OpportunityMultiTag, { foreignKey: 'opportunity_id', as: 'multiTags' });
  };

  return Opportunity;
};
