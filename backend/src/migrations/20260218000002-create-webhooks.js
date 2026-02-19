'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('webhooks', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      url: {
        type: Sequelize.STRING(512),
        allowNull: false,
      },
      event_types: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      secret: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('webhooks', ['user_id']);
    await queryInterface.addIndex('webhooks', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('webhooks');
  },
};
