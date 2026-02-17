module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const DataSource = sequelize.define('DataSource', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    config: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    schedule: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_run_at',
    },
    lastRunStatus: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'last_run_status',
    },
  }, {
    tableName: 'data_sources',
    timestamps: true,
    underscored: true,
  });

  DataSource.associate = (models) => {
    DataSource.hasMany(models.Opportunity, { foreignKey: 'data_source_id', as: 'opportunities' });
    DataSource.hasMany(models.IngestionLog, { foreignKey: 'data_source_id', as: 'ingestionLogs' });
  };

  return DataSource;
};
