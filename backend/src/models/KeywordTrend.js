// OIED v9.7 — persisted, validated keyword trend snapshot.
// Computed by oied/keywordTrendCompute.service.js on a twice-daily cron.
// Each row is one keyword that survived the validation gate.

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');
  const KeywordTrend = sequelize.define('KeywordTrend', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    word: {
      type: DataTypes.STRING(120),
      allowNull: false,
      unique: true,
    },
    displayWord: { type: DataTypes.STRING(120), field: 'display_word' },
    matchCount:    { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'match_count' },
    toolCount:     { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'tool_count' },
    totalMentions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_mentions' },
    channelCounts: { type: DataTypes.JSONB,   allowNull: false, defaultValue: {}, field: 'channel_counts' },
    sentimentScore: { type: DataTypes.DECIMAL(3, 2), field: 'sentiment_score' },
    sentimentLabel: { type: DataTypes.STRING(20), field: 'sentiment_label' },
    avgAgeDays:     { type: DataTypes.DECIMAL(4, 1), field: 'avg_age_days' },
    isIndustry:     { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_industry' },
    trendVelocity:  { type: DataTypes.DECIMAL(5, 2), field: 'trend_velocity' },
    runId: {
      type: DataTypes.STRING(60),
      allowNull: false,
      field: 'run_id',
    },
    lastComputedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'last_computed_at',
    },
  }, {
    tableName: 'keyword_trends',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['word'] },
      { fields: ['is_industry'] },
      { fields: ['match_count'] },
      { fields: ['last_computed_at'] },
    ],
  });
  return KeywordTrend;
};
