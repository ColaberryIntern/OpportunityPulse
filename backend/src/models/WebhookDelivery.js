module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const WebhookDelivery = sequelize.define('WebhookDelivery', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    webhookId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'webhook_id',
      references: { model: 'webhooks', key: 'id' },
    },
    eventType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'event_type',
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'success', 'failed']],
      },
    },
    responseCode: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'response_code',
    },
    responseBody: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'response_body',
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    nextRetryAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_retry_at',
    },
  }, {
    tableName: 'webhook_deliveries',
    timestamps: true,
    updatedAt: false,
    underscored: true,
  });

  WebhookDelivery.associate = (models) => {
    WebhookDelivery.belongsTo(models.Webhook, { foreignKey: 'webhook_id', as: 'webhook' });
  };

  return WebhookDelivery;
};
