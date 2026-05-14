// Research Intelligence Phase 2.4 — research.scheduler tick-loop tests.
// Tests the "what's due" logic with a mocked DataSource model + runIngestion.

jest.mock('../../src/models', () => ({
  DataSource: { findAll: jest.fn() },
}));
jest.mock('../../src/ingestion/ingestion.service', () => ({
  runIngestion: jest.fn(async () => ({ recordsCreated: 3, recordsUpdated: 1 })),
}));

const { DataSource } = require('../../src/models');
const ingestion = require('../../src/ingestion/ingestion.service');
const { runDueSources } = require('../../src/ingestion/research.scheduler');

const MIN = 60000;

beforeEach(() => {
  DataSource.findAll.mockReset();
  ingestion.runIngestion.mockClear();
});

describe('research.scheduler.runDueSources', () => {
  it('runs a source whose last_run_at is older than its interval', async () => {
    DataSource.findAll.mockResolvedValue([
      { name: 'arxiv', ingestIntervalMinutes: 120, lastRunAt: new Date(Date.now() - 130 * MIN) },
    ]);
    const out = await runDueSources();
    expect(out.ran).toBe(1);
    expect(ingestion.runIngestion).toHaveBeenCalledWith('arxiv');
  });

  it('skips a source still within its interval', async () => {
    DataSource.findAll.mockResolvedValue([
      { name: 'arxiv', ingestIntervalMinutes: 120, lastRunAt: new Date(Date.now() - 30 * MIN) },
    ]);
    const out = await runDueSources();
    expect(out.ran).toBe(0);
    expect(ingestion.runIngestion).not.toHaveBeenCalled();
  });

  it('runs a source that has never run (null last_run_at)', async () => {
    DataSource.findAll.mockResolvedValue([
      { name: 'huggingface_papers', ingestIntervalMinutes: 360, lastRunAt: null },
    ]);
    const out = await runDueSources();
    expect(out.ran).toBe(1);
  });

  it('one source failing does not block the others', async () => {
    DataSource.findAll.mockResolvedValue([
      { name: 'arxiv', ingestIntervalMinutes: 120, lastRunAt: null },
      { name: 'huggingface_papers', ingestIntervalMinutes: 360, lastRunAt: null },
    ]);
    ingestion.runIngestion
      .mockRejectedValueOnce(new Error('arxiv upstream down'))
      .mockResolvedValueOnce({ recordsCreated: 5, recordsUpdated: 0 });
    const out = await runDueSources();
    expect(out.checked).toBe(2);
    expect(out.ran).toBe(1); // hf succeeded, arxiv threw
    expect(ingestion.runIngestion).toHaveBeenCalledTimes(2);
  });

  it('reports checked=0 when no sources have an interval set', async () => {
    DataSource.findAll.mockResolvedValue([]);
    const out = await runDueSources();
    expect(out).toEqual({ checked: 0, ran: 0 });
  });
});
