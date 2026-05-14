// Deep Research Intelligence Engine — dailyResearchScheduler.service tests.

jest.mock('../../src/models', () => ({
  DailyResearchScan: { create: jest.fn() },
  BriefingSubscription: { findAll: jest.fn() },
  DeepResearchReport: { findAll: jest.fn() },
}));
jest.mock('../../src/deepResearch/deepResearch.service', () => ({ runDeepResearch: jest.fn() }));
jest.mock('../../src/deepResearch/emailBriefing.service', () => ({ sendDailyBriefing: jest.fn() }));

const { DailyResearchScan } = require('../../src/models');
const deepResearch = require('../../src/deepResearch/deepResearch.service');
const emailBriefing = require('../../src/deepResearch/emailBriefing.service');
const svc = require('../../src/deepResearch/dailyResearchScheduler.service');

function fakeScan() {
  const row = {};
  row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
  return row;
}

beforeEach(() => {
  DailyResearchScan.create.mockReset();
  deepResearch.runDeepResearch.mockReset();
  emailBriefing.sendDailyBriefing.mockReset();
  delete process.env.DEEP_RESEARCH_SCAN_TOPICS;
});

describe('dailyResearchScheduler.getScanTopics', () => {
  it('returns the defaults when no env override is set', () => {
    expect(svc.getScanTopics()).toEqual(svc.DEFAULT_SCAN_TOPICS);
  });
  it('parses a comma-separated env override', () => {
    process.env.DEEP_RESEARCH_SCAN_TOPICS = 'topic one, topic two , topic three';
    expect(svc.getScanTopics()).toEqual(['topic one', 'topic two', 'topic three']);
  });
  it('falls back to defaults for an empty / whitespace override', () => {
    process.env.DEEP_RESEARCH_SCAN_TOPICS = '   ,  ';
    expect(svc.getScanTopics()).toEqual(svc.DEFAULT_SCAN_TOPICS);
  });
});

describe('dailyResearchScheduler.runDailyScan', () => {
  it('runs a report per topic and logs each as a scan row', async () => {
    DailyResearchScan.create.mockImplementation(async () => fakeScan());
    deepResearch.runDeepResearch.mockImplementation(async ({ searchTerm }) => ({ id: searchTerm.length }));
    emailBriefing.sendDailyBriefing.mockResolvedValue({ sent: false });

    const summary = await svc.runDailyScan({ topics: ['alpha', 'beta'] });
    expect(deepResearch.runDeepResearch).toHaveBeenCalledTimes(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
    expect(emailBriefing.sendDailyBriefing).toHaveBeenCalledTimes(1);
  });

  it('continues past a failing topic and marks that scan failed (failure-first)', async () => {
    const scans = [];
    DailyResearchScan.create.mockImplementation(async () => { const s = fakeScan(); scans.push(s); return s; });
    deepResearch.runDeepResearch
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error('429 quota'))
      .mockResolvedValueOnce({ id: 3 });
    emailBriefing.sendDailyBriefing.mockResolvedValue({ sent: false });

    const summary = await svc.runDailyScan({ topics: ['a', 'b', 'c'] });
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(scans[1].status).toBe('failed');
    expect(scans[1].error).toMatch(/429/);
  });

  it('does not throw if the briefing dispatch fails', async () => {
    DailyResearchScan.create.mockImplementation(async () => fakeScan());
    deepResearch.runDeepResearch.mockResolvedValue({ id: 1 });
    emailBriefing.sendDailyBriefing.mockRejectedValue(new Error('smtp down'));
    const summary = await svc.runDailyScan({ topics: ['a'] });
    expect(summary.succeeded).toBe(1);
  });
});
