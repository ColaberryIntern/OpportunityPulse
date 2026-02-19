'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('opportunities', 'action_type', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    await queryInterface.addColumn('opportunities', 'saturation_index', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    });

    await queryInterface.addColumn('opportunities', 'opportunity_quadrant', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await queryInterface.addIndex('opportunities', ['action_type'], {
      name: 'idx_opportunities_action_type',
    });

    await queryInterface.addIndex('opportunities', ['saturation_index'], {
      name: 'idx_opportunities_saturation_index',
    });

    await queryInterface.addIndex('opportunities', ['opportunity_quadrant'], {
      name: 'idx_opportunities_opportunity_quadrant',
    });

    await queryInterface.addIndex('opportunities', ['status', 'action_type', 'opportunity_quadrant', 'ai_score'], {
      name: 'idx_opportunities_executive_brief',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('opportunities', 'idx_opportunities_executive_brief');
    await queryInterface.removeIndex('opportunities', 'idx_opportunities_opportunity_quadrant');
    await queryInterface.removeIndex('opportunities', 'idx_opportunities_saturation_index');
    await queryInterface.removeIndex('opportunities', 'idx_opportunities_action_type');
    await queryInterface.removeColumn('opportunities', 'opportunity_quadrant');
    await queryInterface.removeColumn('opportunities', 'saturation_index');
    await queryInterface.removeColumn('opportunities', 'action_type');
  },
};
