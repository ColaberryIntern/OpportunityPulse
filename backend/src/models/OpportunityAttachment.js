// Submission Readiness Engine v0.4 — RFP attachment row.
//
// Each row is one downloaded file from a procurement portal (Bonfire
// detail page in v0.4; SAM.gov / grants.gov in v0.5). `parsed_text`
// caches the pdf-parse / mammoth extraction so AI calls don't re-parse
// every time.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const OpportunityAttachment = sequelize.define('OpportunityAttachment', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    bonfireOpportunityId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'bonfire_opportunity_id',
    },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'opportunity_id',
    },
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
      // 'bonfire' | 'sam_gov' | 'grants_gov' | 'manual'
    },
    name: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    filePath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'file_path',
    },
    mime: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    sizeBytes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'size_bytes',
    },
    urlOriginal: {
      type: DataTypes.STRING(800),
      allowNull: true,
      field: 'url_original',
    },
    parsedText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'parsed_text',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    downloadedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'downloaded_at',
    },
  }, {
    tableName: 'opportunity_attachments',
    timestamps: true,
    underscored: true,
  });

  OpportunityAttachment.associate = (models) => {
    OpportunityAttachment.belongsTo(models.BonfireOpportunity, {
      foreignKey: 'bonfire_opportunity_id', as: 'bonfireOpportunity',
    });
    OpportunityAttachment.belongsTo(models.Opportunity, {
      foreignKey: 'opportunity_id', as: 'opportunity',
    });
  };

  return OpportunityAttachment;
};
