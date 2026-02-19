'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. ai_domains — AI Domain Verticals
    await queryInterface.createTable('ai_domains', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      naics_codes: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // 2. ai_capabilities — AI Capability Stack
    await queryInterface.createTable('ai_capabilities', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      parent_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'ai_capabilities', key: 'id' } },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // 3. strategic_intents — Strategic Intent
    await queryInterface.createTable('strategic_intents', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      signal_type: { type: Sequelize.STRING(30), allowNull: true },
      weight: { type: Sequelize.DECIMAL(3, 2), defaultValue: 1.00 },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // 4. monetization_angles — Monetization Angle
    await queryInterface.createTable('monetization_angles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      min_value_threshold: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // 5. maturity_phases — Maturity Phase
    await queryInterface.createTable('maturity_phases', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      typical_timeframe: { type: Sequelize.STRING(50), allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // 6. geographic_tags — Geographic Intelligence
    await queryInterface.createTable('geographic_tags', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      geo_type: { type: Sequelize.STRING(20), allowNull: true },
      parent_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'geographic_tags', key: 'id' } },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // 7. meta_signals — Meta AI Signals
    await queryInterface.createTable('meta_signals', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(50), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      keywords: { type: Sequelize.ARRAY(Sequelize.TEXT), defaultValue: [] },
      current_value: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      previous_value: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      trend_direction: { type: Sequelize.STRING(10), allowNull: true },
      computed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // 8. strategic_clusters — Strategic Clusters (auto-detected)
    await queryInterface.createTable('strategic_clusters', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      slug: { type: Sequelize.STRING(100), unique: true, allowNull: false },
      name: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      domain_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'ai_domains', key: 'id' } },
      capability_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'ai_capabilities', key: 'id' } },
      intent_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'strategic_intents', key: 'id' } },
      opportunity_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      avg_ai_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      growth_rate: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      trend_velocity: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      detected_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });
  },

  async down(queryInterface) {
    // Drop in reverse order due to foreign key dependencies
    await queryInterface.dropTable('strategic_clusters');
    await queryInterface.dropTable('meta_signals');
    await queryInterface.dropTable('geographic_tags');
    await queryInterface.dropTable('maturity_phases');
    await queryInterface.dropTable('monetization_angles');
    await queryInterface.dropTable('strategic_intents');
    await queryInterface.dropTable('ai_capabilities');
    await queryInterface.dropTable('ai_domains');
  },
};
