module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // One row per tenant. v4 ships with one seeded row (id=1, "Colaberry /
  // CQuvator"). Multi-tenant readiness: all org-scoped data carries an
  // organization_id so a second org can be inserted without code changes.
  const Organization = sequelize.define('Organization', {
    id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:     { type: DataTypes.STRING(200), allowNull: false },
    slug:     { type: DataTypes.STRING(80),  allowNull: false, unique: true },
    settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, {
    tableName: 'organizations',
    timestamps: true,
    underscored: true,
  });

  return Organization;
};
