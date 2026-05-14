// Deep Research Intelligence Engine — projectArchitectBridge.service tests.
// NODE_ENV=test makes the per-phase delay 0, so the phase walker runs fast.

jest.mock('../../src/models', () => ({
  VentureIdea: { findByPk: jest.fn() },
  ProjectGenerationJob: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));

const { VentureIdea, ProjectGenerationJob } = require('../../src/models');
const svc = require('../../src/deepResearch/projectArchitectBridge.service');

// A fake Sequelize-ish row whose .update() mutates in place + records calls.
function fakeRow(initial) {
  const row = { ...initial };
  row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
  return row;
}

beforeEach(() => {
  VentureIdea.findByPk.mockReset();
  ProjectGenerationJob.findByPk.mockReset();
  ProjectGenerationJob.findOne.mockReset();
  ProjectGenerationJob.create.mockReset();
});

describe('projectArchitectBridge.slugify', () => {
  it('produces a kebab-case slug', () => {
    expect(svc.slugify('Memory SDK for Agents!')).toBe('memory-sdk-for-agents');
  });
  it('falls back to "venture" for empty input', () => {
    expect(svc.slugify('')).toBe('venture');
    expect(svc.slugify('   ')).toBe('venture');
  });
});

describe('projectArchitectBridge.scaffoldPhases', () => {
  it('returns every phase pending', () => {
    const phases = svc.scaffoldPhases();
    expect(phases).toHaveLength(svc.PHASES.length);
    expect(phases.every((p) => p.status === 'pending')).toBe(true);
  });
});

describe('projectArchitectBridge.createJob', () => {
  it('rejects a missing / invalid ventureIdeaId', async () => {
    await expect(svc.createJob({ ventureIdeaId: 0 })).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(svc.createJob({ ventureIdeaId: 'abc' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('rejects when the venture idea does not exist', async () => {
    VentureIdea.findByPk.mockResolvedValue(null);
    await expect(svc.createJob({ ventureIdeaId: 99 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns the existing active job instead of creating a duplicate (idempotency)', async () => {
    VentureIdea.findByPk.mockResolvedValue(fakeRow({ id: 5, reportId: 1, title: 'X' }));
    const existing = fakeRow({ id: 42, ventureIdeaId: 5, status: 'running' });
    ProjectGenerationJob.findOne.mockResolvedValue(existing);
    const job = await svc.createJob({ ventureIdeaId: 5 });
    expect(job.id).toBe(42);
    expect(ProjectGenerationJob.create).not.toHaveBeenCalled();
  });

  it('creates a queued job and kicks off processing', async () => {
    VentureIdea.findByPk.mockResolvedValue(fakeRow({ id: 5, reportId: 1, title: 'Memory SDK' }));
    ProjectGenerationJob.findOne.mockResolvedValue(null);
    const created = fakeRow({ id: 7, ventureIdeaId: 5, status: 'queued' });
    ProjectGenerationJob.create.mockResolvedValue(created);
    // processJob (fired async) will re-fetch the job — return the same row.
    ProjectGenerationJob.findByPk.mockResolvedValue(created);
    const job = await svc.createJob({ ventureIdeaId: 5 });
    expect(job.id).toBe(7);
    expect(ProjectGenerationJob.create).toHaveBeenCalledTimes(1);
    expect(ProjectGenerationJob.create.mock.calls[0][0].status).toBe('queued');
  });
});

describe('projectArchitectBridge.processJob', () => {
  it('walks all phases to success and produces a requirements scaffold', async () => {
    const job = fakeRow({
      id: 7, ventureIdeaId: 5, reportId: 1, status: 'queued', progressPercent: 0,
    });
    ProjectGenerationJob.findByPk.mockResolvedValue(job);
    VentureIdea.findByPk.mockResolvedValue(fakeRow({
      id: 5, title: 'Memory SDK', description: 'A memory layer', mvpScope: 'one quarter',
      metadata: { suggested_architecture: 'wrap vector store', target_customers: 'gov IT' },
    }));
    await svc.processJob(7);
    expect(job.status).toBe('success');
    expect(job.progressPercent).toBe(100);
    expect(job.projectSlug).toBe('memory-sdk');
    expect(job.architectUrl).toBe('/agent-foundry/projects/memory-sdk');
    expect(job.requirementsJson.project_name).toBe('Memory SDK');
    expect(Array.isArray(job.requirementsJson.functional_requirements)).toBe(true);
    expect(job.phases.every((p) => p.status === 'completed')).toBe(true);
  });

  it('marks the job failed when the venture idea is gone', async () => {
    const job = fakeRow({ id: 8, ventureIdeaId: 999, status: 'queued' });
    ProjectGenerationJob.findByPk.mockResolvedValue(job);
    VentureIdea.findByPk.mockResolvedValue(null);
    await svc.processJob(8);
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/not found/);
  });

  it('is an idempotent no-op for an already-successful job', async () => {
    const job = fakeRow({ id: 9, ventureIdeaId: 5, status: 'success' });
    ProjectGenerationJob.findByPk.mockResolvedValue(job);
    await svc.processJob(9);
    expect(job.update).not.toHaveBeenCalled();
  });
});

describe('projectArchitectBridge.getJobStatus', () => {
  it('returns the job status shape', async () => {
    ProjectGenerationJob.findByPk.mockResolvedValue(fakeRow({
      id: 7, ventureIdeaId: 5, reportId: 1, status: 'running', progressPercent: 40,
      currentPhase: 'Drafting product requirements', phases: [], projectSlug: null,
      architectUrl: null, requirementsJson: null, error: null, startedAt: new Date(), completedAt: null,
    }));
    const status = await svc.getJobStatus(7);
    expect(status.id).toBe(7);
    expect(status.status).toBe('running');
    expect(status.progress_percent).toBe(40);
  });

  it('throws NOT_FOUND for a missing job', async () => {
    ProjectGenerationJob.findByPk.mockResolvedValue(null);
    await expect(svc.getJobStatus(123)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
