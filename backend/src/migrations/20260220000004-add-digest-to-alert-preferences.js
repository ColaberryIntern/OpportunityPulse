'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('alert_preferences', 'digest_frequency', {
      type: Sequelize.STRING(10),
      defaultValue: 'weekly',
      allowNull: false,
    });

    await queryInterface.addColumn('alert_preferences', 'last_digest_sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('alert_preferences', 'last_digest_sent_at');
    await queryInterface.removeColumn('alert_preferences', 'digest_frequency');
  },
};
