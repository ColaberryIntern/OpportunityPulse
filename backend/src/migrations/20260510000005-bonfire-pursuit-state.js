'use strict';

// Submission Readiness Engine v0.8 — pursuit state machine on bonfire opps.
//
// Adds an explicit "do we actually want to bid on this?" gate. Until the
// user clicks "Pursue this bid," readiness is not computed — because a
// generic 67% baseline is worse than no number at all.
//
// State: none → pursuing → (declined | submitted)
// pursued_at: stamped on transition into 'pursuing'
// pursued_by: user id of whoever clicked Pursue (audit trail)

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bonfire_opportunities', 'pursuit_status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'none',
    });
    await queryInterface.addColumn('bonfire_opportunities', 'pursued_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('bonfire_opportunities', 'pursued_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    });
    await queryInterface.addIndex('bonfire_opportunities', ['pursuit_status'], {
      name: 'idx_bonfire_opps_pursuit_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('bonfire_opportunities', 'idx_bonfire_opps_pursuit_status');
    await queryInterface.removeColumn('bonfire_opportunities', 'pursued_by');
    await queryInterface.removeColumn('bonfire_opportunities', 'pursued_at');
    await queryInterface.removeColumn('bonfire_opportunities', 'pursuit_status');
  },
};
