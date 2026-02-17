'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      company: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      interests: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      email_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      verification_token: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      role_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 2,
        references: {
          model: 'user_roles',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
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

    await queryInterface.addIndex('users', ['email'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
