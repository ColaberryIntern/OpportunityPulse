'use strict';

// Submission Readiness Engine v0.3 — local vs global scope + AI-generation lineage.
//
// scope         : 'global' (default, current behavior) or 'bid'
// scope_id      : when scope='bid', the BonfireOpportunity UUID; null otherwise
// lineage_id    : UUID that pairs the LOCAL bid-scoped row with its GLOBAL
//                 version-history twin when AI generates a doc for a specific
//                 bid. Both rows share lineage_id; manual uploads leave it null.
// source        : 'manual' | 'ai_generated' | 'ai_promoted'
//                 — distinguishes vault history into uploads vs AI drafts so we
//                   can analyze + improve generation quality over time.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('documents', 'scope', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'global',
    });
    await queryInterface.addColumn('documents', 'scope_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('documents', 'lineage_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn('documents', 'source', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'manual',
    });
    await queryInterface.addIndex('documents', ['organization_id', 'scope', 'scope_id'], {
      name: 'idx_documents_org_scope',
    });
    await queryInterface.addIndex('documents', ['lineage_id'], {
      name: 'idx_documents_lineage',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('documents', 'idx_documents_org_scope');
    await queryInterface.removeIndex('documents', 'idx_documents_lineage');
    await queryInterface.removeColumn('documents', 'source');
    await queryInterface.removeColumn('documents', 'lineage_id');
    await queryInterface.removeColumn('documents', 'scope_id');
    await queryInterface.removeColumn('documents', 'scope');
  },
};
