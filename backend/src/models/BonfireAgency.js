module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const BonfireAgency = sequelize.define('BonfireAgency', {
    subdomain: {
      type: DataTypes.STRING(100),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    lastScrapedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_scraped_at',
    },
    lastSucceededAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_succeeded_at',
    },
    lastOpenCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'last_open_count',
    },
    consecutiveBlocks: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'consecutive_blocks',
    },
    lastBlockReason: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'last_block_reason',
    },
  }, {
    tableName: 'bonfire_agencies',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['last_scraped_at'] },
    ],
  });

  return BonfireAgency;
};
