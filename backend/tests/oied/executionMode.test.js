// OIED v9 - Execution Mode service unit tests.

const em = require('../../src/oied/executionMode.service');

function fakeOpp(over = {}) {
  return {
    id: over.id || 1,
    title: over.title || 'Test RFP',
    description: over.description || 'Standard test description.',
    category: over.category || 'IT Services',
    value: over.value != null ? over.value : 250_000,
    fitScore: over.fitScore != null ? over.fitScore : 60,
    location: over.location || null,
    sourceData: over.sourceData != null ? over.sourceData : {},
    aiAnalysis: over.aiAnalysis || {},
  };
}

const profileNone = null;
const profileColaberry = {
  services: ['ai-systems', 'data-analytics', 'staffing', 'compliance', 'consulting', 'it-services', 'automation', 'data-science'],
  industries: ['IT Services', 'Data & Analytics', 'Staffing', 'Compliance'],
  pastWins: [],
};
const groundingOk = {
  status: 'ok',
  agency_name: 'U3P',
  solicitation_id: 'Santaquin-06',
  scope_summary: 'Long enough scope summary describing the procurement scope and what the buyer wants.',
};

describe('executionMode.computeExecutionMode - direct_submit', () => {
  it('AI/IT opp with no blockers + direct keyword -> direct_submit', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'AI Data Analytics Platform',
        description: 'Need an artificial intelligence platform with machine learning for data science workflows.',
        category: 'IT Services',
      }),
      profile: profileColaberry,
    });
    expect(out.execution_mode).toBe('direct_submit');
    expect(out.partner_profile).toBeNull();
    expect(out.outreach_ready).toBe(false);
  });

  it('strong profile overlap (>= 2 services match category) + no blockers -> direct_submit', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Generic services RFP',
        description: 'A generic procurement notice with no detail.',
        category: 'IT Services',
        aiAnalysis: { ai_category: 'Data Analytics', recommended_product: 'IT Services' },
      }),
      profile: profileColaberry,
    });
    expect(out.execution_mode).toBe('direct_submit');
  });

  it('empty description + empty profile -> direct_submit (conservative default)', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({ title: 'X', description: '', category: 'X' }),
      profile: profileNone,
    });
    expect(out.execution_mode).toBe('direct_submit');
  });
});

describe('executionMode.computeExecutionMode - partner_required', () => {
  it('opp 11048-shape (curbside waste collection) -> partner_required, industry=waste_management', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        id: 11048,
        title: 'Curbside Solid Waste and Recyclable Collection and Disposal Services',
        description: 'The project involves providing curbside solid waste and recyclable collection and disposal services. Vendors would typically be waste management companies. Includes regular collection schedules, disposal methods, and recycling processes. Contract requires data reporting, staffing, and compliance with EPA regulations.',
        category: 'Field Services',
        value: 500_000,
        sourceData: { agency: 'U3P (utah)' },
      }),
      profile: profileColaberry,
      grounding: { ...groundingOk, solicitation_id: 'Santaquin-06' },
    });
    expect(out.execution_mode).toBe('partner_required');
    expect(out.partner_profile).not.toBeNull();
    expect(out.partner_profile.industry).toBe('waste_management');
    expect(out.partner_profile.geography).toBe('Utah');
    expect(out.partner_profile.size_band).toBe('regional_mid_market');
    expect(out.partner_profile.capabilities_needed).toContain('fleet_and_collection_operations');
    expect(out.outreach_ready).toBe(true);
  });

  it('roofing/construction opp -> partner_required, industry=construction', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'DFCM Construction - Prequalified Roofing Stage II - Roof Replacement',
        description: 'General contractor sought for a roof replacement and concrete work. Bidders should provide compliance documentation and reporting on personnel and training.',
        category: 'Construction',
        value: 500_000,
        sourceData: { agency: 'U3P (utah)' },
      }),
      profile: profileColaberry,
    });
    expect(out.execution_mode).toBe('partner_required');
    expect(out.partner_profile.industry).toBe('construction');
    expect(out.partner_profile.capabilities_needed).toContain('field_construction_workforce');
  });

  it('partner_profile.colaberry_contribution uses approvedAssets display services when supplied', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Curbside waste collection services',
        description: 'Need waste collection. Compliance training and data analytics required.',
        sourceData: { agency: 'U3P (utah)' },
      }),
      approvedAssets: { services: ['AI Systems', 'AI-Augmented Staffing', 'Data Analytics', 'Compliance & Audit'] },
      profile: profileColaberry,
    });
    expect(out.partner_profile.colaberry_contribution).toContain('AI Systems');
    expect(out.partner_profile.colaberry_contribution).toContain('Data Analytics');
  });

  it('partner_profile.colaberry_contribution falls back to support-keyword synthesis when approvedAssets empty', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Curbside waste collection',
        description: 'Need waste collection. Staffing, training, and compliance required.',
      }),
      approvedAssets: { services: [] },
    });
    expect(out.partner_profile.colaberry_contribution.length).toBeGreaterThan(0);
    expect(out.partner_profile.colaberry_contribution).toEqual(
      expect.arrayContaining(['AI-Augmented Staffing', 'Compliance & Audit'])
    );
  });

  it('outreach_ready=false when grounding.scope_summary missing', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Curbside waste collection',
        description: 'Waste pickup with data reporting and staffing.',
        sourceData: { agency: 'U3P (utah)' },
      }),
      profile: profileColaberry,
      grounding: { status: 'ok', agency_name: 'U3P', solicitation_id: 'X', scope_summary: null },
    });
    expect(out.execution_mode).toBe('partner_required');
    expect(out.outreach_ready).toBe(false);
  });

  it('outreach_ready=false when grounding.solicitation_id missing', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Curbside waste collection',
        description: 'Waste pickup with data reporting and staffing.',
        sourceData: { agency: 'U3P (utah)' },
      }),
      profile: profileColaberry,
      grounding: { ...groundingOk, solicitation_id: null },
    });
    expect(out.outreach_ready).toBe(false);
  });

  it('outreach_ready=false when partner_profile.geography is null', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Curbside waste collection',
        description: 'Waste pickup with data reporting and staffing.',
        // no sourceData.agency, no location -> geography=null
      }),
      profile: profileColaberry,
      grounding: groundingOk,
    });
    expect(out.execution_mode).toBe('partner_required');
    expect(out.partner_profile.geography).toBeNull();
    expect(out.outreach_ready).toBe(false);
  });
});

