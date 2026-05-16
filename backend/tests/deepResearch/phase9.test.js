// Deep Research Phase 9 — pure-logic tests across the new services.

const rfpAttachment = require('../../src/deepResearch/rfpAttachment.service');
const proposalArtifact = require('../../src/deepResearch/proposalArtifact.service');
const complianceMatrix = require('../../src/deepResearch/complianceMatrix.service');
const submissionPackage = require('../../src/deepResearch/submissionPackage.service');
const proposalTimeline = require('../../src/deepResearch/proposalTimeline.service');
const complianceGap = require('../../src/deepResearch/complianceGap.service');
const submissionReadinessEngine = require('../../src/deepResearch/submissionReadinessEngine.service');
const parallelDraftQueue = require('../../src/deepResearch/parallelDraftQueue.service');
const pursuitContextInjector = require('../../src/deepResearch/pursuitContextInjector.service');

describe('rfpAttachment.VALID_KINDS', () => {
  it('exposes the 8 attachment kinds', () => {
    expect(rfpAttachment.VALID_KINDS).toEqual(expect.arrayContaining([
      'rfp', 'amendment', 'attachment', 'compliance_doc', 'supporting',
      'qa_response', 'past_proposal', 'other',
    ]));
  });
});

describe('rfpAttachment.detectMissingKinds', () => {
  it('flags missing rfp + attachment when both absent', () => {
    expect(rfpAttachment.detectMissingKinds({ by_kind: {} }))
      .toEqual(['rfp', 'attachment']);
  });
  it('returns empty when both required kinds are present', () => {
    expect(rfpAttachment.detectMissingKinds({ by_kind: { rfp: 1, attachment: 3 } }))
      .toEqual([]);
  });
});

describe('proposalArtifact.VALID_KINDS', () => {
  it('whitelists the 9 artifact kinds', () => {
    expect(proposalArtifact.VALID_KINDS).toEqual(expect.arrayContaining([
      'resume', 'case_study', 'past_performance', 'certification',
      'boilerplate', 'diagram', 'capability_statement', 'reference', 'template',
    ]));
  });
});

describe('complianceMatrix.parseRfpText', () => {
  it('falls back to the default template for empty input', () => {
    const { items } = complianceMatrix.parseRfpText('');
    expect(items.length).toBe(complianceMatrix.DEFAULT_TEMPLATE.length);
  });
  it('detects SAM.gov + capability statement + key personnel', () => {
    const rfp = 'Submit via SAM.gov. Include a capability statement and identify all key personnel.';
    const { items } = complianceMatrix.parseRfpText(rfp);
    const labels = items.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes('sam.gov'))).toBe(true);
    expect(labels.some((l) => l.includes('capability statement'))).toBe(true);
    expect(labels.some((l) => l.includes('key personnel'))).toBe(true);
  });
  it('extracts SF form references', () => {
    const { items } = complianceMatrix.parseRfpText('Use SF-1449 cover sheet and SF-330 for past performance.');
    const labels = items.map((i) => i.label.toLowerCase());
    expect(labels.some((l) => l.includes('sf-1449'))).toBe(true);
    expect(labels.some((l) => l.includes('sf-330'))).toBe(true);
  });
  it('extracts page limit instruction', () => {
    const { items, constraints } = complianceMatrix.parseRfpText('The technical narrative has a page limit of 30 pages.');
    expect(items.some((i) => i.itemKind === 'instruction')).toBe(true);
    expect(constraints.page_limit_text).toMatch(/page\s+limit/);
  });
});

describe('complianceMatrix.rollUp', () => {
  it('computes completion_pct correctly', () => {
    const out = complianceMatrix.rollUp([
      { status: 'satisfied' }, { status: 'satisfied' },
      { status: 'partial' }, { status: 'missing' },
    ]);
    expect(out.satisfiedCount).toBe(2);
    expect(out.partialCount).toBe(1);
    expect(out.missingCount).toBe(1);
    // 2 satisfied + 0.5*1 partial = 2.5 / 4 = 62.5 → 63 (rounded).
    expect(out.completionPct).toBe(63);
  });
  it('returns 0 completion for empty input', () => {
    expect(complianceMatrix.rollUp([]).completionPct).toBe(0);
  });
});

describe('submissionPackage.computeCompleteness', () => {
  it('penalizes empty package heavily', () => {
    const out = submissionPackage.computeCompleteness({
      outputCount: 0, attachmentCount: 0, artifactCounts: {},
      complianceCompletionPct: null,
    });
    expect(out.score).toBe(0);
    expect(out.missing.length).toBeGreaterThan(2);
  });
  it('credits ready package fully', () => {
    const out = submissionPackage.computeCompleteness({
      outputCount: 2, attachmentCount: 3,
      artifactCounts: { capability_statement: 1, past_performance: 1 },
      complianceCompletionPct: 100,
    });
    expect(out.score).toBe(100);
    expect(out.missing).toEqual([]);
  });
  it('partial credit for partial compliance completion', () => {
    const out = submissionPackage.computeCompleteness({
      outputCount: 1, attachmentCount: 1,
      artifactCounts: { capability_statement: 1, past_performance: 1 },
      complianceCompletionPct: 50,
    });
    // 30 + 15 + 15 + 15 + ceil(50*25/100)=13 (rounded) → 88
    expect(out.score).toBeGreaterThanOrEqual(85);
    expect(out.score).toBeLessThanOrEqual(90);
  });
});

