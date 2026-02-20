'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('freelance_trend_snapshots', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      snapshot_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      skill: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      demand_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      avg_budget: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
      },
      avg_proposals: {
        type: Sequelize.DECIMAL(8, 2),
        allowNull: true,
      },
      top_platforms: {
        type: Sequelize.JSONB,
        defaultValue: [],
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

    await queryInterface.addIndex('freelance_trend_snapshots', ['snapshot_date', 'skill'], {
      unique: true,
      name: 'idx_fts_date_skill',
    });

    await queryInterface.addIndex('freelance_trend_snapshots', ['skill'], {
      name: 'idx_fts_skill',
    });

    await queryInterface.addIndex('freelance_trend_snapshots', ['snapshot_date'], {
      name: 'idx_fts_date',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('freelance_trend_snapshots');
  },
};
