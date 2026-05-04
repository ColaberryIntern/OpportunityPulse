module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const OpportunityFitScore = sequelize.define('OpportunityFitScore', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    opportunityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'opportunity_id',
    },
    profileHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'profile_hash',
    },
    // v4: org scoping. profile_hash continues to identify the profile
    // contents; organization_id partitions the cache so two orgs with
    // the same hash by coincidence don't collide.
    organizationId: {
      type: DataTypes.INTEGER, allowNull: true, field: 'organization_id',
    },
    serviceMatch:        { type: DataTypes.INTEGER, allowNull: false, field: 'service_match' },
    revenueWeight:       { type: DataTypes.INTEGER, allowNull: false, field: 'revenue_weight' },
    automationScore:     { type: DataTypes.INTEGER, allowNull: false, field: 'automation_score' },
    repeatabilityScore:  { type: DataTypes.INTEGER, allowNull: false, field: 'repeatability_score' },
    easeOfEntry:         { type: DataTypes.INTEGER, allowNull: false, field: 'ease_of_entry' },
    strategicAlignment:  { type: DataTypes.INTEGER, allowNull: false, field: 'strategic_alignment' },
    fitScore:            { type: DataTypes.INTEGER, allowNull: false, field: 'fit_score' },
    priorityScore:       { type: DataTypes.INTEGER, allowNull: true,  field: 'priority_score' },
    // v3: cached effort score from effortEstimator.
    effortScore:         { type: DataTypes.INTEGER, allowNull: true,  field: 'effort_score' },
    reasoning:           { type: DataTypes.JSONB,   defaultValue: {} },
  }, {
    tableName: 'opportunity_fit_scores',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['opportunity_id'] },
      { fields: ['fit_score'] },
    ],
  });

  return OpportunityFitScore;
};
