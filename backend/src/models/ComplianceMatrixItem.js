// Deep Research Phase 9 — per-requirement row inside a compliance matrix.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const ComplianceMatrixItem = sequelize.define('ComplianceMatrixItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    complianceMatrixId: { type: DataTypes.INTEGER, allowNull: false, field: 'compliance_matrix_id' },
    itemKind: { type: DataTypes.STRING(30), allowNull: false, field: 'item_kind' },
    label: { type: DataTypes.STRING(500), allowNull: false },
    requirementText: { type: DataTypes.TEXT, allowNull: true, field: 'requirement_text' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'missing' },
    satisfiedBy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'satisfied_by' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'normal' },
  }, {
    tableName: 'compliance_matrix_items', timestamps: true, underscored: true,
    indexes: [{ fields: ['compliance_matrix_id'] }, { fields: ['status'] }],
  });
  return ComplianceMatrixItem;
};
