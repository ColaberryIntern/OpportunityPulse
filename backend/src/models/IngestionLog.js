module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const IngestionLog = sequelize.define('IngestionLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dataSourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'data_source_id',
      references: { model: 'data_sources', key: 'id' },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        isIn: [['running', 'success', 'partial', 'failed']],
      },
    },
    recordsFetched: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'records_fetched',
    },
    recordsCreated: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'records_created',
    },
    recordsUpdated: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'records_updated',
    },
    recordsSkipped: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'records_skipped',
    },
    errors: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  }, {
    tableName: 'ingestion_logs',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  IngestionLog.associate = (models) => {
    IngestionLog.belongsTo(models.DataSource, { foreignKey: 'data_source_id', as: 'dataSource' });
  };

  return IngestionLog;
};
