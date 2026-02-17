'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('content', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.TEXT),
        defaultValue: [],
      },
      status: {
        type: Sequelize.STRING(20),
        defaultValue: 'draft',
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('content', ['category']);
    await queryInterface.addIndex('content', ['user_id']);
    await queryInterface.addIndex('content', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('content');
  },
};
