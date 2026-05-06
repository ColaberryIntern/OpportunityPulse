// OIED v9 - Partner service unit tests.

const partner = require('../../src/oied/partner.service');

const baseOpp = {
  id: 11048,
  title: 'Curbside Solid Waste and Recyclable Collection Services',
  sourceData: { agency: 'U3P (utah)' },
  sourceId: 'bonfire:agency:utah:Santaquin-06',
};

const basePartnerProfile = {
  geography: 'Utah',
  size_band: 'regional_mid_market',
  industry: 'waste_management',
  capabilities_needed: ['fleet_and_collection_operations', 'transfer_station_relationships'],
  colaberry_contribution: ['AI-Augmented Staffing', 'Data Analytics', 'Compliance & Audit'],
  avoid: ['national_scale_primes_with_internal_capability'],
};

const baseGrounding = {
  status: 'ok',
  agency_name: 'U3P',
  solicitation_id: 'Santaquin-06',
  scope_summary: 'A long-enough scope summary for outreach drafting purposes.',
};

describe('partner.findCandidatePartners', () => {
  it('returns shape {opportunity_id, partner_profile, candidates: [], note} (v1)', () => {
    const out = partner.findCandidatePartners({ opp: baseOpp, partnerProfile: basePartnerProfile });
    expect(out.opportunity_id).toBe(11048);
    expect(out.partner_profile).toEqual(basePartnerProfile);
    expect(out.candidates).toEqual([]);
    expect(out.note).toMatch(/registry/i);
  });

  it('throws when opp or partnerProfile missing', () => {
    expect(() => partner.findCandidatePartners({ partnerProfile: basePartnerProfile })).toThrow();
    expect(() => partner.findCandidatePartners({ opp: baseOpp })).toThrow();
  });
});

describe('partner.composeOutreachDraft', () => {
  it('embeds agency name + solicitation_id from grounding', () => {
    const out = partner.composeOutreachDraft({
      opp: baseOpp,
      partnerProfile: basePartnerProfile,
      primeName: 'Ace Disposal',
      grounding: baseGrounding,
    });
    expect(out.draft).toMatch(/U3P/);
    expect(out.draft).toMatch(/Santaquin-06/);
    expect(out.prime_name).toBe('Ace Disposal');
    expect(out.geography).toBe('Utah');
  });

  it('lists Colaberry contribution from approvedAssets when supplied', () => {
    const out = partner.composeOutreachDraft({
      opp: baseOpp,
      partnerProfile: basePartnerProfile,
      primeName: 'Regional Waste Co',
      grounding: baseGrounding,
      approvedAssets: { services: ['AI Systems', 'AI-Augmented Staffing', 'Data Analytics'] },
    });
    expect(out.draft).toMatch(/AI Systems/);
    expect(out.draft).toMatch(/Data Analytics/);
  });

  it('does not contain any banned terms (StaffMatch / OpsBot / synergy)', () => {
    const out = partner.composeOutreachDraft({
      opp: baseOpp,
      partnerProfile: basePartnerProfile,
      primeName: 'Ace Disposal',
      grounding: baseGrounding,
    });
    expect(out.banned_terms_detected).toEqual([]);
    expect(out.draft).not.toMatch(/StaffMatch/i);
    expect(out.draft).not.toMatch(/synergy/i);
  });

  it('throws when primeName is empty or missing', () => {
    expect(() => partner.composeOutreachDraft({
      opp: baseOpp, partnerProfile: basePartnerProfile, primeName: '',
    })).toThrow();
    expect(() => partner.composeOutreachDraft({
      opp: baseOpp, partnerProfile: basePartnerProfile,
    })).toThrow();
  });

  it('throws when partnerProfile or opp missing', () => {
    expect(() => partner.composeOutreachDraft({ primeName: 'X' })).toThrow();
    expect(() => partner.composeOutreachDraft({ opp: baseOpp, primeName: 'X' })).toThrow();
  });

  it('includes capabilities_needed in the body so the prime knows what they are filling', () => {
    const out = partner.composeOutreachDraft({
      opp: baseOpp,
      partnerProfile: basePartnerProfile,
      primeName: 'Ace Disposal',
      grounding: baseGrounding,
    });
    expect(out.draft).toMatch(/fleet_and_collection_operations/);
  });
});
