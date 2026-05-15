// Deep Research Phase 4 — detected venture patterns + reusable scaffolds.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const VentureTemplate = sequelize.define('VentureTemplate', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    templateKey: { type: DataTypes.STRING(60), allowNull: false, field: 'template_key' },
    label: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    mvpScaffold: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'mvp_scaffold' },
    gtmPlaybook: { type: DataTypes.JSONB, allowNull: false, defaultValue: {}, field: 'gtm_playbook' },
    applicableTo: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'applicable_to' },
  }, {
    tableName: 'venture_templates',
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ['template_key'] }],
  });
  return VentureTemplate;
};
