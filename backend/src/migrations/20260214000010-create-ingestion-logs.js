'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ingestion_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      data_source_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'data_sources', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      records_fetched: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      records_created: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      records_updated: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      records_skipped: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      errors: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ingestion_logs');
  },
};
