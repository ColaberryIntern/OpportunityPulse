module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  // Strategic Curation Agent output. JSON shape contract for the four pillars
  // (enforced softly in the service layer; the column is JSONB for flex):
  //
  // money: {
  //   initial_bid_value_usd: integer,
  //   cluster_total_usd: integer | null,
  //   addressable_market_usd: integer,
  //   confidence: 'low' | 'medium' | 'high'
  // }
  //
  // roi: {
  //   investment_usd: integer,
  //   payback_months: integer,
  //   margin_pct: integer,
  //   confidence: 'low' | 'medium' | 'high'
  // }
  //
  // ai_system: {
  //   what_to_build: string,
  //   capabilities: string[],
  //   operator_role: string,
  //   build_effort_weeks: integer
  // }
  //
  // business_viability: {
  //   primary_buyer: string,
  //   secondary_markets: string[],
  //   pricing_model: string,
  //   gtm_strategy: string,
  //   moat: string
  // }
  const BonfireStrategicOpportunity = sequelize.define('BonfireStrategicOpportunity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING(500), allowNull: false },
    summary: { type: DataTypes.TEXT, allowNull: false },
    patternType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'pattern_type',
    },
    sourceOpportunityIds: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'source_opportunity_ids',
    },
    strategicScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'strategic_score',
    },
    money: { type: DataTypes.JSONB, allowNull: false },
    roi: { type: DataTypes.JSONB, allowNull: false },
    aiSystem: { type: DataTypes.JSONB, allowNull: false, field: 'ai_system' },
    businessViability: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'business_viability',
    },
    sourceHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'source_hash',
    },
    runId: { type: DataTypes.STRING(60), allowNull: false, field: 'run_id' },
    generatedForDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'generated_for_date',
    },
    aiModel: { type: DataTypes.STRING(60), allowNull: true, field: 'ai_model' },
    status: { type: DataTypes.STRING(20), defaultValue: 'new' },
    assignedTo: { type: DataTypes.UUID, allowNull: true, field: 'assigned_to' },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'bonfire_strategic_opportunities',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['run_id'] },
      { fields: ['generated_for_date'] },
      { fields: ['strategic_score'] },
      { fields: ['status'] },
    ],
  });

  return BonfireStrategicOpportunity;
};
