module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // Stub model for future pipeline tracking. Not wired to UI/routes yet.
  const BonfirePipeline = sequelize.define('BonfirePipeline', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    opportunityId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'opportunity_id',
      references: { model: 'bonfire_opportunities', key: 'id' },
      onDelete: 'CASCADE',
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'new',
    },
    // Not FK'd to users.id on purpose — keeps Bonfire standalone so it can be
    // lifted to a separate deployment (enterprise.colaberry.ai) without cross-refs.
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_to',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    tableName: 'bonfire_pipeline',
    timestamps: true,
    underscored: true,
  });

  BonfirePipeline.associate = (models) => {
    BonfirePipeline.belongsTo(models.BonfireOpportunity, {
      foreignKey: 'opportunity_id',
      as: 'opportunity',
    });
  };

  return BonfirePipeline;
};
