// Deep Research Phase 4 — portfolioForecasting.service tests.

const svc = require('../../src/deepResearch/portfolioForecasting.service');

describe('portfolioForecasting.parsePricingDollars', () => {
  it('parses dollar amounts with k/m suffixes', () => {
    expect(svc.parsePricingDollars('$50/seat/mo')).toMatchObject({ amount: 50, unit: 'monthly' });
    expect(svc.parsePricingDollars('$80-150k pilot')).toMatchObject({ unit: 'project' });
    expect(svc.parsePricingDollars('$2.5M ARR')).toMatchObject({ amount: 2500000, unit: 'annual' });
  });
  it('returns null when nothing parses', () => {
    expect(svc.parsePricingDollars('contact us')).toBeNull();
    expect(svc.parsePricingDollars(null)).toBeNull();
  });
});

describe('portfolioForecasting.toMonthlyPerCustomer', () => {
  it('converts varied units to a monthly figure', () => {
    expect(svc.toMonthlyPerCustomer({ amount: 100, unit: 'monthly' })).toBe(100);
    expect(svc.toMonthlyPerCustomer({ amount: 1200, unit: 'annual' })).toBe(100);
    expect(svc.toMonthlyPerCustomer({ amount: 12000, unit: 'project' })).toBe(1000);
  });
});

describe('portfolioForecasting.applyScenario', () => {
  // Baseline chosen so realistic break-even is comfortably inside the 60mo cap.
  const baseline = { mrr: 5000, staffing_cost: 80000, infra_cost: 10000 };
  it('lifts MRR and softens cost for optimistic; opposite for conservative', () => {
    const opt = svc.applyScenario(baseline, 'optimistic');
    const con = svc.applyScenario(baseline, 'conservative');
    expect(opt.projected_mrr).toBeGreaterThan(baseline.mrr);
    expect(con.projected_mrr).toBeLessThan(baseline.mrr);
    expect(opt.implementation_cost).toBeLessThan(con.implementation_cost);
  });
  it('computes break-even months and 12mo ROI', () => {
    const real = svc.applyScenario(baseline, 'realistic');
    expect(real.breakeven_months).toBeGreaterThan(0);
    expect(real.projected_roi_12mo).not.toBeNull();
  });
});

describe('portfolioForecasting.forecastVenture', () => {
  it('produces three scenarios for a venture with monetization + readiness', () => {
    const venture = { id: 1, title: 'X' };
    const readiness = {
      staffing: { headcount: 3 }, mvpTimelineWeeks: 10,
      infrastructure: { items: ['db', 'queue', 'auth'] },
    };
    const monetization = [{ pricingSuggestion: '$80/seat/mo', fitScore: 0.8 }];
    const f = svc.forecastVenture(venture, readiness, monetization);
    expect(f.scenarios.realistic).toBeTruthy();
    expect(f.scenarios.optimistic.projected_mrr)
      .toBeGreaterThan(f.scenarios.realistic.projected_mrr);
    expect(f.scenarios.realistic.staffing_cost).toBeGreaterThan(0);
    expect(f.scenarios.realistic.infra_cost).toBeGreaterThan(0);
  });

  it('handles a venture with no monetization gracefully', () => {
    const f = svc.forecastVenture({ id: 1 }, {
      staffing: { headcount: 2 }, mvpTimelineWeeks: 8, infrastructure: { items: [] },
    }, []);
    expect(f.scenarios.realistic.projected_mrr).toBe(0);
  });
});
