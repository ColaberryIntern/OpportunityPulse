'use strict';

// OIED v2 — personalization layer.
//   user_profiles : per-user business profile feeding the scorer
//   bundles       : grouped opportunities (clusters) discovered by the bundler
//   + priority_score column on opportunity_fit_scores so we can sort the
//     "Act Now / High Value / Quick Wins" buckets without recomputing.

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- user_profiles --------------------------------------------------
    await queryInterface.createTable('user_profiles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      services:        { type: Sequelize.JSONB, defaultValue: [] },
      industries:      { type: Sequelize.JSONB, defaultValue: [] },
      min_deal_size:   { type: Sequelize.INTEGER, defaultValue: 0 },
      tools:           { type: Sequelize.JSONB, defaultValue: [] },
      past_wins:       { type: Sequelize.JSONB, defaultValue: [] },
      risk_tolerance:  { type: Sequelize.STRING(20), defaultValue: 'medium' },
      // Soft profile metadata used by the scorer (geo, strategic tags) —
      // stored alongside the spec fields so the JSONB stays self-contained.
      preferences:     { type: Sequelize.JSONB, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('user_profiles', ['user_id'], {
      name: 'idx_user_profiles_user',
      unique: true,
    });

    // ---- bundles --------------------------------------------------------
    await queryInterface.createTable('bundles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      theme: { type: Sequelize.STRING(300), allowNull: false },
      key: { type: Sequelize.STRING(100), allowNull: false }, // category|product key
      opportunity_ids: { type: Sequelize.JSONB, defaultValue: [] },
      opportunity_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      estimated_total_value: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
      summary: { type: Sequelize.TEXT, allowNull: true },
      generated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('bundles', ['key'], { name: 'idx_bundles_key' });
    await queryInterface.addIndex('bundles', ['estimated_total_value'], { name: 'idx_bundles_value' });

    // ---- priority_score on fit_scores -----------------------------------
    await queryInterface.addColumn('opportunity_fit_scores', 'priority_score', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addIndex('opportunity_fit_scores', ['priority_score'], {
      name: 'idx_oied_fit_priority',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('opportunity_fit_scores', 'idx_oied_fit_priority').catch(() => {});
    await queryInterface.removeColumn('opportunity_fit_scores', 'priority_score').catch(() => {});
    await queryInterface.dropTable('bundles');
    await queryInterface.dropTable('user_profiles');
  },
};
