// Deep Research Phase 2 — briefingSubscription.service tests.

jest.mock('../../src/models', () => ({
  BriefingSubscription: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  DeepResearchReport: { findAll: jest.fn() },
  DailyResearchScan: { findAll: jest.fn() },
}));
jest.mock('../../src/deepResearch/emailBriefing.service', () => ({
  buildBriefingHtml: jest.fn(() => '<html>preview</html>'),
}));

const { BriefingSubscription, DeepResearchReport, DailyResearchScan } = require('../../src/models');
const svc = require('../../src/deepResearch/briefingSubscription.service');

function fakeRow(initial) {
  const row = { ...initial };
  row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
  row.destroy = jest.fn(async () => {});
  row.toJSON = () => ({ ...row, update: undefined, destroy: undefined, toJSON: undefined });
  return row;
}

beforeEach(() => { jest.clearAllMocks(); });

describe('briefingSubscription.normalizeRecipients', () => {
  it('parses a comma string and drops invalid emails', () => {
    const out = svc.normalizeRecipients('ali@colaberry.com, not-an-email , bob@x.io');
    expect(out).toEqual(['ali@colaberry.com', 'bob@x.io']);
  });
  it('handles an array and a non-array gracefully', () => {
    expect(svc.normalizeRecipients(['ok@x.com', 'bad'])).toEqual(['ok@x.com']);
    expect(svc.normalizeRecipients(null)).toEqual([]);
  });
});

describe('briefingSubscription.createSubscription', () => {
  it('rejects an empty topic', async () => {
    await expect(svc.createSubscription({ scanTopic: '  ' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
  it('creates with a normalized frequency + recipients', async () => {
    BriefingSubscription.create.mockImplementation(async (v) => fakeRow({ id: 1, ...v }));
    const out = await svc.createSubscription({
      scanTopic: 'gov AI', frequency: 'bogus', recipients: 'ali@colaberry.com',
    });
    expect(out.frequency).toBe('daily'); // invalid → default
    expect(out.recipients).toEqual(['ali@colaberry.com']);
  });
});

describe('briefingSubscription.updateSubscription', () => {
  it('throws NOT_FOUND for a missing subscription', async () => {
    BriefingSubscription.findByPk.mockResolvedValue(null);
    await expect(svc.updateSubscription(99, {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('updates enabled + recipients', async () => {
    const row = fakeRow({ id: 1, scanTopic: 'x', enabled: true, recipients: [] });
    BriefingSubscription.findByPk.mockResolvedValue(row);
    await svc.updateSubscription(1, { enabled: false, recipients: ['a@b.com'] });
    expect(row.enabled).toBe(false);
    expect(row.recipients).toEqual(['a@b.com']);
  });
});

describe('briefingSubscription.deleteSubscription', () => {
  it('deletes an existing subscription', async () => {
    const row = fakeRow({ id: 3 });
    BriefingSubscription.findByPk.mockResolvedValue(row);
    const out = await svc.deleteSubscription(3);
    expect(row.destroy).toHaveBeenCalled();
    expect(out.deleted).toBe(true);
  });
});

describe('briefingSubscription.isDue', () => {
  const now = Date.now();
  it('a never-run enabled subscription is due', () => {
    expect(svc.isDue({ enabled: true, frequency: 'daily', lastScanAt: null }, now)).toBe(true);
  });
  it('a disabled subscription is never due', () => {
    expect(svc.isDue({ enabled: false, frequency: 'daily', lastScanAt: null }, now)).toBe(false);
  });
  it('a daily subscription run 25h ago is due; run 1h ago is not', () => {
    const h25 = new Date(now - 25 * 3600 * 1000);
    const h1 = new Date(now - 1 * 3600 * 1000);
    expect(svc.isDue({ enabled: true, frequency: 'daily', lastScanAt: h25 }, now)).toBe(true);
    expect(svc.isDue({ enabled: true, frequency: 'daily', lastScanAt: h1 }, now)).toBe(false);
  });
  it('a weekly subscription run 25h ago is NOT due', () => {
    const h25 = new Date(now - 25 * 3600 * 1000);
    expect(svc.isDue({ enabled: true, frequency: 'weekly', lastScanAt: h25 }, now)).toBe(false);
  });
});

describe('briefingSubscription.previewBriefing', () => {
  it('renders the briefing HTML from recent reports', async () => {
    DeepResearchReport.findAll.mockResolvedValue([fakeRow({ id: 1, searchTerm: 'x' })]);
    const out = await svc.previewBriefing();
    expect(out.html).toBe('<html>preview</html>');
    expect(out.reportCount).toBe(1);
  });
});

describe('briefingSubscription.listPreviousBriefings', () => {
  it('maps the daily_research_scans log', async () => {
    DailyResearchScan.findAll.mockResolvedValue([
      fakeRow({ id: 1, scanTopic: 'gov AI', reportId: 5, status: 'success' }),
    ]);
    const out = await svc.listPreviousBriefings();
    expect(out).toHaveLength(1);
    expect(out[0].scan_topic).toBe('gov AI');
    expect(out[0].report_id).toBe(5);
  });
});
