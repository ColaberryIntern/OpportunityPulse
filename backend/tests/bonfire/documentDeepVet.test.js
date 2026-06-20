jest.mock('../../src/logging/logger', () => ({ info() {}, warn() {}, error() {}, debug() {} }));
const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockChat = jest.fn();
jest.mock('../../src/models', () => ({
  OpportunityAttachment: { findAll: mockFindAll },
  BonfireOpportunity: { findByPk: mockFindByPk },
}));
jest.mock('../../src/analysis/ai.client', () => ({ getAIClient: () => ({ chat: mockChat }) }));

const {
  deepVetFromDocuments, sanitizeVerdict, gatePassages, validateVerdictEvidence,
} = require('../../src/bonfire/documentDeepVet.service');

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

describe('gatePassages', () => {
  test('pulls a window around a cert clause buried deep in the text', () => {
    const filler = 'lorem ipsum scope of work. '.repeat(400); // ~10k chars of noise
    const text = `${filler} The vendor must be TX-RAMP certified prior to award. ${filler}`;
    const passages = gatePassages(text);
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.join(' ')).toMatch(/TX-RAMP certified/i);
  });
  test('returns [] when no gate language is present', () => {
    expect(gatePassages('we are seeking a vendor to paint the gymnasium bleachers')).toEqual([]);
  });
});

describe('validateVerdictEvidence (CERT_WALL guardrail)', () => {
  test('downgrades CERT_WALL no_bid to needs_review when evidence names no cert', () => {
    const v = validateVerdictEvidence({ status: 'no_bid', disqualifier: 'CERT_WALL', evidence: 'Vendor must maintain all licenses and certifications required by law.', confidence: 1 });
    expect(v.status).toBe('needs_review');
    expect(v.confidence).toBeLessThanOrEqual(0.4);
  });
  test('keeps CERT_WALL no_bid when evidence names a real cert', () => {
    const v = validateVerdictEvidence({ status: 'no_bid', disqualifier: 'CERT_WALL', evidence: 'The vendor must be TX-RAMP certified prior to award.', confidence: 1 });
    expect(v.status).toBe('no_bid');
  });
  test('does not touch a no_bid with a different disqualifier', () => {
    const v = validateVerdictEvidence({ status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', evidence: 'install the bleachers', confidence: 0.9 });
    expect(v.status).toBe('no_bid');
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
