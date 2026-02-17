'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('opportunities', {
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
      title: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      source_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      source_url: {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(30),
        defaultValue: 'active',
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        defaultValue: [],
      },
      location: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      source_data: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      ai_score: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
      },
      ai_analysis: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      data_source_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'data_sources', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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

    // Indexes
    await queryInterface.addIndex('opportunities', ['type']);
    await queryInterface.addIndex('opportunities', ['source']);
    await queryInterface.addIndex('opportunities', ['source', 'source_id'], { unique: true });
    await queryInterface.addIndex('opportunities', ['status']);
    await queryInterface.addIndex('opportunities', ['category']);
    await queryInterface.addIndex('opportunities', ['published_at']);
    await queryInterface.addIndex('opportunities', ['ai_score']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('opportunities');
  },
};
