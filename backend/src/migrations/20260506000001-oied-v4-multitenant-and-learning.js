'use strict';

// OIED v4 — Multi-tenant Readiness + Learning Engine schema.
//
//  - organizations table (seeded with default org id=1).
//  - users.organization_id (backfilled).
//  - user_profiles → organization_profiles (renamed + re-keyed on org).
//  - opportunity_fit_scores.organization_id (backfilled to 1).
//  - bundles.organization_id (backfilled to 1).
//  - win_probability_history (new — every recommendation snapshot).
//  - trigger_logs (new — every auto-execution attempt).
//
// All non-destructive: existing rows backfill to org 1; user_profiles
// rename keeps the user_id column for audit.

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. organizations table.
    await queryInterface.createTable('organizations', {
      id:         { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name:       { type: Sequelize.STRING(200), allowNull: false },
      slug:       { type: Sequelize.STRING(80),  allowNull: false, unique: true },
      settings:   { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    // Seed the default org for the existing admin tenant.
    await queryInterface.bulkInsert('organizations', [{
      id: 1,
      name: 'Colaberry / CQuvator',
      slug: 'default',
      settings: '{}',
      created_at: new Date(),
      updated_at: new Date(),
    }]);
    // Bump sequence so future inserts don't collide with id=1.
    await queryInterface.sequelize.query(
      `SELECT setval(pg_get_serial_sequence('organizations','id'), 1, true);`
    );

    // 2. users.organization_id (nullable for backfill safety).
    await queryInterface.addColumn('users', 'organization_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
    });
    await queryInterface.sequelize.query(
      `UPDATE users SET organization_id = 1 WHERE organization_id IS NULL;`
    );

    // 3. user_profiles → organization_profiles. Rename, then add org_id,
    //    backfill from users, swap the unique index from user_id → org_id.
    await queryInterface.renameTable('user_profiles', 'organization_profiles');
    await queryInterface.addColumn('organization_profiles', 'organization_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
    });
    await queryInterface.sequelize.query(`
      UPDATE organization_profiles op
      SET organization_id = u.organization_id
      FROM users u WHERE op.user_id = u.id AND op.organization_id IS NULL;
    `);
    // Drop the legacy user_id unique index (best-effort — different envs
    // generated different names) and add the org-scoped unique.
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS user_profiles_user_id;`
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS organization_profiles_user_id;`
    );
    await queryInterface.addIndex(
      'organization_profiles',
      ['organization_id'],
      { unique: true, name: 'idx_org_profiles_org_id' }
    );

    // 4. opportunity_fit_scores.organization_id — scope cache by org.
    await queryInterface.addColumn('opportunity_fit_scores', 'organization_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
    });
    await queryInterface.sequelize.query(
      `UPDATE opportunity_fit_scores SET organization_id = 1 WHERE organization_id IS NULL;`
    );
    await queryInterface.addIndex(
      'opportunity_fit_scores',
      ['organization_id', 'opportunity_id', 'profile_hash'],
      { name: 'idx_fit_scores_org_opp_hash' }
    );

    // 5. bundles.organization_id.
    await queryInterface.addColumn('bundles', 'organization_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
    });
    await queryInterface.sequelize.query(
      `UPDATE bundles SET organization_id = 1 WHERE organization_id IS NULL;`
    );
    await queryInterface.addIndex(
      'bundles',
      ['organization_id'],
      { name: 'idx_bundles_org_id' }
    );

    // 6. win_probability_history.
    await queryInterface.createTable('win_probability_history', {
      id:                 { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id:    {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'organizations', key: 'id' },
      },
      opportunity_id:     { type: Sequelize.INTEGER, allowNull: false },
      win_probability:    { type: Sequelize.DECIMAL(4, 3), allowNull: false },
      components:         { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at:         { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex(
      'win_probability_history',
      ['organization_id', 'opportunity_id', 'created_at'],
      { name: 'idx_winprob_org_opp_at' }
    );

    // 7. trigger_logs.
    await queryInterface.createTable('trigger_logs', {
      id:                 { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
      organization_id:    {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'organizations', key: 'id' },
      },
      rule_name:          { type: Sequelize.STRING(80),  allowNull: false },
      target_type:        { type: Sequelize.STRING(40),  allowNull: false },
      target_id:          { type: Sequelize.INTEGER,     allowNull: false },
      action:             { type: Sequelize.STRING(40),  allowNull: false },
      status:             { type: Sequelize.STRING(20),  allowNull: false },
      reason:             { type: Sequelize.TEXT,        allowNull: true },
      output_id:          { type: Sequelize.INTEGER,     allowNull: true },
      created_at:         { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex(
      'trigger_logs',
      ['organization_id', 'rule_name', 'created_at'],
      { name: 'idx_trigger_logs_org_rule_at' }
    );
    await queryInterface.addIndex(
      'trigger_logs',
      ['target_type', 'target_id'],
      { name: 'idx_trigger_logs_target' }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trigger_logs');
    await queryInterface.dropTable('win_probability_history');

    await queryInterface.removeIndex('bundles', 'idx_bundles_org_id');
    await queryInterface.removeColumn('bundles', 'organization_id');

    await queryInterface.removeIndex('opportunity_fit_scores', 'idx_fit_scores_org_opp_hash');
    await queryInterface.removeColumn('opportunity_fit_scores', 'organization_id');

    await queryInterface.removeIndex('organization_profiles', 'idx_org_profiles_org_id');
    await queryInterface.removeColumn('organization_profiles', 'organization_id');
    await queryInterface.renameTable('organization_profiles', 'user_profiles');

    await queryInterface.removeColumn('users', 'organization_id');
    await queryInterface.dropTable('organizations');
  },
};
