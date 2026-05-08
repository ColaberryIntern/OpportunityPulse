module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const BonfireOpportunity = sequelize.define('BonfireOpportunity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    agency: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    categoryRaw: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'category_raw',
    },
    aiCategory: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'ai_category',
    },
    fitScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'fit_score',
    },
    priorityScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'priority_score',
    },
    automationPotential: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'automation_potential',
    },
    revenueWeight: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'revenue_weight',
    },
    repeatability: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    easeOfEntry: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'ease_of_entry',
    },
    estimatedValue: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'estimated_value',
    },
    recommendedProduct: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'recommended_product',
    },
    signals: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    closeDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'close_date',
    },
    sourceUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'source_url',
    },
    rawText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'raw_text',
    },
    strategy: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    enrichedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'enriched_at',
    },
    enrichmentVersion: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: 'enrichment_version',
    },
    enrichmentHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'enrichment_hash',
    },
    externalId: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'external_id',
    },
    overview: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    submissionRequirements: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'submission_requirements',
    },
    attachmentsFetchedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'attachments_fetched_at',
    },
  }, {
    tableName: 'bonfire_opportunities',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['ai_category'] },
      { fields: ['priority_score'] },
      { fields: ['close_date'] },
      { fields: ['enriched_at'] },
      // Partial unique index lives in the migration (Sequelize doesn't express the
      // WHERE clause cleanly here). This entry documents intent for sync({alter:true}).
      { fields: ['external_id'] },
    ],
  });

  BonfireOpportunity.associate = (models) => {
    BonfireOpportunity.hasMany(models.BonfireOpportunityTag, {
      foreignKey: 'opportunity_id',
      as: 'tags',
      onDelete: 'CASCADE',
    });
    BonfireOpportunity.hasMany(models.BonfirePipeline, {
      foreignKey: 'opportunity_id',
      as: 'pipelineEntries',
      onDelete: 'CASCADE',
    });
  };

  return BonfireOpportunity;
};
