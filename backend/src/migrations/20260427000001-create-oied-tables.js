'use strict';

// Opportunity Intelligence & Execution Department (OIED) tables.
// Three append-only-ish tables:
//   opportunity_fit_scores - cached deterministic scores per (opp, profile)
//   opportunity_outputs    - AI-generated proposals/offers/analyses awaiting review
//   opportunity_events     - audit log: viewed/clicked/generated/approved/rejected

module.exports = {
  async up(queryInterface, Sequelize) {
    // ---- opportunity_fit_scores -----------------------------------------
    await queryInterface.createTable('opportunity_fit_scores', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      // Profile is per-vendor — for now there's one (CQuvator) and we hash its
      // profile contents to detect changes. profile_hash null = global default.
      profile_hash: { type: Sequelize.STRING(64), allowNull: true },
      service_match: { type: Sequelize.INTEGER, allowNull: false },
      revenue_weight: { type: Sequelize.INTEGER, allowNull: false },
      automation_score: { type: Sequelize.INTEGER, allowNull: false },
      repeatability_score: { type: Sequelize.INTEGER, allowNull: false },
      ease_of_entry: { type: Sequelize.INTEGER, allowNull: false },
      strategic_alignment: { type: Sequelize.INTEGER, allowNull: false },
      fit_score: { type: Sequelize.INTEGER, allowNull: false },
      reasoning: { type: Sequelize.JSONB, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('opportunity_fit_scores', ['opportunity_id'], {
      name: 'idx_oied_fit_opp',
    });
    await queryInterface.addIndex('opportunity_fit_scores', ['fit_score'], {
      name: 'idx_oied_fit_score',
    });
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_oied_fit_unique
      ON opportunity_fit_scores (opportunity_id, COALESCE(profile_hash, ''));
    `);

    // ---- opportunity_outputs --------------------------------------------
    await queryInterface.createTable('opportunity_outputs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      content: { type: Sequelize.TEXT, allowNull: false },
      status: { type: Sequelize.STRING(20), defaultValue: 'draft', allowNull: false },
      generated_by: { type: Sequelize.INTEGER, allowNull: true }, // user id
      ai_model: { type: Sequelize.STRING(60), allowNull: true },
      reviewer_id: { type: Sequelize.INTEGER, allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      review_notes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('opportunity_outputs', ['opportunity_id'], {
      name: 'idx_oied_outputs_opp',
    });
    await queryInterface.addIndex('opportunity_outputs', ['status'], {
      name: 'idx_oied_outputs_status',
    });
    await queryInterface.addIndex('opportunity_outputs', ['type'], {
      name: 'idx_oied_outputs_type',
    });

    // ---- opportunity_events ---------------------------------------------
    await queryInterface.createTable('opportunity_events', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      event_type: { type: Sequelize.STRING(40), allowNull: false },
      user_id: { type: Sequelize.INTEGER, allowNull: true },
      payload: { type: Sequelize.JSONB, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });
    await queryInterface.addIndex('opportunity_events', ['opportunity_id'], {
      name: 'idx_oied_events_opp',
    });
    await queryInterface.addIndex('opportunity_events', ['event_type'], {
      name: 'idx_oied_events_type',
    });
    await queryInterface.addIndex('opportunity_events', ['created_at'], {
      name: 'idx_oied_events_time',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('opportunity_events');
    await queryInterface.dropTable('opportunity_outputs');
    await queryInterface.dropTable('opportunity_fit_scores');
  },
};
