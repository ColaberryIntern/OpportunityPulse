// Deep Research Phase 7.6 — ventureDecisionEngine new rules.

const { decide } = require('../../src/deepResearch/ventureDecisionEngine.service');

describe('ventureDecisionEngine — Phase 7.6 competing-tools signal', () => {
  const baseInputs = {
    compositeScore: 60,
    executionScore: 60,
    marketStage: 'active',
    correlationStrength: 0.5,
    convergenceType: 'multi_channel',
    competitionSaturation: 50,
    monetizationModelCount: 2,
  };

  it('escalates to OVERSATURATED when crowded and composite < 75', () => {
    const out = decide({ ...baseInputs, competingToolsSignal: 'crowded', competingToolsCount: 8 });
    expect(out.decision).toBe('OVERSATURATED');
    expect(out.rationale).toMatch(/already serve/i);
    expect(out.factors.competing_tools_signal).toBe('crowded');
    expect(out.factors.competing_tools_count).toBe(8);
  });

  it('does NOT escalate to OVERSATURATED when crowded but composite >= 75 (dominant)', () => {
    const out = decide({
      ...baseInputs, compositeScore: 78,
      competingToolsSignal: 'crowded', competingToolsCount: 8,
    });
    expect(out.decision).not.toBe('OVERSATURATED');
  });

  it('reinforces TOO_EARLY rationale when tools_signal=empty and market=emerging', () => {
    const out = decide({
      ...baseInputs, marketStage: 'emerging', correlationStrength: 0.15,
      competingToolsSignal: 'empty', competingToolsCount: 0,
    });
    expect(out.decision).toBe('TOO_EARLY');
    expect(out.rationale).toMatch(/No AI tools yet/);
  });

  it('preserves pre-7.6 behavior when competingToolsSignal is null', () => {
    const out = decide({ ...baseInputs });
    expect(out.decision).toBe('BUILD_SOON');
    expect(out.factors.competing_tools_signal).toBeNull();
    expect(out.factors.competing_tools_count).toBeNull();
  });

  it('preserves pre-7.6 behavior when competingToolsSignal is active (no escalation)', () => {
    const out = decide({ ...baseInputs, competingToolsSignal: 'active', competingToolsCount: 4 });
    expect(out.decision).toBe('BUILD_SOON');
    // Factors still record the signal for audit.
    expect(out.factors.competing_tools_signal).toBe('active');
  });
});
