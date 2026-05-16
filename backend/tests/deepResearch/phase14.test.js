// Deep Research Phase 14 — pure-logic unit tests.

const proposalQuality = require('../../src/deepResearch/proposalQuality.service');
const groundedness = require('../../src/deepResearch/groundedness.service');
const strategicCoherence = require('../../src/deepResearch/strategicCoherence.service');
const evaluatorAlignment = require('../../src/deepResearch/evaluatorAlignment.service');
const lineageEdgeWriter = require('../../src/deepResearch/lineageEdgeWriter.service');

describe('Phase 14 — proposalQuality', () => {
  test('WEIGHTS sum to 1.0 (within float tolerance)', () => {
    const sum = Object.values(proposalQuality.WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });
  test('classify ladders correctly', () => {
    expect(proposalQuality.classify(90)).toBe('excellent');
    expect(proposalQuality.classify(75)).toBe('strong');
    expect(proposalQuality.classify(55)).toBe('adequate');
    expect(proposalQuality.classify(20)).toBe('weak');
  });
  test('clamp respects [0,100]', () => {
    expect(proposalQuality.clamp(-5)).toBe(0);
    expect(proposalQuality.clamp(150)).toBe(100);
    expect(proposalQuality.clamp(50)).toBe(50);
    expect(proposalQuality.clamp(50.4)).toBe(50);
  });
  test('scoreCompleteness rewards content length + standard sections', () => {
    const short = proposalQuality.scoreCompleteness({ content: '' });
    expect(short).toBe(0);
    const withSections = proposalQuality.scoreCompleteness({
      content: 'Executive Summary: x\nApproach: y\nPast Performance: z\nStaffing: a\nPricing: b\nTimeline: c\nCompliance: d\n' + 'X'.repeat(2000),
    });
    expect(withSections).toBeGreaterThan(60);
  });
  test('scoreClarity penalizes long words + long sentences', () => {
    const verbose = proposalQuality.scoreClarity({
      content: 'Our antidisestablishmentarianism methodology pseudoinstitutionalization permits indisputable transformational synergistic disambiguation across multidimensional procurement landscapes encompassing pluripotent stakeholder ecosystems and supraintegrated organizational hierarchies. '.repeat(5),
    });
    // Build a clear-language sample with enough words (>= 50) to be scored.
    const clearText = (
      'We deliver good work on time. Our team is small but skilled. '
      + 'We move quickly through tasks. Past clients are happy with us. '
      + 'The price is fair. We meet deadlines without exception. '
      + 'We document everything in plain words. Our process is simple. '
      + 'We listen to feedback. We adjust when needed. We ship on time. '
      + 'We answer every question in clear terms.'
    );
    const clear = proposalQuality.scoreClarity({ content: clearText });
    expect(clear).toBeGreaterThan(verbose);
  });
  test('scoreDifferentiation rewards differentiation phrases', () => {
    const none = proposalQuality.scoreDifferentiation({ content: 'we work hard' });
    const some = proposalQuality.scoreDifferentiation({
      content: 'Our patented system is unique. We are the only firm with proprietary technology. Unlike competitors, we specialize in this area.',
    });
    expect(some).toBeGreaterThan(none);
  });
  test('scoreStrategicAlignment rewards provenance + capture sections', () => {
    const none = proposalQuality.scoreStrategicAlignment({ contextSections: [], hasProvenance: false });
    const full = proposalQuality.scoreStrategicAlignment({
      contextSections: ['capture_strategy', 'pursuit', 'strategic_patterns', 'recurring_agency'],
      hasProvenance: true,
    });
    expect(full).toBeGreaterThan(none + 40);
  });
  test('buildRecommendations produces actionable recs for low scores', () => {
    const recs = proposalQuality.buildRecommendations({
      strategic_alignment: 30, completeness: 30, evaluator_alignment: 30,
      differentiation: 30, clarity: 30, readiness_consistency: 30,
      groundedness: 30, operational_coherence: 30,
    });
    expect(recs.length).toBe(8);
  });
});

describe('Phase 14 — groundedness', () => {
  test('CLAIM_MARKERS + EVIDENCE_MARKERS + WEAK_MARKERS are non-empty', () => {
    expect(groundedness.CLAIM_MARKERS.length).toBeGreaterThan(5);
    expect(groundedness.EVIDENCE_MARKERS.length).toBeGreaterThan(5);
    expect(groundedness.WEAK_MARKERS.length).toBeGreaterThan(3);
  });
  test('splitIntoSentences splits on sentence terminators', () => {
    const out = groundedness.splitIntoSentences('First sentence. Second sentence! Third? Done.');
    expect(out.length).toBe(4);
  });
  test('classifySentence flags supported / weak / unsupported / inert', () => {
    expect(groundedness.classifySentence('We have deployed at 50+ federal agencies as shown in attached past performance.')).toBe('supported');
    expect(groundedness.classifySentence('We believe we have proven capability in this area.')).toBe('weak');
    expect(groundedness.classifySentence('We have unique proprietary technology with industry-leading results.')).toBe('unsupported');
    expect(groundedness.classifySentence('The weather is nice today.')).toBe('inert');
  });
  test('hasMarker is case-insensitive substring match', () => {
    expect(groundedness.hasMarker('We DELIVER on time', groundedness.CLAIM_MARKERS)).toBe(true);
    expect(groundedness.hasMarker('Sunshine forever', groundedness.CLAIM_MARKERS)).toBe(false);
  });
});

describe('Phase 14 — strategicCoherence', () => {
  test('CONTRADICTION_PAIRS is a non-empty list of pairs', () => {
    expect(strategicCoherence.CONTRADICTION_PAIRS.length).toBeGreaterThan(3);
    for (const p of strategicCoherence.CONTRADICTION_PAIRS) {
      expect(Array.isArray(p)).toBe(true);
      expect(p.length).toBe(2);
    }
  });
  test('detectContradictions flags both phrases co-occurring', () => {
    const out = strategicCoherence.detectContradictions('We are the low cost premium solution');
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ a: 'low cost', b: 'premium' });
  });
  test('detectContradictions empty when no pair matches', () => {
    expect(strategicCoherence.detectContradictions('Nothing weird here')).toEqual([]);
  });
  test('detectPursuitAlignment scores priority + differentiator hits', () => {
    const out = strategicCoherence.detectPursuitAlignment({
      content: 'Our team brings federal compliance and 8a certified status.',
      captureContext: {
        evaluator_priorities: ['federal compliance', 'on-time delivery'],
        differentiators: ['8a certified', 'local presence'],
      },
    });
    expect(out.score).toBeGreaterThan(40);
  });
  test('detectPursuitAlignment returns neutral when no capture context', () => {
    const out = strategicCoherence.detectPursuitAlignment({ content: 'anything', captureContext: null });
    expect(out.score).toBe(50);
  });
  test('detectReadinessAlignment is 100 when no blockers', () => {
    const out = strategicCoherence.detectReadinessAlignment({ content: 'x', readinessBlockers: [] });
    expect(out.score).toBe(100);
  });
});

