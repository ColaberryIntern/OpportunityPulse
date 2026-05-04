// Daily briefing — composition, totals math, ignore picker, HTML render.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Bundle: { findAll: jest.fn() },
}));

jest.mock('../../src/utils/email', () => ({
  sendEmail: jest.fn(async () => ({ sent: true })),
}));

jest.mock('../../src/oied/myOpportunities.service', () => ({
  listMyOpportunities: jest.fn(),
}));
jest.mock('../../src/oied/recommendation.service', () => ({
  getTopActions: jest.fn(),
}));
jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
}));

const briefing = require('../../src/oied/briefing.service');
const myOpps = require('../../src/oied/myOpportunities.service');
const recs = require('../../src/oied/recommendation.service');
const models = require('../../src/models');
const email = require('../../src/utils/email');

const FROZEN_NOW = new Date('2026-05-04T12:00:00Z');

beforeEach(() => {
  myOpps.listMyOpportunities.mockReset();
  recs.getTopActions.mockReset();
  models.Bundle.findAll.mockReset();
  email.sendEmail.mockClear();
});

describe('briefing.pickIgnoreWarning', () => {
  it('returns null when no candidate is low-fit AND not closing soon', () => {
    const rows = [
      { id: 1, fitScore: 80, expiresAt: null },
      { id: 2, fitScore: 70, expiresAt: null },
    ];
    expect(briefing.pickIgnoreWarning(rows, [], FROZEN_NOW)).toBeNull();
  });
  it('skips rows already in topIds', () => {
    const rows = [
      { id: 1, fitScore: 10, priorityScore: 20, value: 100, bucket: 'standard',
        title: 'low', category: 'X', expiresAt: null },
    ];
    expect(briefing.pickIgnoreWarning(rows, [1], FROZEN_NOW)).toBeNull();
  });
  it('picks the lowest-priority low-fit row not closing soon', () => {
    const rows = [
      { id: 5, fitScore: 25, priorityScore: 50, value: 100,
        title: 'mid-priority', category: 'X', bucket: 'standard',
        expiresAt: new Date(FROZEN_NOW.getTime() + 30 * 86400000) },
      { id: 6, fitScore: 15, priorityScore: 10, value: 100,
        title: 'lowest-priority', category: 'X', bucket: 'standard',
        expiresAt: new Date(FROZEN_NOW.getTime() + 30 * 86400000) },
    ];
    const out = briefing.pickIgnoreWarning(rows, [], FROZEN_NOW);
    expect(out).not.toBeNull();
    expect(out.opportunity_id).toBe(6); // lowest priority
    expect(out.reason).toMatch(/very low profile fit/);
  });
  it('skips rows closing in <=2 days (those are urgent)', () => {
    const rows = [
      { id: 7, fitScore: 10, priorityScore: 5, value: 100,
        title: 'closing tomorrow', category: 'X',
        expiresAt: new Date(FROZEN_NOW.getTime() + 1 * 86400000) },
    ];
    expect(briefing.pickIgnoreWarning(rows, [], FROZEN_NOW)).toBeNull();
  });
});

describe('briefing.buildBriefing', () => {
  it('returns the full shape + totals math', async () => {
    recs.getTopActions.mockResolvedValue([
      { opportunity_id: 1, title: 'A', expected_value: 500_000,
        win_probability: 0.20, effort_estimate: { proposal_hours: 4 } },
      { opportunity_id: 2, title: 'B', expected_value: 1_000_000,
        win_probability: 0.30, effort_estimate: { proposal_hours: 6 } },
      { opportunity_id: 3, title: 'C', expected_value: 250_000,
        win_probability: 0.20, effort_estimate: { proposal_hours: 4 } },
    ]);
    models.Bundle.findAll.mockResolvedValue([
      { id: 100, theme: 'Test bundle', opportunityCount: 5,
        estimatedTotalValue: 12_000_000,
        strategy: { what_to_build: 'Defense AI', revenue_potential_usd: 30_000_000 },
        toJSON() { return this; } },
    ]);
    myOpps.listMyOpportunities.mockResolvedValue({
      rows: [
        { id: 1 }, { id: 2 }, { id: 3 },
        { id: 99, fitScore: 12, priorityScore: 5, value: 100,
          title: 'skip me', category: 'X', bucket: 'standard',
          expiresAt: new Date(FROZEN_NOW.getTime() + 30 * 86400000) },
      ],
      total: 4,
    });

    const out = await briefing.buildBriefing({ organizationId: 1, now: FROZEN_NOW });
    expect(out.organization_id).toBe(1);
    expect(out.top_actions).toHaveLength(3);
    expect(out.bundle_opportunity.id).toBe(100);
    expect(out.bundle_opportunity.strategy.what_to_build).toBe('Defense AI');
    expect(out.ignore_warning.opportunity_id).toBe(99);
    expect(out.totals.revenue_potential_usd).toBe(1_750_000); // 500k+1M+250k
    expect(out.totals.effort_hours_today).toBe(14);            // 4+6+4
    expect(out.totals.bundle_revenue_usd).toBe(30_000_000);
  });

  it('handles empty data gracefully', async () => {
    recs.getTopActions.mockResolvedValue([]);
    models.Bundle.findAll.mockResolvedValue([]);
    myOpps.listMyOpportunities.mockResolvedValue({ rows: [], total: 0 });
    const out = await briefing.buildBriefing({ organizationId: 1, now: FROZEN_NOW });
    expect(out.top_actions).toEqual([]);
    expect(out.bundle_opportunity).toBeNull();
    expect(out.ignore_warning).toBeNull();
    expect(out.totals.revenue_potential_usd).toBe(0);
    expect(out.totals.effort_hours_today).toBe(0);
  });
});

describe('briefing.buildBriefingHtml', () => {
  it('produces non-empty HTML with the date + recipient hint', () => {
    const html = briefing.buildBriefingHtml({
      date: '2026-05-04', organization_id: 1,
      top_actions: [{
        title: 'Foo', reason: 'closes soon',
        expected_value: 500000, win_probability: 0.30,
        effort_estimate: { proposal_hours: 6 },
      }],
      bundle_opportunity: null,
      ignore_warning: null,
      totals: { revenue_potential_usd: 500000, effort_hours_today: 6, bundle_revenue_usd: 0 },
    });
    expect(html).toMatch(/Today's Briefing/);
    expect(html).toMatch(/2026-05-04/);
    expect(html).toMatch(/Foo/);
    expect(html).toMatch(/win 30%/);
  });
});

describe('briefing.deliverBriefing', () => {
  it('skips gracefully when no recipient is configured', async () => {
    delete process.env.OIED_BRIEFING_TO;
    const out = await briefing.deliverBriefing({ organizationId: 1, now: FROZEN_NOW });
    expect(out.sent).toBe(false);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
  it('sends when a recipient is provided + composes successfully', async () => {
    recs.getTopActions.mockResolvedValue([]);
    models.Bundle.findAll.mockResolvedValue([]);
    myOpps.listMyOpportunities.mockResolvedValue({ rows: [], total: 0 });
    const out = await briefing.deliverBriefing({
      organizationId: 1, to: 'admin@example.com', now: FROZEN_NOW,
    });
    expect(out.sent).toBe(true);
    expect(email.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'admin@example.com',
    }));
  });
});
