'use strict';

// OIED v3 — Revenue Intelligence schema deltas. All additions are
// nullable / defaulted, so existing rows continue to work. No data
// migration required.

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. opportunity_outputs.metadata — template_used, personalization_score,
    //    past_wins_used, profile_hash, colaberry_positioning, generated_at.
    await queryInterface.addColumn('opportunity_outputs', 'metadata', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });

    // 2. Bundle monetization columns.
    await queryInterface.addColumn('bundles', 'suggested_solution', {
      type: Sequelize.STRING(300),
      allowNull: true,
    });
    await queryInterface.addColumn('bundles', 'estimated_build_time_days', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('bundles', 'strategy', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
    await queryInterface.addColumn('bundles', 'strategy_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    // 3. Effort score on the fit-scores cache (recommendation engine reads it).
    await queryInterface.addColumn('opportunity_fit_scores', 'effort_score', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // 4. Partial index for conversion-event queries (submitted/responded/won/lost).
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_events_conversion_types
      ON opportunity_events (opportunity_id, event_type)
      WHERE event_type IN ('submitted','response_received','won','lost');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS idx_events_conversion_types;',
    );
    await queryInterface.removeColumn('opportunity_fit_scores', 'effort_score');
    await queryInterface.removeColumn('bundles', 'strategy_hash');
    await queryInterface.removeColumn('bundles', 'strategy');
    await queryInterface.removeColumn('bundles', 'estimated_build_time_days');
    await queryInterface.removeColumn('bundles', 'suggested_solution');
    await queryInterface.removeColumn('opportunity_outputs', 'metadata');
  },
};
