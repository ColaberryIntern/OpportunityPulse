// Deep Research Phase 4 — ventureTemplate.service tests.

const svc = require('../../src/deepResearch/ventureTemplate.service');

describe('ventureTemplate.matchTemplatesForVenture', () => {
  it('matches a venture into multiple templates when keywords overlap', () => {
    const v = { title: 'Government AI Assistant', description: 'Triages constituent requests for agencies.' };
    const keys = svc.matchTemplatesForVenture(v).map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(['ai_assistant', 'gov_intelligence']));
  });
  it('matches workflow_automation', () => {
    const v = { title: 'RPA pipeline', description: 'Automates a back-office workflow.' };
    expect(svc.matchTemplatesForVenture(v).some((t) => t.key === 'workflow_automation')).toBe(true);
  });
  it('returns empty for a venture that matches no template', () => {
    const v = { title: 'Apple pie recipe app', description: 'baking' };
    expect(svc.matchTemplatesForVenture(v)).toEqual([]);
  });
});

describe('ventureTemplate.aggregateMvpScaffold', () => {
  it('counts feature/stack/AI frequencies across multiple plans', () => {
    const plans = [
      { phase1Features: ['Audit log', 'Review queue'], suggestedStack: ['Node', 'Postgres'],
        recommendedAiComponents: ['gpt-4o-mini'], staffing: { roles: ['Tech lead', 'Engineer'], headcount: 2 },
        estimatedTimelineWeeks: 10 },
      { phase1Features: ['Audit log', 'Workflow config'], suggestedStack: ['Node', 'Redis'],
        recommendedAiComponents: ['gpt-4o-mini'], staffing: { roles: ['Tech lead'], headcount: 1 },
        estimatedTimelineWeeks: 8 },
    ];
    const scaffold = svc.aggregateMvpScaffold(plans);
    // "Audit log" is common to both → frequency 2.
    expect(scaffold.common_phase1_features.find((f) => f.item === 'Audit log').frequency).toBe(2);
    expect(scaffold.common_stack.find((s) => s.item === 'Node').frequency).toBe(2);
    expect(scaffold.typical_timeline_weeks).toBeGreaterThan(0);
    expect(scaffold.typical_staffing.typical_headcount).toBeGreaterThan(0);
  });
});

describe('ventureTemplate.aggregateGtmPlaybook', () => {
  it('collects channel frequencies and exemplar ICP/pricing strings', () => {
    const strategies = [
      { channels: ['outbound', 'partnerships'], icp: 'state agencies', pricingStrategy: '$50/seat/mo' },
      { channels: ['outbound', 'PR'], icp: 'municipal agencies' },
    ];
    const playbook = svc.aggregateGtmPlaybook(strategies);
    expect(playbook.common_channels.find((c) => c.item === 'outbound').frequency).toBe(2);
    expect(playbook.sample_icp).toBe('state agencies');
    expect(playbook.sample_pricing).toBe('$50/seat/mo');
  });
});
