// The pause must cover EVERY scheduler that ingests, not just the daily runner.
//
// Regression context: on 2026-10-01 a release rolled out while
// INGESTION_SCHEDULER_ENABLED was unset (it was never passed into the
// container), and `freelancer_api` ingested 19 seconds later from the freelance
// scheduler's startup timer. The daily runner was not involved, so gating it
// alone would not have prevented the run.

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
  validate: jest.fn(() => true),
}));

jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const cron = require('node-cron');
const logger = require('../../src/logging/logger');

const ORIGINAL = process.env.INGESTION_SCHEDULER_ENABLED;

function freshRequire(path) {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    mod = require(path);
  });
  return mod;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  delete process.env.INGESTION_SCHEDULER_ENABLED;
});

afterEach(() => {
  jest.useRealTimers();
  if (ORIGINAL === undefined) delete process.env.INGESTION_SCHEDULER_ENABLED;
  else process.env.INGESTION_SCHEDULER_ENABLED = ORIGINAL;
});

describe('isIngestionPaused', () => {
  const load = () => freshRequire('../../src/ingestion/ingestionPause').isIngestionPaused;

  it('pauses only on the exact string "false"', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    expect(load()()).toBe(true);
  });

  it('is case-insensitive', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'FALSE';
    expect(load()()).toBe(true);
  });

  it('does NOT pause when unset — default is enabled', () => {
    expect(load()()).toBe(false);
  });

  it.each(['true', '0', 'no', 'disabled', 'flase', ''])(
    'does NOT pause on %p, so a typo cannot silently stop ingestion',
    (value) => {
      process.env.INGESTION_SCHEDULER_ENABLED = value;
      expect(load()()).toBe(false);
    },
  );
});

describe('freelance scheduler honours the pause', () => {
  const load = () => freshRequire('../../src/freelance/freelance.scheduler').startFreelanceScheduler;

  it('arms no cron and queues NO startup timer when paused', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';

    expect(load()()).toBeNull();

    expect(cron.schedule).not.toHaveBeenCalled();
    // The startup ingestion is a setTimeout, not a cron. This is the specific
    // path that ingested in production, so assert it was never queued.
    expect(jest.getTimerCount()).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Freelance scheduler DISABLED'),
      expect.objectContaining({ event: 'ingestion_scheduler_disabled', scheduler: 'freelance' }),
    );
  });

  it('arms crons and startup timers when not paused', () => {
    load()();
    expect(cron.schedule).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });
});

describe('research scheduler honours the pause', () => {
  const load = () => freshRequire('../../src/ingestion/research.scheduler').startResearchScheduler;

  it('does not arm the tick loop when paused', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';

    load()();

    expect(cron.schedule).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Research scheduler DISABLED'),
      expect.objectContaining({ event: 'ingestion_scheduler_disabled', scheduler: 'research' }),
    );
  });

  it('arms the tick loop when not paused', () => {
    load()();
    expect(cron.schedule).toHaveBeenCalledTimes(1);
  });
});

describe('daily ingestion scheduler honours the pause', () => {
  const load = () => freshRequire('../../src/ingestion/scheduler').startScheduler;

  it('returns null and arms nothing when paused', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';

    expect(load()()).toBeNull();

    expect(cron.schedule).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Ingestion scheduler DISABLED'),
      expect.objectContaining({ event: 'ingestion_scheduler_disabled', scheduler: 'ingestion' }),
    );
  });

  it('arms the cron when not paused', () => {
    expect(load()('0 6 * * *')).not.toBeNull();
    expect(cron.schedule).toHaveBeenCalledTimes(1);
  });
});
