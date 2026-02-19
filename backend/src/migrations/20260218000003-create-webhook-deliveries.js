'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('webhook_deliveries', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      webhook_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'webhooks', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      event_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'pending',
      },
      response_code: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      response_body: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      next_retry_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('webhook_deliveries', ['webhook_id']);
    await queryInterface.addIndex('webhook_deliveries', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('webhook_deliveries');
  },
};
