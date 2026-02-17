'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('alerts', {
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
      type: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'opportunities', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      severity: {
        type: Sequelize.STRING(20),
        defaultValue: 'info',
      },
      read: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('alerts', ['user_id']);
    await queryInterface.addIndex('alerts', ['read']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('alerts');
  },
};
