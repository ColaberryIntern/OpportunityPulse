'use strict';

// OIED v6 — Autonomous + Monetization Layer schema:
//   - trigger_logs.confidence_score : populated by the auto_submit
//     rule so the audit log shows why a high-confidence row fired.
//   - opportunity_events idx        : speeds the velocity service's
//     per-opportunity event walk.
//
// All non-destructive: the column is nullable (older trigger rows
// have no confidence number); the index is purely a query speedup.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('trigger_logs', 'confidence_score', {
      type: Sequelize.DECIMAL(4, 3),
      allowNull: true,
    });
    await queryInterface.addIndex(
      'trigger_logs',
      ['rule_name', 'confidence_score'],
      { name: 'idx_trigger_logs_rule_confidence' },
    );

    await queryInterface.addIndex(
      'opportunity_events',
      ['opportunity_id', 'event_type', 'created_at'],
      { name: 'idx_events_velocity' },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('opportunity_events', 'idx_events_velocity');
    await queryInterface.removeIndex('trigger_logs', 'idx_trigger_logs_rule_confidence');
    await queryInterface.removeColumn('trigger_logs', 'confidence_score');
  },
};
