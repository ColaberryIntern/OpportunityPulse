// Win Probability Learning Engine — verifies the deterministic core
// (computeProbabilityFromHistory) and the DB-bound calculateWinProbability
// path (with mocked models).

jest.mock('../../src/models', () => {
  const mockEvents = [];
  const mockOpps = new Map();
  const mockHistoryRows = [];
  return {
    sequelize: {},
    OpportunityEvent: {
      findAll: jest.fn(async ({ where = {} } = {}) => {
        let rows = mockEvents;
        if (where.eventType && where.eventType[Symbol.for('sequelize.op.in')]) {
          // sequelize Op.in is opaque in jest mocks; just filter by the
          // string array we know we always pass.
        }
        return rows.map((r) => ({ ...r }));
      }),
    },
    Opportunity: {
      findAll: jest.fn(async ({ where: { id } }) => Array.from(id)
        .map((i) => mockOpps.get(i))
        .filter(Boolean)
        .map((o) => ({ ...o, toJSON: () => o }))),
    },
    WinProbabilityHistory: {
      create: jest.fn(async (row) => {
        mockHistoryRows.push(row);
        return { ...row, id: mockHistoryRows.length };
      }),
    },
    __mock: { mockEvents, mockOpps, mockHistoryRows },
  };
});

const wp = require('../../src/oied/winProbability.service');
const models = require('../../src/models');

function seedOpp(id, { category = 'IT Services', value = 250000 } = {}) {
  models.__mock.mockOpps.set(id, { id, category, value });
}
function seedEvent(opportunityId, eventType) {
  models.__mock.mockEvents.push({
    eventType,
    opportunityId,
    createdAt: new Date(),
  });
}
function reset() {
  models.__mock.mockEvents.length = 0;
  models.__mock.mockOpps.clear();
  models.__mock.mockHistoryRows.length = 0;
  models.WinProbabilityHistory.create.mockClear();
}

describe('winProbability.computeProbabilityFromHistory (pure)', () => {
  it('baseline 20% with no outcomes', () => {
    const out = wp.computeProbabilityFromHistory({
      candidate: { category: 'IT', value: 250000, fitScore: 50, effortScore: 50 },
      outcomes: [],
    });
    expect(out.win_probability).toBeCloseTo(0.20, 2);
    expect(out.components.baseline).toBe(0.20);
  });

  it('rises with same-category wins (the "10 wins" spec test)', () => {
    const wins = Array.from({ length: 10 }, () => ({
      eventType: 'won',
      opportunity: { category: 'IT Services', value: 250000, effortScore: 50 },
    }));
    const out = wp.computeProbabilityFromHistory({
      candidate: { category: 'IT Services', value: 250000, fitScore: 50, effortScore: 50 },
      outcomes: wins,
    });
    // With 10 wins: category_adj = clip(10*0.04, -.20, +.25) = +.25,
    // deal_size_adj = clip(10*0.02, -.10, +.10) = +.10,
    // effort_adj = clip(10*0.015, -.08, +.08) = +.08,
    // fit_boost = 0 (fitScore < 70).
    // raw = 0.20 + 0.25 + 0.10 + 0.08 = 0.63 — well above the 0.20 baseline.
    expect(out.win_probability).toBeGreaterThan(0.50);
    expect(out.components.category_adjustment).toBeCloseTo(0.25, 2);
    expect(out.components.similar_wins.category).toBe(10);
  });

  it('falls with same-category losses', () => {
    const losses = Array.from({ length: 10 }, () => ({
      eventType: 'lost',
      opportunity: { category: 'Compliance', value: 250000, effortScore: 50 },
    }));
    const out = wp.computeProbabilityFromHistory({
      candidate: { category: 'Compliance', value: 250000, fitScore: 50, effortScore: 50 },
      outcomes: losses,
    });
    // category_adj clipped at -0.20, deal_size_adj clipped at -0.10,
    // effort_adj clipped at -0.08 → raw = 0.20 - 0.38 = -0.18, clamped to 0.05.
    expect(out.win_probability).toBe(wp.MIN_PROB);
  });

  it('deal-size band only applies within 0.5x – 2x', () => {
    const out = wp.computeProbabilityFromHistory({
      candidate: { category: 'X', value: 100000, fitScore: 0, effortScore: 50 },
      outcomes: [
        // value=10M is way outside 0.5x–2x of 100k → no deal-size effect.
        { eventType: 'won', opportunity: { category: 'X', value: 10_000_000, effortScore: 50 } },
      ],
    });
    expect(out.components.similar_wins.deal_size).toBe(0);
    expect(out.components.deal_size_adjustment).toBe(0);
  });

  it('effort band only applies within ±15', () => {
    const out = wp.computeProbabilityFromHistory({
      candidate: { category: 'X', value: 1, fitScore: 0, effortScore: 30 },
      outcomes: [
        { eventType: 'won', opportunity: { category: 'X', value: 1, effortScore: 80 } },
      ],
    });
    // effort 80 is way outside 30 ± 15.
    expect(out.components.similar_wins.effort).toBe(0);
    expect(out.components.effort_adjustment).toBe(0);
  });

  it('clamps to [0.05, 0.85]', () => {
    const ten = (et) => Array.from({ length: 30 }, () => ({
      eventType: et, opportunity: { category: 'X', value: 100, effortScore: 50 },
    }));
    const high = wp.computeProbabilityFromHistory({
      candidate: { category: 'X', value: 100, fitScore: 90, effortScore: 50 },
      outcomes: ten('won'),
    });
    expect(high.win_probability).toBeLessThanOrEqual(wp.MAX_PROB);

    const low = wp.computeProbabilityFromHistory({
      candidate: { category: 'X', value: 100, fitScore: 0, effortScore: 50 },
      outcomes: ten('lost'),
    });
    expect(low.win_probability).toBeGreaterThanOrEqual(wp.MIN_PROB);
  });

  it('fitScore >= 70 adds +0.05', () => {
    const a = wp.computeProbabilityFromHistory({
      candidate: { category: 'X', value: 1, fitScore: 69, effortScore: 50 },
      outcomes: [],
    });
    const b = wp.computeProbabilityFromHistory({
      candidate: { category: 'X', value: 1, fitScore: 70, effortScore: 50 },
      outcomes: [],
    });
    expect(b.win_probability - a.win_probability).toBeCloseTo(0.05, 2);
  });
});

describe('winProbability.calculateWinProbability (DB-bound)', () => {
  beforeEach(reset);

  it('writes a history row when persist=true', async () => {
    seedOpp(101, { category: 'IT Services', value: 250000 });
    const out = await wp.calculateWinProbability({
      opportunity: { id: 101, category: 'IT Services', value: 250000 },
      organizationId: 1,
      fitScore: 60,
      effortScore: 40,
      persist: true,
    });
    expect(models.WinProbabilityHistory.create).toHaveBeenCalled();
    const row = models.WinProbabilityHistory.create.mock.calls[0][0];
    expect(row.organizationId).toBe(1);
    expect(row.opportunityId).toBe(101);
    expect(row.winProbability).toBe(out.win_probability);
  });

  it('does NOT persist when persist=false', async () => {
    seedOpp(102, { category: 'IT Services', value: 250000 });
    await wp.calculateWinProbability({
      opportunity: { id: 102, category: 'IT Services', value: 250000 },
      organizationId: 1,
      fitScore: 50,
      effortScore: 40,
      persist: false,
    });
    expect(models.WinProbabilityHistory.create).not.toHaveBeenCalled();
  });
});
