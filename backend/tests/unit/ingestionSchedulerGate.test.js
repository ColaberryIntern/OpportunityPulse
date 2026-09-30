// The ingestion scheduler's off switch.
//
// Before this existed there was no way to guarantee a write freeze: the only knob
// was INGESTION_SCHEDULE, which CHANGES the cron expression, and unsetting it fell
// back to DEFAULT_SCHEDULE ('0 6 * * *'). The scheduler therefore always armed, so
// a migration or rollout window could not be made provably quiet.

jest.mock('node-cron', () => ({
  validate: jest.fn(() => true),
  schedule: jest.fn(() => ({ stop: jest.fn() })),
}));
jest.mock('../../src/ingestion/ingestion.service', () => ({ runAllEnabled: jest.fn() }));
jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const cron = require('node-cron');
const logger = require('../../src/logging/logger');
const { startScheduler } = require('../../src/ingestion/scheduler');

const ORIGINAL = process.env.INGESTION_SCHEDULER_ENABLED;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.INGESTION_SCHEDULER_ENABLED;
});

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.INGESTION_SCHEDULER_ENABLED;
  else process.env.INGESTION_SCHEDULER_ENABLED = ORIGINAL;
});

describe('ingestion scheduler off switch', () => {
  it('arms by default, so existing production behaviour is unchanged', () => {
    const task = startScheduler();
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(task).not.toBeNull();
  });

  it('does NOT arm when INGESTION_SCHEDULER_ENABLED=false', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    const task = startScheduler();
    expect(cron.schedule).not.toHaveBeenCalled();
    expect(task).toBeNull();
  });

  it('logs the refusal, so a quiet window is auditable', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    startScheduler();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/DISABLED by INGESTION_SCHEDULER_ENABLED=false/),
      expect.objectContaining({ event: 'ingestion_scheduler_disabled' }),
    );
  });

  it('accepts FALSE / False — case-insensitive', () => {
    for (const v of ['FALSE', 'False', 'fAlSe']) {
      jest.clearAllMocks();
      process.env.INGESTION_SCHEDULER_ENABLED = v;
      expect(startScheduler()).toBeNull();
      expect(cron.schedule).not.toHaveBeenCalled();
    }
  });

  it('only the exact string false disables — a typo must NOT silently stop ingestion', () => {
    // The dangerous failure is the opposite of the one people expect: a typo that
    // silently disables ingestion for weeks. Anything that is not 'false' arms.
    for (const v of ['flase', 'no', '0', 'off', 'disabled', '', 'true']) {
      jest.clearAllMocks();
      process.env.INGESTION_SCHEDULER_ENABLED = v;
      const task = startScheduler();
      expect(cron.schedule).toHaveBeenCalledTimes(1);
      expect(task).not.toBeNull();
    }
  });

  it('an explicit schedule argument does not bypass the off switch', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    expect(startScheduler('*/5 * * * *')).toBeNull();
    expect(cron.schedule).not.toHaveBeenCalled();
  });

  it('the off switch is checked BEFORE cron validation, so it cannot be defeated by a bad expression', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    startScheduler('not-a-cron');
    expect(cron.validate).not.toHaveBeenCalled();
    expect(cron.schedule).not.toHaveBeenCalled();
  });
});
