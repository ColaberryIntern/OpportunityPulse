'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('analysis_runs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      type: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'running',
      },
      opportunity_type: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      input_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      output_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      results: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      errors: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      tokens_used: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('analysis_runs');
  },
};
