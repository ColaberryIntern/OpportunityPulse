module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // Append-only audit log. No updatedAt — events don't mutate.
  const OpportunityEvent = sequelize.define('OpportunityEvent', {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'opportunity_id',
    },
    eventType: {
      type: DataTypes.STRING(40),
      allowNull: false,
      field: 'event_type',
      validate: {
        // v3: + submitted, response_received, won, lost (conversion tracking).
        isIn: [[
          'viewed', 'clicked', 'generated', 'approved', 'rejected', 'edited',
          'submitted', 'response_received', 'won', 'lost',
        ]],
      },
    },
    userId:  { type: DataTypes.INTEGER, allowNull: true, field: 'user_id' },
    payload: { type: DataTypes.JSONB, defaultValue: {} },
  }, {
    tableName: 'opportunity_events',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ['opportunity_id'] },
      { fields: ['event_type'] },
      { fields: ['created_at'] },
    ],
  });

  return OpportunityEvent;
};
