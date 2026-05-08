'use strict';

// Submission Readiness Engine — Phase 1: evergreen document vault.
// One row per uploaded document, scoped to an organization. Local disk
// storage in v0.1; storage.adapter.js abstracts the path so a later v2
// can swap to S3 without touching the schema.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('documents', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'organizations', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      file_path: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      mime: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      size_bytes: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      uploaded_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('documents', ['organization_id', 'type', 'is_active'], {
      name: 'idx_documents_org_type_active',
    });
    await queryInterface.addIndex('documents', ['expires_at'], {
      name: 'idx_documents_expires_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('documents', 'idx_documents_org_type_active');
    await queryInterface.removeIndex('documents', 'idx_documents_expires_at');
    await queryInterface.dropTable('documents');
  },
};
