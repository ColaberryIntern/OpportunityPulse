'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Central mapping table: one classification row per opportunity
    await queryInterface.createTable('opportunity_classifications', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      domain_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'ai_domains', key: 'id' },
      },
      capability_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'ai_capabilities', key: 'id' },
      },
      strategic_intent_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'strategic_intents', key: 'id' },
      },
      monetization_angle_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'monetization_angles', key: 'id' },
      },
      maturity_phase_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'maturity_phases', key: 'id' },
      },
      geographic_tag_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'geographic_tags', key: 'id' },
      },
      meta_signal_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'meta_signals', key: 'id' },
      },
      cluster_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'strategic_clusters', key: 'id' },
      },
      domain_confidence: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      capability_confidence: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      demand_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      competition_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      saturation_index: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      classified_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // Indexes for opportunity_classifications
    await queryInterface.addIndex('opportunity_classifications', ['opportunity_id'], { name: 'idx_oc_opportunity_id' });
    await queryInterface.addIndex('opportunity_classifications', ['domain_id'], { name: 'idx_oc_domain_id' });
    await queryInterface.addIndex('opportunity_classifications', ['capability_id'], { name: 'idx_oc_capability_id' });
    await queryInterface.addIndex('opportunity_classifications', ['strategic_intent_id'], { name: 'idx_oc_intent_id' });
    await queryInterface.addIndex('opportunity_classifications', ['monetization_angle_id'], { name: 'idx_oc_monetization_id' });
    await queryInterface.addIndex('opportunity_classifications', ['maturity_phase_id'], { name: 'idx_oc_maturity_id' });
    await queryInterface.addIndex('opportunity_classifications', ['geographic_tag_id'], { name: 'idx_oc_geo_id' });
    await queryInterface.addIndex('opportunity_classifications', ['cluster_id'], { name: 'idx_oc_cluster_id' });
    await queryInterface.addIndex('opportunity_classifications', ['demand_score'], { name: 'idx_oc_demand_score' });
    await queryInterface.addIndex('opportunity_classifications', ['saturation_index'], { name: 'idx_oc_saturation' });

    // Junction table for multi-tag support (multiple domains/capabilities/geo per opportunity)
    await queryInterface.createTable('opportunity_multi_tags', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      dimension: { type: Sequelize.STRING(30), allowNull: false },
      dimension_value_id: { type: Sequelize.INTEGER, allowNull: false },
      confidence: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('opportunity_multi_tags', ['opportunity_id'], { name: 'idx_omt_opp' });
    await queryInterface.addIndex('opportunity_multi_tags', ['dimension', 'dimension_value_id'], { name: 'idx_omt_dimension' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('opportunity_multi_tags');
    await queryInterface.dropTable('opportunity_classifications');
  },
};
