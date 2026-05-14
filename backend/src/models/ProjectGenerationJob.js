// Deep Research Intelligence Engine — a requirements-generation job: a
// venture idea handed to the AI Project Architect (Agent Foundry). Tracks
// phase + progress so the UI can poll (and a future build can switch to SSE).

module.exports = (sequelize) => {
  const { DataTypes } = require('sequelize');

  const ProjectGenerationJob = sequelize.define('ProjectGenerationJob', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ventureIdeaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venture_idea_id' },
    reportId: { type: DataTypes.INTEGER, allowNull: true, field: 'report_id' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued' },
    progressPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'progress_percent' },
    currentPhase: { type: DataTypes.STRING(80), allowNull: true, field: 'current_phase' },
    phases: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    projectSlug: { type: DataTypes.STRING(160), allowNull: true, field: 'project_slug' },
    architectUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'architect_url' },
    requirementsJson: { type: DataTypes.JSONB, allowNull: true, field: 'requirements_json' },
    error: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
  }, {
    tableName: 'project_generation_jobs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['venture_idea_id'] },
      { fields: ['status'] },
    ],
  });

  ProjectGenerationJob.associate = (models) => {
    ProjectGenerationJob.belongsTo(models.VentureIdea, {
      foreignKey: 'venture_idea_id',
      as: 'ventureIdea',
    });
  };

  return ProjectGenerationJob;
};