describe('Phase 14 — evaluatorAlignment', () => {
  test('normalize lowercases + strips non-alphanumeric', () => {
    expect(evaluatorAlignment.normalize('  Federal Compliance!  ')).toBe('federal compliance');
    expect(evaluatorAlignment.normalize('  $@!  ')).toBe('');
  });
  test('matches finds the priority prefix in content', () => {
    expect(evaluatorAlignment.matches('federal compliance training', 'we provide Federal Compliance services')).toBe(true);
    expect(evaluatorAlignment.matches('zzzzzzzzz', 'nothing relevant')).toBe(false);
  });
  test('matches rejects too-short priorities', () => {
    expect(evaluatorAlignment.matches('x', 'anything content')).toBe(false);
  });
});

describe('Phase 14 — lineageEdgeWriter', () => {
  test('helpers object exposes the expected hot-path helpers', () => {
    for (const fn of ['pursuitActivated', 'captureStrategyBuilt', 'complianceMatrixBuilt',
      'draftGenerated', 'packageAssembled', 'workflowAssigned',
      'slaActionTaken', 'queueEnqueued']) {
      expect(typeof lineageEdgeWriter.helpers[fn]).toBe('function');
    }
  });
  test('emit soft-fails on missing required fields', async () => {
    const out = await lineageEdgeWriter.emit({});
    expect(out.provenance).toBeNull();
    expect(out.edge).toBeNull();
  });
});
