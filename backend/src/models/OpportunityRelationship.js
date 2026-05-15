// Deep Research Phase 7 — recurring relationships across opportunities
// (agencies / technologies / vendors / NAICS / keywords / ecosystems).
//
// Computed deterministically from Opportunity fields. Append-only history is
// out of scope here — this is the latest aggregate snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const OpportunityRelationship = sequelize.define('OpportunityRelationship', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    relationshipType: { type: DataTypes.STRING(30), allowNull: false, field: 'relationship_type' },
    value: { type: DataTypes.STRING(300), allowNull: false },
    occurrenceCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'occurrence_count' },
    firstSeenAt: { type: DataTypes.DATE, allowNull: true, field: 'first_seen_at' },
    lastSeenAt: { type: DataTypes.DATE, allowNull: true, field: 'last_seen_at' },
    opportunityIds: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'opportunity_ids' },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    computedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'computed_at' },
  }, {
    tableName: 'opportunity_relationships', timestamps: false, underscored: true,
    indexes: [
      { fields: ['relationship_type', 'occurrence_count'] },
      { fields: ['relationship_type', 'value'] },
    ],
  });
  return OpportunityRelationship;
};
