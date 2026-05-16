// Deep Research Phase 12 — governance integrity dashboard snapshot.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const GovernanceIntegrity = sequelize.define('GovernanceIntegrity', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    organizationId: { type: DataTypes.INTEGER, allowNull: true, field: 'organization_id' },
    integrityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'integrity_score' },
    tenantIsolationScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'tenant_isolation_score' },
    rbacScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'rbac_score' },
    provenanceScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'provenance_score' },
    observabilityScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'observability_score' },
    retentionScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'retention_score' },
    computedInputs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'computed_inputs' },
  }, { tableName: 'governance_integrity', timestamps: true, underscored: true, updatedAt: false });
  return GovernanceIntegrity;
};
