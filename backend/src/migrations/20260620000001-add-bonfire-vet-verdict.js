'use strict';

// Adds bonfire_opportunities.vet_verdict (JSONB) to hold the disqualification
// verdict (BID / NO_BID / CONDITIONAL + reason) so the digest + app can show WHY
// a high-scoring row is dead. See disqualification.service.js + the directive.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bonfire_opportunities', 'vet_verdict', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('bonfire_opportunities', 'vet_verdict');
  },
};
