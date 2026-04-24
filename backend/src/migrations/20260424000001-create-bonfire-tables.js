'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // bonfire_opportunities
    await queryInterface.createTable('bonfire_opportunities', {
      // UUID generated at the ORM layer via DataTypes.UUIDV4 — no DB extension required.
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
      },
      title: { type: Sequelize.STRING(500), allowNull: false },
      agency: { type: Sequelize.STRING(300), allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      category_raw: { type: Sequelize.STRING(200), allowNull: true },
      ai_category: { type: Sequelize.STRING(50), allowNull: true },
      fit_score: { type: Sequelize.INTEGER, allowNull: true },
      priority_score: { type: Sequelize.INTEGER, allowNull: true },
      automation_potential: { type: Sequelize.INTEGER, allowNull: true },
      revenue_weight: { type: Sequelize.INTEGER, allowNull: true },
      repeatability: { type: Sequelize.INTEGER, allowNull: true },
      ease_of_entry: { type: Sequelize.INTEGER, allowNull: true },
      estimated_value: { type: Sequelize.BIGINT, allowNull: true },
      recommended_product: { type: Sequelize.STRING(100), allowNull: true },
      signals: { type: Sequelize.JSONB, defaultValue: [] },
      close_date: { type: Sequelize.DATE, allowNull: true },
      source_url: { type: Sequelize.TEXT, allowNull: true },
      raw_text: { type: Sequelize.TEXT, allowNull: true },
      strategy: { type: Sequelize.JSONB, allowNull: true },
      enriched_at: { type: Sequelize.DATE, allowNull: true },
      enrichment_version: { type: Sequelize.INTEGER, defaultValue: 1 },
      enrichment_hash: { type: Sequelize.STRING(64), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('bonfire_opportunities', ['ai_category'], {
      name: 'idx_bonfire_opps_ai_category',
    });
    await queryInterface.addIndex('bonfire_opportunities', ['priority_score'], {
      name: 'idx_bonfire_opps_priority',
    });
    await queryInterface.addIndex('bonfire_opportunities', ['close_date'], {
      name: 'idx_bonfire_opps_close_date',
    });
    await queryInterface.addIndex('bonfire_opportunities', ['enriched_at'], {
      name: 'idx_bonfire_opps_enriched_at',
    });

    // bonfire_opportunity_tags
    await queryInterface.createTable('bonfire_opportunity_tags', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      opportunity_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'bonfire_opportunities', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      tag: { type: Sequelize.STRING(100), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('bonfire_opportunity_tags', ['opportunity_id', 'tag'], {
      unique: true,
      name: 'idx_bonfire_tags_unique',
    });

    // bonfire_pipeline (stub)
    await queryInterface.createTable('bonfire_pipeline', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      opportunity_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'bonfire_opportunities', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: { type: Sequelize.STRING(30), defaultValue: 'new' },
      assigned_to: { type: Sequelize.UUID, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('bonfire_pipeline', ['opportunity_id'], {
      name: 'idx_bonfire_pipeline_opp',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('bonfire_pipeline', 'idx_bonfire_pipeline_opp').catch(() => {});
    await queryInterface.dropTable('bonfire_pipeline');

    await queryInterface.removeIndex('bonfire_opportunity_tags', 'idx_bonfire_tags_unique').catch(() => {});
    await queryInterface.dropTable('bonfire_opportunity_tags');

    await queryInterface.removeIndex('bonfire_opportunities', 'idx_bonfire_opps_enriched_at').catch(() => {});
    await queryInterface.removeIndex('bonfire_opportunities', 'idx_bonfire_opps_close_date').catch(() => {});
    await queryInterface.removeIndex('bonfire_opportunities', 'idx_bonfire_opps_priority').catch(() => {});
    await queryInterface.removeIndex('bonfire_opportunities', 'idx_bonfire_opps_ai_category').catch(() => {});
    await queryInterface.dropTable('bonfire_opportunities');
  },
};
