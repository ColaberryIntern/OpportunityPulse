'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('saved_opportunities', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('saved_opportunities', {
      unique: true,
      fields: ['user_id', 'opportunity_id'],
      name: 'saved_opportunities_user_opportunity_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('saved_opportunities');
  },
};
