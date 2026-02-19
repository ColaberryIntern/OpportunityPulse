'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('opportunity_actions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunities', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      action_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'planned',
      },
      revenue_generated: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('opportunity_actions', ['opportunity_id', 'user_id'], {
      unique: true,
      name: 'idx_opportunity_actions_unique',
    });

    await queryInterface.addIndex('opportunity_actions', ['user_id', 'status'], {
      name: 'idx_opportunity_actions_user_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('opportunity_actions');
  },
};
