jest.mock('../../src/logging/logger', () => ({ info() {}, warn() {}, error() {}, debug() {} }));
const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockChat = jest.fn();
jest.mock('../../src/models', () => ({
  OpportunityAttachment: { findAll: mockFindAll },
  BonfireOpportunity: { findByPk: mockFindByPk },
}));
jest.mock('../../src/analysis/ai.client', () => ({ getAIClient: () => ({ chat: mockChat }) }));

const { deepVetFromDocuments, sanitizeVerdict } = require('../../src/bonfire/documentDeepVet.service');

describe('documentDeepVet.deepVetFromDocuments', () => {
  beforeEach(() => { mockFindAll.mockReset(); mockFindByPk.mockReset(); mockChat.mockReset(); });

  test('skips (no AI call) when there is no parsed RFP text', async () => {
    mockFindAll.mockResolvedValue([]);
    const r = await deepVetFromDocuments(1);
    expect(r.skipped).toBe(true);
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('writes an authoritative no_bid verdict from the AI gate-check', async () => {
    mockFindAll.mockResolvedValue([{ name: 'rfp.pdf', parsedText: 'X'.repeat(800) }]);
    const update = jest.fn();
    mockFindByPk.mockResolvedValue({ id: 1, title: 'Hosted Platform', agency: 'TDHCA', update });
    mockChat.mockResolvedValue({ content: JSON.stringify({ status: 'no_bid', disqualifier: 'CERT_WALL', label: 'TX-RAMP required at submission', evidence: 'vendor must be TX-RAMP certified', confidence: 0.9 }) });
    const r = await deepVetFromDocuments(1);
    expect(r.verdict.status).toBe('no_bid');
    expect(r.verdict.disqualifier).toBe('CERT_WALL');
    expect(r.verdict.auto).toBe(false);
    expect(r.verdict.scorer).toBe('document_deep_vet');
    expect(update).toHaveBeenCalledWith({ vetVerdict: expect.objectContaining({ status: 'no_bid', disqualifier: 'CERT_WALL' }) });
  });

  test('tolerates fenced / wrapped JSON', async () => {
    mockFindAll.mockResolvedValue([{ name: 'a', parsedText: 'Y'.repeat(800) }]);
    mockFindByPk.mockResolvedValue({ update: jest.fn() });
    mockChat.mockResolvedValue({ content: '```json\n{"status":"bid","confidence":0.8}\n```' });
    const r = await deepVetFromDocuments(1);
    expect(r.verdict.status).toBe('bid');
  });

  test('skips gracefully when the AI errors', async () => {
    mockFindAll.mockResolvedValue([{ name: 'a', parsedText: 'Z'.repeat(800) }]);
    mockFindByPk.mockResolvedValue({ update: jest.fn() });
    mockChat.mockRejectedValue(new Error('rate limited'));
    const r = await deepVetFromDocuments(1);
    expect(r.skipped).toBe(true);
  });
});

describe('sanitizeVerdict', () => {
  test('clamps unknown status + disqualifier + confidence + label length', () => {
    const v = sanitizeVerdict({ status: 'maybe', disqualifier: 'BOGUS', label: 'x'.repeat(200), confidence: 5 });
    expect(v.status).toBe('needs_review');
    expect(v.disqualifier).toBeNull();
    expect(v.label.length).toBeLessThanOrEqual(120);
    expect(v.confidence).toBe(1);
    expect(v.auto).toBe(false);
  });
});