describe('proposalTimeline.VALID_EVENT_KINDS', () => {
  it('exposes 8 event kinds', () => {
    expect(proposalTimeline.VALID_EVENT_KINDS).toEqual(expect.arrayContaining([
      'milestone', 'draft', 'compliance', 'artifact',
      'staffing', 'blocker', 'submission', 'note',
    ]));
  });
});

describe('complianceGap.severityForItem', () => {
  it('boosts severity for critical matrix items', () => {
    const normal = complianceGap.severityForItem({ gapKind: 'missing_form', itemSeverity: 'normal' });
    const critical = complianceGap.severityForItem({ gapKind: 'missing_form', itemSeverity: 'critical' });
    expect(critical).toBeGreaterThan(normal);
  });
  it('uses the base severity for each gap_kind', () => {
    expect(complianceGap.severityForItem({ gapKind: 'missing_certification' })).toBe(80);
    expect(complianceGap.severityForItem({ gapKind: 'weak_capability' })).toBe(55);
  });
});

describe('complianceGap.recommendedActionsFor', () => {
  it('returns specific actions per gap_kind', () => {
    const cert = complianceGap.recommendedActionsFor('missing_certification', 'Security clearance');
    expect(cert.length).toBeGreaterThan(0);
    expect(cert.some((a) => /Upload current certification/.test(a))).toBe(true);
    const expired = complianceGap.recommendedActionsFor('expired_artifact', 'COI');
    expect(expired.some((a) => /Refresh expired artifact/.test(a))).toBe(true);
  });
});

describe('submissionReadinessEngine.WEIGHTS', () => {
  it('sums to 100 across the 7 dimensions', () => {
    const sum = Object.values(submissionReadinessEngine.WEIGHTS).reduce((s, n) => s + n, 0);
    expect(sum).toBe(100);
  });
});

describe('submissionReadinessEngine.classify', () => {
  it('ready when composite >= 80 and few blockers', () => {
    expect(submissionReadinessEngine.classify(85, 0)).toBe('ready');
  });
  it('blocked when 3+ blockers', () => {
    expect(submissionReadinessEngine.classify(90, 3)).toBe('blocked');
  });
  it('blocked when composite < 35', () => {
    expect(submissionReadinessEngine.classify(30, 0)).toBe('blocked');
  });
  it('needs_prep in the middle band', () => {
    expect(submissionReadinessEngine.classify(60, 0)).toBe('needs_prep');
  });
});

describe('parallelDraftQueue.SUPPORTED_TYPES', () => {
  it('whitelists proposal/offer/analysis only', () => {
    expect(parallelDraftQueue.SUPPORTED_TYPES.has('proposal')).toBe(true);
    expect(parallelDraftQueue.SUPPORTED_TYPES.has('offer')).toBe(true);
    expect(parallelDraftQueue.SUPPORTED_TYPES.has('analysis')).toBe(true);
    expect(parallelDraftQueue.SUPPORTED_TYPES.has('garbage')).toBe(false);
  });
});

describe('parallelDraftQueue.newBatchId', () => {
  it('returns a unique-looking batch id with the b_ prefix', () => {
    const a = parallelDraftQueue.newBatchId();
    const b = parallelDraftQueue.newBatchId();
    expect(a).toMatch(/^b_[a-f0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe('parallelDraftQueue.MAX_CONCURRENCY', () => {
  it('caps at 8', () => {
    expect(parallelDraftQueue.MAX_CONCURRENCY).toBe(8);
  });
});

describe('pursuitContextInjector.composeContextBlock', () => {
  it('returns empty string for null context', () => {
    expect(pursuitContextInjector.composeContextBlock(null)).toBe('');
  });
  it('returns empty string when pursuit is missing', () => {
    expect(pursuitContextInjector.composeContextBlock({})).toBe('');
  });
  it('includes the pursuit name and the no-auto-submission note', () => {
    const block = pursuitContextInjector.composeContextBlock({
      pursuit: { name: 'Test pursuit', linkedOpportunityIds: [] },
    });
    expect(block).toContain('Test pursuit');
    expect(block).toContain('NO auto-submission');
  });
  it('renders capture narrative + linked opportunities when present', () => {
    const block = pursuitContextInjector.composeContextBlock({
      pursuit: { name: 'P', linkedOpportunityIds: [1, 2] },
      capture: {
        narrative: 'Capture narrative text.',
        evaluatorPriorities: [{ label: 'Emphasize NAICS 541512' }],
        agencyPainPoints: [{ label: 'Budget under $100k' }],
        differentiators: [{ label: 'Open-source angle' }],
      },
      opps: [
        { id: 1, type: 'gov_contract', title: 'Title 1', value: 250_000 },
        { id: 2, type: 'bonfire', title: 'Title 2' },
      ],
      assets: [
        { assetKind: 'past_win', label: 'Past win A' },
      ],
      readiness: { blockers: ['Staffing gap'] },
    });
    expect(block).toContain('Capture narrative text');
    expect(block).toContain('Emphasize NAICS');
    expect(block).toContain('Title 1');
    expect(block).toContain('past_win: Past win A');
    expect(block).toContain('Staffing gap');
  });
});

describe('pursuitContextInjector.fmtList', () => {
  it('truncates to max items + prefixes each line', () => {
    const out = pursuitContextInjector.fmtList(['a', 'b', 'c', 'd', 'e', 'f'], { max: 3 });
    expect(out.split('\n')).toHaveLength(3);
    expect(out.split('\n')[0]).toMatch(/^- /);
  });
});
