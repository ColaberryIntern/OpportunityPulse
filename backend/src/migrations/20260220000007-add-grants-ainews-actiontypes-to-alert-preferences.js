'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('alert_preferences', 'grants', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    });

    await queryInterface.addColumn('alert_preferences', 'ai_news', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    });

    await queryInterface.addColumn('alert_preferences', 'preferred_action_types', {
      type: Sequelize.ARRAY(Sequelize.STRING(20)),
      defaultValue: ['BUILD', 'BID', 'APPLY', 'PARTNER', 'INVEST', 'TEACH'],
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('alert_preferences', 'preferred_action_types');
    await queryInterface.removeColumn('alert_preferences', 'ai_news');
    await queryInterface.removeColumn('alert_preferences', 'grants');
  },
};
