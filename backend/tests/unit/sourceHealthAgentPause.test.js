// The Source Health Agent must honour the shared ingestion pause.
//
// Regression context: this agent calls ingestionSvc.runIngestion for every
// source it probes, but it was gated only by its own flag. On 2026-10-01 it ran
// 8 ingestions at 07:00-07:01Z and wrote rows while INGESTION_SCHEDULER_ENABLED
// was false and the other three ingesting schedulers had each reported
// themselves disabled. "All three pause controls false" did not mean ingestion
// was held, and release verification would have passed regardless.

jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({ stop: jest.fn() })),
  validate: jest.fn(() => true),
}));

jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// The service is never reached in these cases, but requiring it pulls in the
// ingestion stack, so it is stubbed to keep this a unit test.
jest.mock('../../src/admin/sourceHealthAgent.service', () => ({
  runAndEmail: jest.fn(),
}));

const cron = require('node-cron');
const logger = require('../../src/logging/logger');

const ORIGINAL = {
  pause: process.env.INGESTION_SCHEDULER_ENABLED,
  agent: process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED,
};

function loadScheduler() {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('../../src/admin/sourceHealthAgent.scheduler');
  });
  return mod.startSourceHealthAgentScheduler;
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.INGESTION_SCHEDULER_ENABLED;
  delete process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED;
});

afterEach(() => {
  for (const [k, v] of Object.entries({
    INGESTION_SCHEDULER_ENABLED: ORIGINAL.pause,
    OIED_SOURCE_HEALTH_AGENT_ENABLED: ORIGINAL.agent,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('Source Health Agent honours the ingestion pause', () => {
  it('does NOT arm when ingestion is paused, even with its own flag on', () => {
    // This is the exact production configuration on 2026-10-01.
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED = 'true';

    expect(loadScheduler()()).toBeNull();
    expect(cron.schedule).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Source Health Agent DISABLED'),
      expect.objectContaining({
        event: 'ingestion_scheduler_disabled',
        scheduler: 'source_health_agent',
        reason: 'paused',
      }),
    );
  });

  it('emits the same event/scheduler pair when only its own flag is off', () => {
    // Uniform evidence, so release verification can require this scheduler
    // without caring which reason took it out.
    process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED = 'false';

    expect(loadScheduler()()).toBeNull();
    expect(cron.schedule).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('OIED_SOURCE_HEALTH_AGENT_ENABLED is off'),
      expect.objectContaining({
        event: 'ingestion_scheduler_disabled',
        scheduler: 'source_health_agent',
        reason: 'flag_off',
      }),
    );
  });

  it('arms only when the agent is enabled AND ingestion is not paused', () => {
    process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED = 'true';

    expect(loadScheduler()()).not.toBeNull();
    expect(cron.schedule).toHaveBeenCalledTimes(1);
  });

  it('the pause outranks the agent flag — health-by-ingestion is meaningless while paused', () => {
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED = 'true';
    loadScheduler()();

    const reasons = logger.warn.mock.calls
      .map(([, meta]) => meta && meta.reason)
      .filter(Boolean);
    expect(reasons).toContain('paused');
  });

  it('skips a scheduled fire if the pause is set, without running the agent', () => {
    process.env.OIED_SOURCE_HEALTH_AGENT_ENABLED = 'true';
    loadScheduler()();

    const [, callback] = cron.schedule.mock.calls[0];
    process.env.INGESTION_SCHEDULER_ENABLED = 'false';
    return callback().then(() => {
      // eslint-disable-next-line global-require
      const agent = require('../../src/admin/sourceHealthAgent.service');
      expect(agent.runAndEmail).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('cron skipped'),
        expect.objectContaining({ scheduler: 'source_health_agent' }),
      );
    });
  });
});
