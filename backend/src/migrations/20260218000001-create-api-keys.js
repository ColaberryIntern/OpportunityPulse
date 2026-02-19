'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('api_keys', {
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
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      key_prefix: {
        type: Sequelize.STRING(12),
        allowNull: false,
      },
      key_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      scopes: {
        type: Sequelize.JSONB,
        defaultValue: ['read'],
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
    });

    await queryInterface.addIndex('api_keys', ['user_id']);
    await queryInterface.addIndex('api_keys', ['key_prefix']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('api_keys');
  },
};
