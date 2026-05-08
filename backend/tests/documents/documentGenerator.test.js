// v0.3 — documentGenerator service tests. Mocks the AI client + storage
// + the Document model so we can exercise the dual-write (local + global
// rows linked by lineage_id), the not-generatable guard, and the prompt
// assembly without hitting OpenAI or disk.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Document: { create: jest.fn(), findOne: jest.fn() },
  BonfireOpportunity: { findByPk: jest.fn() },
}));
jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', chat: jest.fn() };
  return { getAIClient: () => client, __client: client };
});
jest.mock('../../src/documents/storage.adapter', () => ({
  writeBuffer: jest.fn(async ({ originalName }) => ({
    filePath: 'fake/path/' + originalName.replace(/\s+/g, '_'),
    sizeBytes: 1234,
  })),
}));
jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
  getOrDefaultByOrg: jest.fn(async () => ({
    services: ['ai-systems', 'data-analytics'],
    industries: ['healthcare'],
    tools: ['python', 'snowflake'],
    pastWins: ['DHA compliance audit', 'HHS EHR integration'],
  })),
}));

const { Document, BonfireOpportunity } = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');
const storage = require('../../src/documents/storage.adapter');
const svc = require('../../src/documents/documentGenerator.service');

beforeEach(() => {
  Document.create.mockReset().mockImplementation(async (row) => ({ ...row, id: 'doc-' + Math.random().toString(36).slice(2, 8), toJSON: () => ({ ...row }) }));
  Document.findOne.mockReset().mockResolvedValue(null);
  BonfireOpportunity.findByPk.mockReset();
  aiMod.__client.chat.mockReset();
  storage.writeBuffer.mockClear();
});

describe('documentGenerator.generateDocument', () => {
  it('rejects non-generatable types with NOT_GENERATABLE', async () => {
    await expect(svc.generateDocument({ type: 'w9', organizationId: 1 }))
      .rejects.toMatchObject({ code: 'NOT_GENERATABLE' });
  });
  it('rejects unknown types', async () => {
    await expect(svc.generateDocument({ type: 'made_up_type', organizationId: 1 }))
      .rejects.toMatchObject({ code: 'NOT_GENERATABLE' });
  });

  it('without bonfireOpportunityId: writes only the global row (no local)', async () => {
    aiMod.__client.chat.mockResolvedValue({
      content: '# EEO Statement\n\nWe affirm equal opportunity employment.',
      tokensUsed: 200,
    });
    const out = await svc.generateDocument({ type: 'eeo_statement', organizationId: 1 });
    expect(Document.create).toHaveBeenCalledTimes(1);
    const created = Document.create.mock.calls[0][0];
    expect(created.scope).toBe('global');
    expect(created.scopeId).toBeNull();
    expect(created.source).toBe('ai_generated');
    expect(created.lineageId).toBeTruthy();
    expect(out.local).toBeNull();
    expect(out.global).toBeTruthy();
  });

  it('with bonfireOpportunityId: writes BOTH local and global rows sharing a lineage_id', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue({
      id: 'opp-uuid', title: 'DHA Roof RFP', agency: 'DHA', description: 'Roof replacement project.',
    });
    aiMod.__client.chat.mockResolvedValue({
      content: '# Cover Letter\n\nDear DHA,\n\nWe respectfully submit our proposal...',
      tokensUsed: 350,
    });
    const out = await svc.generateDocument({
      type: 'cover_letter_template',
      organizationId: 1,
      bonfireOpportunityId: 'opp-uuid',
      userId: 7,
    });
    expect(Document.create).toHaveBeenCalledTimes(2);
    const localCall = Document.create.mock.calls[0][0];
    const globalCall = Document.create.mock.calls[1][0];
    // First write is local
    expect(localCall.scope).toBe('bid');
    expect(localCall.scopeId).toBe('opp-uuid');
    expect(localCall.source).toBe('ai_generated');
    // Second write is global
    expect(globalCall.scope).toBe('global');
    expect(globalCall.scopeId).toBeNull();
    expect(globalCall.source).toBe('ai_generated');
    // Both share the same lineage_id
    expect(localCall.lineageId).toBeTruthy();
    expect(localCall.lineageId).toBe(globalCall.lineageId);
    // Global row carries opp metadata so we can analyze later
    expect(globalCall.metadata.bonfire_opportunity_id).toBe('opp-uuid');
    expect(globalCall.metadata.bonfire_opportunity_title).toBe('DHA Roof RFP');
    // Two physical files written
    expect(storage.writeBuffer).toHaveBeenCalledTimes(2);
  });

  it('throws NOT_FOUND when bonfireOpportunityId points to a missing opp', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(null);
    await expect(svc.generateDocument({
      type: 'eeo_statement', organizationId: 1, bonfireOpportunityId: 'missing',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('AI failure becomes AI_FAILED', async () => {
    aiMod.__client.chat.mockRejectedValue(new Error('rate limit'));
    await expect(svc.generateDocument({ type: 'eeo_statement', organizationId: 1 }))
      .rejects.toMatchObject({ code: 'AI_FAILED' });
    expect(Document.create).not.toHaveBeenCalled();
  });

  it('empty AI content is rejected', async () => {
    aiMod.__client.chat.mockResolvedValue({ content: '   \n  ', tokensUsed: 50 });
    await expect(svc.generateDocument({ type: 'eeo_statement', organizationId: 1 }))
      .rejects.toMatchObject({ code: 'EMPTY_CONTENT' });
    expect(Document.create).not.toHaveBeenCalled();
  });

  it('global version increments based on existing global rows', async () => {
    Document.findOne.mockResolvedValueOnce({ version: 7 }); // simulate existing global v7
    aiMod.__client.chat.mockResolvedValue({ content: 'content', tokensUsed: 100 });
    await svc.generateDocument({ type: 'eeo_statement', organizationId: 1 });
    const globalCall = Document.create.mock.calls[0][0];
    expect(globalCall.version).toBe(8);
  });
});

describe('documentGenerator.buildUserPrompt', () => {
  it('includes opportunity context when opp is provided', () => {
    const prompt = svc.buildUserPrompt({
      type: 'cover_letter_template',
      opp: { title: 'AI Pilot', agency: 'DHA', description: 'Build an AI pilot.' },
      profile: { services: ['ai-systems'] },
    });
    expect(prompt).toMatch(/AI Pilot/);
    expect(prompt).toMatch(/DHA/);
    expect(prompt).toMatch(/ai-systems/);
  });
  it('omits the opportunity block when opp is null', () => {
    const prompt = svc.buildUserPrompt({
      type: 'eeo_statement',
      opp: null,
      profile: { services: ['data-analytics'] },
    });
    expect(prompt).not.toMatch(/Procurement opportunity context/);
    expect(prompt).toMatch(/data-analytics/);
  });
});