describe('executionMode.computeExecutionMode - ignore', () => {
  it('blockers present + no support overlap -> ignore', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Snow removal and pest control',
        description: 'Pure snow removal and pest control work for the agency campus.',
      }),
    });
    expect(out.execution_mode).toBe('ignore');
    expect(out.partner_profile).toBeNull();
  });

  it('food service catering with no support layer -> ignore', () => {
    const out = em.computeExecutionMode({
      opp: fakeOpp({
        title: 'Food service catering for events',
        description: 'Catering and food service for the agency.',
      }),
    });
    expect(out.execution_mode).toBe('ignore');
  });
});

describe('executionMode.deriveGeography', () => {
  it('parses agency suffix (utah)', () => {
    expect(em.deriveGeography({ opp: { sourceData: { agency: 'U3P (utah)' } } })).toBe('Utah');
  });
  it('parses agency suffix (detroit)', () => {
    expect(em.deriveGeography({ opp: { sourceData: { agency: 'City of Detroit (detroit)' } } })).toBe('Michigan (Detroit)');
  });
  it('falls back to opp.location when sourceData.agency has no slug', () => {
    expect(em.deriveGeography({ opp: { sourceData: { agency: 'Plain Agency' }, location: 'Austin, TX' } })).toBe('TX');
  });
  it('returns null when nothing parseable', () => {
    expect(em.deriveGeography({ opp: {} })).toBeNull();
  });
});

describe('executionMode.deriveSizeBand', () => {
  it('< $100k -> regional_small', () => { expect(em.deriveSizeBand({ value: 50_000 })).toBe('regional_small'); });
  it('$500k -> regional_mid_market', () => { expect(em.deriveSizeBand({ value: 500_000 })).toBe('regional_mid_market'); });
  it('>= $5M -> any (national-scale primes acceptable)', () => { expect(em.deriveSizeBand({ value: 8_000_000 })).toBe('any'); });
  it('zero/null -> any', () => {
    expect(em.deriveSizeBand({ value: 0 })).toBe('any');
    expect(em.deriveSizeBand({ value: null })).toBe('any');
  });
});

describe('executionMode.capabilitiesNeededFor', () => {
  it('returns waste-management capabilities', () => {
    expect(em.capabilitiesNeededFor('waste_management')).toContain('fleet_and_collection_operations');
  });
  it('returns construction capabilities', () => {
    expect(em.capabilitiesNeededFor('construction')).toContain('field_construction_workforce');
  });
  it('returns generic capabilities for unknown industry', () => {
    expect(em.capabilitiesNeededFor('unknown')).toContain('operational_delivery_capability');
  });
});
