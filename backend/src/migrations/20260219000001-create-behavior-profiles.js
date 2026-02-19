'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('behavior_profiles', {
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
      interest_scores: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      category_preferences: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      tag_affinities: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      search_patterns: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      engagement_metrics: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      last_computed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('behavior_profiles');
  },
};
