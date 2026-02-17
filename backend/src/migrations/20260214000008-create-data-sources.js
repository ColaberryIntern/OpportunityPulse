'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('data_sources', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      type: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      config: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      schedule: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      last_run_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_run_status: {
        type: Sequelize.STRING(30),
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('data_sources');
  },
};
