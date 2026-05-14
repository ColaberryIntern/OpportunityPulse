// Deep Research Phase 2 — crossChannelCorrelation.service tests.
// Pure deterministic engine — no mocks needed.

const svc = require('../../src/deepResearch/crossChannelCorrelation.service');

// Build a context channel quickly.
const ch = (key, label, count, recent, prior, value = 0) => ({
  key, label, count, recentCount: recent, priorCount: prior, totalValue: value, items: [],
});

describe('crossChannelCorrelation.normalizeVolume', () => {
  it('soft-caps volume at 1.0', () => {
    expect(svc.normalizeVolume(0)).toBe(0);
    expect(svc.normalizeVolume(10)).toBe(0.5);
    expect(svc.normalizeVolume(40)).toBe(1);
  });
});

describe('crossChannelCorrelation.channelSignal', () => {
  it('computes volume/recency/acceleration weighted by channel', () => {
    const sig = svc.channelSignal(ch('capital', 'Capital', 10, 8, 4, 1000000));
    expect(sig.channel).toBe('capital');
    expect(sig.recency).toBeCloseTo(0.8, 1);
    expect(sig.acceleration).toBeCloseTo(2, 1); // 8 recent / 4 prior
    expect(sig.signal_score).toBeGreaterThan(0);
    expect(sig.weight).toBe(1.0); // capital is the heaviest channel
  });

  it('handles a channel with no prior window', () => {
    const sig = svc.channelSignal(ch('research', 'Research', 5, 5, 0));
    expect(sig.acceleration).toBe(2); // recent>0, no prior → treated as accelerating
  });
});

describe('crossChannelCorrelation.classifyConvergence', () => {
  it('detects commercial acceleration (research + talent + capital)', () => {
    expect(svc.classifyConvergence(['research', 'talent', 'capital'])).toBe('commercial_acceleration');
  });
  it('detects procurement pull (research + government)', () => {
    expect(svc.classifyConvergence(['research', 'government'])).toBe('procurement_pull');
  });
  it('detects research-only', () => {
    expect(svc.classifyConvergence(['research'])).toBe('research_only');
  });
  it('returns none for an empty active set', () => {
    expect(svc.classifyConvergence([])).toBe('none');
  });
});

describe('crossChannelCorrelation.analyzeCorrelations', () => {
  it('returns a none result for an empty context', () => {
    const out = svc.analyzeCorrelations({ channels: [] });
    expect(out.convergence_type).toBe('none');
    expect(out.correlation_strength).toBe(0);
  });

  it('detects commercial acceleration across reinforcing channels', () => {
    const context = {
      searchTerm: 'AI agents',
      channels: [
        ch('research', 'Research', 12, 9, 3),
        ch('talent', 'Talent', 8, 6, 2),
        ch('capital', 'Capital', 5, 4, 1, 2000000),
      ],
    };
    const out = svc.analyzeCorrelations(context);
    expect(out.convergence_type).toBe('commercial_acceleration');
    expect(out.correlation_strength).toBeGreaterThan(0.5);
    expect(out.acceleration).toBeGreaterThan(1);
    expect(out.signal_breakdown).toHaveLength(3);
    expect(out.supporting_evidence.length).toBeGreaterThan(0);
  });

  it('classifies a single weak channel as research-only / low strength', () => {
    const context = {
      searchTerm: 'niche topic',
      channels: [ch('research', 'Research', 3, 2, 1)],
    };
    const out = svc.analyzeCorrelations(context);
    expect(['research_only', 'emerging_single']).toContain(out.convergence_type);
    expect(out.correlation_strength).toBeLessThan(0.7);
  });
});
