module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ApiKey = sequelize.define('ApiKey', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: { model: 'users', key: 'id' },
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    keyPrefix: {
      type: DataTypes.STRING(12),
      allowNull: false,
      field: 'key_prefix',
    },
    keyHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'key_hash',
    },
    scopes: {
      type: DataTypes.JSONB,
      defaultValue: ['read'],
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_used_at',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
  }, {
    tableName: 'api_keys',
    timestamps: true,
    underscored: true,
  });

  ApiKey.associate = (models) => {
    ApiKey.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return ApiKey;
};
