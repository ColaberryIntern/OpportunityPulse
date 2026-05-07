// OIED v9.7 — persisted, validated keyword trends.
//
// Each row = one keyword that survived the validation gate
// (match_count >= 3 OR tool_count >= 1). Computed by the twice-daily
// keywordTrendCompute cron and read by /api/v1/oied/keywords/cloud.

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('keyword_trends', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      word:           { type: Sequelize.STRING(120), allowNull: false, unique: true },
      display_word:   { type: Sequelize.STRING(120) },
      match_count:    { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      tool_count:     { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      total_mentions: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      channel_counts: { type: Sequelize.JSONB,   allowNull: false, defaultValue: {} },
      sentiment_score: { type: Sequelize.DECIMAL(3, 2) },
      sentiment_label: { type: Sequelize.STRING(20) },
      avg_age_days:   { type: Sequelize.DECIMAL(4, 1) },
      is_industry:    { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      trend_velocity: { type: Sequelize.DECIMAL(5, 2) }, // reserved for v9.8
      run_id:         { type: Sequelize.STRING(60), allowNull: false },
      last_computed_at: {
        type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('keyword_trends', ['is_industry'], {
      name: 'idx_keyword_trends_industry',
    });
    await queryInterface.addIndex('keyword_trends', ['match_count'], {
      name: 'idx_keyword_trends_match_count',
    });
    await queryInterface.addIndex('keyword_trends', ['last_computed_at'], {
      name: 'idx_keyword_trends_last_computed',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('keyword_trends');
  },
};
