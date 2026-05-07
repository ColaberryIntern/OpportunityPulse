// Tests for the v9.4 cross-channel enrichment of the Strategist:
// formatTrendSignals (pure rendering) + the system/user prompts that
// thread it. loadTrendSignals itself is DB-bound and exercised in
// integration; here we only mock the model call to confirm shape.

jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: { findAll: jest.fn() },
  BonfireStrategicOpportunity: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    bulkCreate: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  Opportunity: { findAll: jest.fn() },
}));

jest.mock('../../src/analysis/ai.client', () => ({
  getAIClient: () => ({ chat: jest.fn() }),
}));

const svc = require('../../src/bonfire/bonfireStrategist.service');

const sampleSignals = {
  news: [
    { id: 1, title: 'Anthropic launches new enterprise plan', category: 'AI Industry', aiScore: 85 },
    { id: 2, title: 'AI staffing demand surges in Texas', category: 'Workforce', aiScore: 80 },
  ],
  talent: [
    { id: 11, title: 'Senior ML Engineer — TXDOT', category: 'Public Sector', aiScore: 70 },
  ],
  capital: [
    { id: 21, title: 'Anthropic Series E ($3B)', category: 'AI Funding', aiScore: 95 },
  ],
  gov: [
    { id: 31, title: 'GSA modernization grant 2026-Q3', category: 'Federal', aiScore: 75 },
  ],
  dateRange: '2026-04-07..2026-05-07',
};

describe('strategist.formatTrendSignals', () => {
  it('renders all four channel blocks when populated', () => {
    const out = svc.formatTrendSignals(sampleSignals);
    expect(out).toMatch(/MARKET CONTEXT/);
    expect(out).toMatch(/PRIVATE-SECTOR \/ NEWS/);
    expect(out).toMatch(/TALENT-DEMAND/);
    expect(out).toMatch(/CAPITAL \/ FUNDING/);
    expect(out).toMatch(/FEDERAL PROCUREMENT/);
    // Cites a specific item from each.
    expect(out).toMatch(/Anthropic launches new enterprise/);
    expect(out).toMatch(/Senior ML Engineer/);
    expect(out).toMatch(/Series E/);
    expect(out).toMatch(/GSA modernization/);
  });

  it('drops empty channels (keeps prompt tight)', () => {
    const partial = { ...sampleSignals, talent: [], gov: [] };
    const out = svc.formatTrendSignals(partial);
    expect(out).toMatch(/PRIVATE-SECTOR/);
    expect(out).toMatch(/CAPITAL/);
    expect(out).not.toMatch(/TALENT-DEMAND/);
    expect(out).not.toMatch(/FEDERAL PROCUREMENT/);
  });

  it('returns empty string when ALL channels are empty', () => {
    const empty = { news: [], talent: [], capital: [], gov: [], dateRange: '...' };
    expect(svc.formatTrendSignals(empty)).toBe('');
  });

  it('returns empty string when signals object is null', () => {
    expect(svc.formatTrendSignals(null)).toBe('');
  });

  it('embeds the date range in the header', () => {
    const out = svc.formatTrendSignals(sampleSignals);
    expect(out).toMatch(/2026-04-07\.\.2026-05-07/);
  });

  it('includes ai_score in brackets and category after dash', () => {
    const out = svc.formatTrendSignals(sampleSignals);
    expect(out).toMatch(/\[85\]/);
    expect(out).toMatch(/AI Industry/);
  });
});

describe('strategist.buildSystemPrompt — v9.4 cross-channel rules', () => {
  it('mentions the two input streams (Bonfire bids + market context)', () => {
    const sp = svc.buildSystemPrompt();
    expect(sp).toMatch(/BONFIRE BIDS/);
    expect(sp).toMatch(/MARKET CONTEXT/);
  });

  it('instructs the AI to cite specific market-context items', () => {
    const sp = svc.buildSystemPrompt();
    expect(sp).toMatch(/cite/i);
    expect(sp).toMatch(/EVIDENCE/);
  });

  it('prohibits inventing market-context items', () => {
    const sp = svc.buildSystemPrompt();
    expect(sp).toMatch(/Do NOT invent/i);
  });

  it('preserves the existing four-pillar contract (money/roi/ai_system/business_viability)', () => {
    const sp = svc.buildSystemPrompt();
    expect(sp).toMatch(/money:/);
    expect(sp).toMatch(/roi:/);
    expect(sp).toMatch(/ai_system:/);
    expect(sp).toMatch(/business_viability:/);
  });
});

describe('strategist.buildClusterUserPrompt — embeds trend block', () => {
  const fakeCluster = {
    key: 'staffing|250k-500k',
    opps: [
      { agency: 'TXDOT', title: 'AI Workforce Analytics', estimatedValue: 50_000_000, priorityScore: 85 },
      { agency: 'U3P',   title: 'Compliance Reporting Platform', estimatedValue: 40_000_000, priorityScore: 80 },
      { agency: 'Metra', title: 'Operations Optimization', estimatedValue: 30_000_000, priorityScore: 75 },
    ],
  };

  it('renders the cluster header + list when no trend signals supplied', () => {
    const prompt = svc.buildClusterUserPrompt(fakeCluster);
    expect(prompt).toMatch(/CLUSTER/);
    expect(prompt).toMatch(/AI Workforce Analytics/);
    expect(prompt).not.toMatch(/MARKET CONTEXT/);
  });

  it('embeds market-context block when trend signals supplied', () => {
    const prompt = svc.buildClusterUserPrompt(fakeCluster, sampleSignals);
    expect(prompt).toMatch(/CLUSTER/);
    expect(prompt).toMatch(/MARKET CONTEXT/);
    expect(prompt).toMatch(/Anthropic Series E/);
  });

  it('instructs the AI to cite signals when they align', () => {
    const prompt = svc.buildClusterUserPrompt(fakeCluster, sampleSignals);
    expect(prompt).toMatch(/cite them by name/i);
    expect(prompt).toMatch(/JUSTIFY/);
  });
});

describe('strategist.buildStandaloneUserPrompt — embeds trend block', () => {
  const opp = {
    title: 'AI-Augmented Procurement',
    agency: 'GSA',
    aiCategory: 'IT Services',
    recommendedProduct: 'Custom AI',
    estimatedValue: 80_000_000,
    priorityScore: 85,
    automationPotential: 70,
    repeatability: 75,
    fitScore: 80,
    closeDate: new Date('2026-06-01'),
    overview: 'Procurement modernization',
    description: 'A long description...',
  };
  it('renders the opp fields', () => {
    const prompt = svc.buildStandaloneUserPrompt(opp);
    expect(prompt).toMatch(/STANDALONE/);
    expect(prompt).toMatch(/AI-Augmented Procurement/);
  });
  it('embeds market context when supplied', () => {
    const prompt = svc.buildStandaloneUserPrompt(opp, sampleSignals);
    expect(prompt).toMatch(/MARKET CONTEXT/);
    expect(prompt).toMatch(/Anthropic/);
  });
});
