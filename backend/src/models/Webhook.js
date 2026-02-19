module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const Webhook = sequelize.define('Webhook', {
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
    url: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    eventTypes: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'event_types',
      defaultValue: [],
    },
    secret: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  }, {
    tableName: 'webhooks',
    timestamps: true,
    underscored: true,
  });

  Webhook.associate = (models) => {
    Webhook.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Webhook.hasMany(models.WebhookDelivery, { foreignKey: 'webhook_id', as: 'deliveries' });
  };

  return Webhook;
};
