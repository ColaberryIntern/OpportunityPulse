// v9.9: Pure-function tests for the Data Source Health backend.
// deriveStatus + nextCronFire are deterministic — no DB needed.

jest.mock('../../src/models', () => ({
  sequelize: {},
  DataSource: { findAll: jest.fn() },
  IngestionLog: { findAll: jest.fn() },
  Opportunity: { findAll: jest.fn() },
}));
jest.mock('../../src/oied/channels.service', () => ({
  getChannelForOpp: () => ({ key: 'private-sector', label: 'News' }),
}));
jest.mock('../../src/ingestion/ingestion.service', () => ({
  runIngestion: jest.fn(),
}));

const ctrl = require('../../src/admin/dataSourceHealth.controller');

describe('dataSourceHealth.deriveStatus', () => {
  function log(overrides = {}) {
    return {
      status: 'success',
      recordsCreated: 5,
      recordsFetched: 10,
      errors: [],
      startedAt: new Date(),
      ...overrides,
    };
  }
  const enabled = { enabled: true };
  const disabled = { enabled: false };

  it('disabled: when source flag is off', () => {
    expect(ctrl.deriveStatus(disabled, [log()])).toBe('disabled');
  });

  it('stale: when no logs exist for an enabled source', () => {
    expect(ctrl.deriveStatus(enabled, [])).toBe('stale');
  });

  it('failing: when last run status is failed', () => {
    expect(ctrl.deriveStatus(enabled, [log({ status: 'failed' })])).toBe('failing');
  });

  it('failing: when 2 of last 3 runs had errors[]', () => {
    const logs = [
      log({ errors: ['boom'] }),
      log({ errors: ['boom'] }),
      log(),
    ];
    expect(ctrl.deriveStatus(enabled, logs)).toBe('failing');
  });

  it('stale: when last successful run was > 48h ago', () => {
    const old = new Date(Date.now() - 50 * 3_600_000);
    expect(ctrl.deriveStatus(enabled, [log({ startedAt: old })])).toBe('stale');
  });

  it('zero_yield: when 3 successful runs in a row created 0 rows', () => {
    const logs = [
      log({ recordsCreated: 0 }),
      log({ recordsCreated: 0 }),
      log({ recordsCreated: 0 }),
      log({ recordsCreated: 5 }),
    ];
    expect(ctrl.deriveStatus(enabled, logs)).toBe('zero_yield');
  });

  it('healthy: recent success with new rows', () => {
    expect(ctrl.deriveStatus(enabled, [log()])).toBe('healthy');
  });

  it('healthy: zero-create on the most-recent run alone is not zero_yield', () => {
    const logs = [
      log({ recordsCreated: 0 }),
      log({ recordsCreated: 5 }),
      log({ recordsCreated: 5 }),
    ];
    expect(ctrl.deriveStatus(enabled, logs)).toBe('healthy');
  });
});

describe('dataSourceHealth.nextCronFire', () => {
  function from(iso) { return new Date(iso).getTime(); }

  it('returns null for invalid expressions', () => {
    expect(ctrl.nextCronFire('not a cron')).toBeNull();
    expect(ctrl.nextCronFire('')).toBeNull();
    expect(ctrl.nextCronFire(null)).toBeNull();
  });

  it('handles a daily cron (0 6 * * *)', () => {
    const next = ctrl.nextCronFire('0 6 * * *', from('2026-05-07T03:00:00Z'));
    expect(next).toBe('2026-05-07T06:00:00.000Z');
  });

  it('rolls to the next day when already past the fire time', () => {
    const next = ctrl.nextCronFire('0 6 * * *', from('2026-05-07T07:00:00Z'));
    expect(next).toBe('2026-05-08T06:00:00.000Z');
  });

  it('handles a list (15 5,17 * * *)', () => {
    const next = ctrl.nextCronFire('15 5,17 * * *', from('2026-05-07T10:00:00Z'));
    expect(next).toBe('2026-05-07T17:15:00.000Z');
  });

  it('handles a step (*/15 * * * *)', () => {
    const next = ctrl.nextCronFire('*/15 * * * *', from('2026-05-07T10:07:00Z'));
    expect(next).toBe('2026-05-07T10:15:00.000Z');
  });

  it('handles weekly (0 7 * * 1)', () => {
    // 2026-05-07 is Thursday (UTC dow 4). Next Monday is May 11.
    const next = ctrl.nextCronFire('0 7 * * 1', from('2026-05-07T10:00:00Z'));
    expect(next).toBe('2026-05-11T07:00:00.000Z');
  });
});
