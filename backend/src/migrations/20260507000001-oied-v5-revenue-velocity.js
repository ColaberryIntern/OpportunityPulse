'use strict';

// OIED v5 — Revenue Velocity System schema:
//   - organizations.plan_tier (basic | pro | enterprise; default basic).
//   - usage_metrics: append-only event log of billable actions.
//   - execution_plans: one row per bundle with a build plan derived
//     from the blueprint.
//
// All non-destructive: new column has a default; new tables are empty
// until services start writing.

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Plan tier on organizations.
    await queryInterface.addColumn('organizations', 'plan_tier', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'basic',
    });

    // 2. usage_metrics — append-only.
    await queryInterface.createTable('usage_metrics', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'organizations', key: 'id' },
      },
      metric_name: { type: Sequelize.STRING(60), allowNull: false },
      count:       { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      metadata:    { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at:  { type: Sequelize.DATE, allowNull: false,
                     defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex(
      'usage_metrics',
      ['organization_id', 'metric_name', 'created_at'],
      { name: 'idx_usage_metrics_org_metric_at' },
    );

    // 3. execution_plans — one row per bundle.
    await queryInterface.createTable('execution_plans', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      bundle_id: {
        type: Sequelize.INTEGER, allowNull: false, unique: true,
        references: { model: 'bundles', key: 'id' },
      },
      organization_id: {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'organizations', key: 'id' },
      },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'draft' },
      // status: draft | in_progress | completed | cancelled
      tasks:           { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      timeline:        { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      assigned_agents: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      started_at:      { type: Sequelize.DATE, allowNull: true },
      completed_at:    { type: Sequelize.DATE, allowNull: true },
      created_at:      { type: Sequelize.DATE, allowNull: false,
                         defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at:      { type: Sequelize.DATE, allowNull: false,
                         defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex(
      'execution_plans',
      ['organization_id', 'status'],
      { name: 'idx_execution_plans_org_status' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('execution_plans');
    await queryInterface.removeIndex('usage_metrics', 'idx_usage_metrics_org_metric_at');
    await queryInterface.dropTable('usage_metrics');
    await queryInterface.removeColumn('organizations', 'plan_tier');
  },
};
