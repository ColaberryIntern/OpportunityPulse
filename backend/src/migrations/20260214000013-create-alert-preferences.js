'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('alert_preferences', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      gov_contracts: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      ai_jobs: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      investments: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      min_score: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      email_notify: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      in_app_notify: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
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
    await queryInterface.dropTable('alert_preferences');
  },
};
