// Unit tests for the ingestion consecutive-failure monitor.

jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/utils/email', () => ({ sendEmail: jest.fn() }));

const mockDataSource = { findAll: jest.fn() };
const mockIngestionLog = { findAll: jest.fn() };
jest.mock('../../src/models', () => ({
  DataSource: mockDataSource,
  IngestionLog: mockIngestionLog,
}));

const { checkSourceHealth, ALERT_MARKER } = require('../../src/ingestion/sourceHealthMonitor');

const source = (over = {}) => ({ id: 1, name: 'sam_gov', enabled: true, ...over });

/** Build a log row with a jest-spied update(), like a Sequelize instance. */
function log(status, over = {}) {
  return {
    status,
    startedAt: '2026-08-13T07:00:00.000Z',
    errors: [],
    metadata: {},
    update: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.INGESTION_ALERT_RECIPIENTS;
});

describe('checkSourceHealth', () => {
  it('alerts when a source hits the failure threshold (happy path)', async () => {
    const newest = log('failed', { errors: ['401 Invalid Credentials'] });
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([newest, log('failed'), log('failed')]);
    const send = jest.fn().mockResolvedValue({ sent: true });

    const res = await checkSourceHealth({ send });

    expect(res.alerted).toEqual(['sam_gov']);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.subject).toContain('sam_gov');
    expect(payload.text).toContain('401 Invalid Credentials');
    expect(newest.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({ [ALERT_MARKER]: expect.any(String) }),
    });
  });

  it('does not alert when a success breaks the streak', async () => {
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([log('failed'), log('success'), log('failed')]);
    const send = jest.fn();

    const res = await checkSourceHealth({ send });

    expect(send).not.toHaveBeenCalled();
    expect(res.alerted).toEqual([]);
  });

  it('does not alert below the threshold (boundary)', async () => {
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([log('failed'), log('failed')]);
    const send = jest.fn();

    const res = await checkSourceHealth({ send });

    expect(send).not.toHaveBeenCalled();
    expect(res.alerted).toEqual([]);
  });

  it('is idempotent: a second pass with no new run sends nothing', async () => {
    const alreadyMarked = log('failed', {
      metadata: { [ALERT_MARKER]: '2026-08-13T07:05:00.000Z' },
    });
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([alreadyMarked, log('failed'), log('failed')]);
    const send = jest.fn();

    const res = await checkSourceHealth({ send });

    expect(send).not.toHaveBeenCalled();
    expect(alreadyMarked.update).not.toHaveBeenCalled();
    expect(res.suppressed).toEqual(['sam_gov']);
  });

  it('leaves the streak unmarked when the alert send fails, so it retries', async () => {
    const newest = log('failed');
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([newest, log('failed'), log('failed')]);
    const send = jest.fn().mockRejectedValue(new Error('SMTP unavailable'));

    const res = await checkSourceHealth({ send });

    expect(newest.update).not.toHaveBeenCalled();
    expect(res.alerted).toEqual([]);
  });

  // Regression: inspecting prod with a no-op sender counted as a successful send
  // and wrote the marker, silently suppressing the next real alert. Caught
  // 2026-08-13 against live data on three sources.
  it('dryRun reports what would alert without sending or marking', async () => {
    const newest = log('failed');
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([newest, log('failed'), log('failed')]);
    const send = jest.fn();

    const res = await checkSourceHealth({ send, dryRun: true });

    expect(send).not.toHaveBeenCalled();
    expect(newest.update).not.toHaveBeenCalled();
    expect(res.wouldAlert).toEqual(['sam_gov']);
    expect(res.alerted).toEqual([]);
  });

  it('handles an empty log history without alerting', async () => {
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([]);
    const send = jest.fn();

    const res = await checkSourceHealth({ send });

    expect(send).not.toHaveBeenCalled();
    expect(res.checked).toBe(1);
  });

  it('honours a custom threshold and multiple recipients', async () => {
    process.env.INGESTION_ALERT_RECIPIENTS = 'ali@colaberry.com, ram@colaberry.com';
    const newest = log('failed');
    mockDataSource.findAll.mockResolvedValue([source()]);
    mockIngestionLog.findAll.mockResolvedValue([newest, log('failed')]);
    const send = jest.fn().mockResolvedValue({ sent: true });

    const res = await checkSourceHealth({ threshold: 2, send });

    expect(res.alerted).toEqual(['sam_gov']);
    expect(send.mock.calls[0][0].to).toEqual(['ali@colaberry.com', 'ram@colaberry.com']);
  });

  it('alerts per source independently', async () => {
    mockDataSource.findAll.mockResolvedValue([source(), source({ id: 2, name: 'grants_gov' })]);
    mockIngestionLog.findAll
      .mockResolvedValueOnce([log('failed'), log('failed'), log('failed')])
      .mockResolvedValueOnce([log('success'), log('failed'), log('failed')]);
    const send = jest.fn().mockResolvedValue({ sent: true });

    const res = await checkSourceHealth({ send });

    expect(res.alerted).toEqual(['sam_gov']);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
