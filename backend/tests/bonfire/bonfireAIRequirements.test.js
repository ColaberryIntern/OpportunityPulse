// v0.2 — bonfireAIRequirements service tests. Mocks the AI client + the
// BonfireOpportunity model so we can exercise prompt assembly, JSON
// validation, caching, and merging without a real LLM call.

jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: { findByPk: jest.fn() },
  Document: {},
}));
jest.mock('../../src/analysis/ai.client', () => {
  const client = {
    model: 'gpt-4o-mini',
    chat: jest.fn(),
  };
  return { getAIClient: () => client, __client: client };
});

const { BonfireOpportunity } = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');
const svc = require('../../src/bonfire/bonfireAIRequirements.service');

beforeEach(() => {
  BonfireOpportunity.findByPk.mockReset();
  aiMod.__client.chat.mockReset();
});

describe('bonfireAIRequirements.validateAndFilter', () => {
  it('drops items with no source_quote (hard rule)', () => {
    const out = svc.validateAndFilter({
      additional_required: [
        { type: 'cert_bid_bond', confidence: 0.9, reason: 'r' /* no quote */ },
        { type: 'cert_bid_bond', confidence: 0.9, reason: 'r', source_quote: 'Bid bond ≥ 5% required.' },
      ],
    });
    expect(out.additional_required).toHaveLength(1);
    expect(out.additional_required[0].type).toBe('cert_bid_bond');
  });
  it('drops items with type keys not in the canonical flaggable list', () => {
    const out = svc.validateAndFilter({
      additional_required: [
        { type: 'made_up_type', confidence: 0.9, source_quote: 'q', reason: 'r' },
        { type: 'cert_payment_bond', confidence: 0.8, source_quote: 'Payment bond required', reason: 'r' },
      ],
    });
    expect(out.additional_required.map((i) => i.type)).toEqual(['cert_payment_bond']);
  });
  it('keeps "other" entries with name_if_other', () => {
    const out = svc.validateAndFilter({
      additional_required: [
        { type: 'other', name_if_other: 'Vendor Disclosure Form', confidence: 0.7, source_quote: 'See § 5', reason: 'Required disclosure' },
      ],
    });
    expect(out.additional_required[0].type).toBe('other');
    expect(out.additional_required[0].name_if_other).toBe('Vendor Disclosure Form');
  });
  it('clamps confidence into [0,1]', () => {
    const out = svc.validateAndFilter({
      additional_required: [
        { type: 'eeo_statement', confidence: 5, source_quote: 'EEO required', reason: 'r' },
        { type: 'safety_program', confidence: -0.5, source_quote: 'OSHA record', reason: 'r' },
      ],
    });
    expect(out.additional_required[0].confidence).toBe(1);
    expect(out.additional_required[1].confidence).toBe(0);
  });
  it('returns empty list on missing/malformed input', () => {
    expect(svc.validateAndFilter(null).additional_required).toEqual([]);
    expect(svc.validateAndFilter({}).additional_required).toEqual([]);
    expect(svc.validateAndFilter({ additional_required: 'nope' }).additional_required).toEqual([]);
  });
});

describe('bonfireAIRequirements.buildUserPrompt', () => {
  it('lists every flaggable type so AI is bounded', () => {
    const prompt = svc.buildUserPrompt({ title: 'X', description: 'Y' });
    expect(prompt).toMatch(/Available types/);
    expect(prompt).toMatch(/cert_bid_bond/);
    expect(prompt).toMatch(/eeo_statement/);
    // Baselines must NOT appear in the available list — they're already required.
    expect(prompt).not.toMatch(/cover_letter_template/);
  });
});

describe('bonfireAIRequirements.tailorRequirements', () => {
  function makeOpp(overrides = {}) {
    const opp = Object.assign({
      id: 'opp-1',
      title: 'Sample',
      description: 'desc',
      rawText: '',
      overview: '',
      submissionRequirements: null,
      save: jest.fn(async function () { return this; }),
    }, overrides);
    return opp;
  }

  it('returns cached result when present and force=false', async () => {
    const cached = { generated_at: new Date().toISOString(), additional_required: [], summary: 'cached' };
    const opp = makeOpp({ submissionRequirements: cached });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.tailorRequirements({ opportunityId: 'opp-1' });
    expect(out.summary).toBe('cached');
    expect(aiMod.__client.chat).not.toHaveBeenCalled();
    expect(opp.save).not.toHaveBeenCalled();
  });

  it('calls the AI and persists the result on first run', async () => {
    const opp = makeOpp();
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({
        additional_required: [
          { type: 'cert_bid_bond', confidence: 0.9, reason: 'Bid bond required', source_quote: 'Bid bond of 5% required.' },
        ],
        summary: 'Bid bond is the only non-baseline requirement.',
      }),
      tokensUsed: 800,
    });
    const out = await svc.tailorRequirements({ opportunityId: 'opp-1' });
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1);
    expect(out.additional_required).toHaveLength(1);
    expect(out.additional_required[0].type).toBe('cert_bid_bond');
    expect(opp.save).toHaveBeenCalledTimes(1);
    expect(opp.submissionRequirements).toBe(out);
  });

  it('regenerates when force=true even if cache exists', async () => {
    const opp = makeOpp({ submissionRequirements: { generated_at: '2026-01-01', additional_required: [], summary: 'old' } });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({ additional_required: [], summary: 'new' }),
      tokensUsed: 200,
    });
    const out = await svc.tailorRequirements({ opportunityId: 'opp-1', force: true });
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1);
    expect(out.summary).toBe('new');
    expect(opp.save).toHaveBeenCalledTimes(1);
  });

  it('persists a stub with error when AI fails', async () => {
    const opp = makeOpp();
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    aiMod.__client.chat.mockRejectedValue(new Error('rate-limited'));
    const out = await svc.tailorRequirements({ opportunityId: 'opp-1' });
    expect(out.error).toMatch(/rate-limited/);
    expect(out.additional_required).toEqual([]);
    expect(opp.save).toHaveBeenCalledTimes(1);
  });

  it('handles non-JSON AI output gracefully', async () => {
    const opp = makeOpp();
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    aiMod.__client.chat.mockResolvedValue({ content: 'not json at all', tokensUsed: 100 });
    const out = await svc.tailorRequirements({ opportunityId: 'opp-1' });
    expect(out.additional_required).toEqual([]);
    expect(opp.save).toHaveBeenCalledTimes(1);
  });

  it('throws NOT_FOUND when opp is missing', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(null);
    await expect(svc.tailorRequirements({ opportunityId: 'missing' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('bonfireAIRequirements.computeAdditionalRequiredTypes', () => {
  it('filters by confidence threshold', () => {
    const reqs = {
      additional_required: [
        { type: 'cert_bid_bond', confidence: 0.9, reason: 'r', source_quote: 'q' },
        { type: 'eeo_statement', confidence: 0.3, reason: 'r', source_quote: 'q' },
      ],
    };
    const out = svc.computeAdditionalRequiredTypes(reqs, { confidenceThreshold: 0.5 });
    expect(out.map((i) => i.type)).toEqual(['cert_bid_bond']);
  });
  it('returns empty when input is null/empty', () => {
    expect(svc.computeAdditionalRequiredTypes(null)).toEqual([]);
    expect(svc.computeAdditionalRequiredTypes({})).toEqual([]);
    expect(svc.computeAdditionalRequiredTypes({ additional_required: [] })).toEqual([]);
  });
});
