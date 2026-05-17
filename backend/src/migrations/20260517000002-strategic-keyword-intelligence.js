'use strict';

// Strategic Intelligence Overlay — extends keyword_trends additively with
// 12 strategic-scoring columns. Backward-compatible: defaults preserve the
// existing read path, and the existing match_count / sentiment / channel
// columns remain authoritative for the legacy descriptive cloud.

module.exports = {
  async up(qi, Sequelize) {
    const { DataTypes } = Sequelize;
    const desc = await qi.describeTable('keyword_trends');

    const adds = [
      ['strategic_score',          { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['commercialization_score',  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['procurement_score',        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['modernization_score',      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['operational_pain_score',   { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['venture_score',            { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['research_velocity_score',  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['convergence_score',        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
      ['strategic_tags',           { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }],
      ['strategic_category',       { type: DataTypes.STRING(64), allowNull: true }],
      ['strategic_priority',       { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'standard' }],
      ['commercialization_stage',  { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unknown' }],
    ];

    for (const [name, attrs] of adds) {
      if (!desc[name]) {
        // eslint-disable-next-line no-await-in-loop
        await qi.addColumn('keyword_trends', name, attrs);
      }
    }
    // Index high-value columns for the new mode queries.
    try { await qi.addIndex('keyword_trends', ['strategic_score'], { name: 'kwt_strategic_score_idx' }); }
    catch (e) { /* already exists */ }
    try { await qi.addIndex('keyword_trends', ['commercialization_score'], { name: 'kwt_commercialization_score_idx' }); }
    catch (e) { /* already exists */ }
    try { await qi.addIndex('keyword_trends', ['strategic_priority'], { name: 'kwt_strategic_priority_idx' }); }
    catch (e) { /* already exists */ }
  },

  async down(qi) {
    for (const name of [
      'strategic_score', 'commercialization_score', 'procurement_score',
      'modernization_score', 'operational_pain_score', 'venture_score',
      'research_velocity_score', 'convergence_score',
      'strategic_tags', 'strategic_category', 'strategic_priority',
      'commercialization_stage',
    ]) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await qi.removeColumn('keyword_trends', name);
      } catch (e) { /* */ }
    }
  },
};
