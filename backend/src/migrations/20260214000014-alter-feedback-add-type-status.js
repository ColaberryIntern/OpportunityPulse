'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('feedback', 'type', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'platform',
    });

    await queryInterface.addColumn('feedback', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    });

    await queryInterface.addColumn('feedback', 'target_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn('feedback', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: Sequelize.fn('NOW'),
    });

    await queryInterface.addIndex('feedback', ['type']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('feedback', ['type']);
    await queryInterface.removeColumn('feedback', 'updated_at');
    await queryInterface.removeColumn('feedback', 'target_id');
    await queryInterface.removeColumn('feedback', 'status');
    await queryInterface.removeColumn('feedback', 'type');
  },
};
