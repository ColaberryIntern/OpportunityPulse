// v0.9 (Phase A) — attachment classifier tests.
// Validates fast-path heuristics + AI fallback shape, fields sanitization,
// and per-opp batch orchestration.

jest.mock('../../src/models', () => ({
  OpportunityAttachment: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
}));
jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', chat: jest.fn() };
  return { getAIClient: () => client, __client: client };
});

const { OpportunityAttachment } = require('../../src/models');
const aiMod = require('../../src/analysis/ai.client');
const svc = require('../../src/bonfire/attachmentClassifier.service');

function fakeRow(overrides = {}) {
  return Object.assign({
    id: 'att-1',
    name: 'thing.pdf',
    mime: 'application/pdf',
    sizeBytes: 1000,
    parsedText: '',
    metadata: {},
    save: jest.fn(async function save() { return this; }),
    changed: jest.fn(),
  }, overrides);
}

beforeEach(() => {
  OpportunityAttachment.findByPk.mockReset();
  OpportunityAttachment.findAll.mockReset();
  aiMod.__client.chat.mockReset();
});

describe('attachmentClassifier.fastClassifyByName — heuristic shortcuts', () => {
  it('classifies "RFO" / "RFP" / "SOW" PDFs as read_only_reference', () => {
    expect(svc.fastClassifyByName('RFO 601440000053067.pdf').classification).toBe('read_only_reference');
    expect(svc.fastClassifyByName('Statement of Work, 920-03.pdf').classification).toBe('read_only_reference');
    expect(svc.fastClassifyByName('6-01. RFO 601440000053067.pdf').classification).toBe('read_only_reference');
    expect(svc.fastClassifyByName('Q&A Round 2.pdf').classification).toBe('read_only_reference');
  });

  it('classifies XLSX as vendor_schedule', () => {
    expect(svc.fastClassifyByName('Pricing Schedule.xlsx').classification).toBe('vendor_schedule');
    expect(svc.fastClassifyByName('1-06. Assumptions Schedule.xlsx').classification).toBe('vendor_schedule');
    expect(svc.fastClassifyByName('Cost Worksheet.xls').classification).toBe('vendor_schedule');
  });

  it('classifies known DOCX form titles as vendor_form', () => {
    expect(svc.fastClassifyByName('2-04. Execution of Offer.docx').classification).toBe('vendor_form');
    expect(svc.fastClassifyByName('3-05. Texas Family Code Schedule.docx').classification).toBe('vendor_form');
    expect(svc.fastClassifyByName('Bidder Certification.docx').classification).toBe('vendor_form');
    expect(svc.fastClassifyByName('1-Commitment to Perform.pdf').classification).toBe('vendor_form');
  });

  it('returns null for ambiguous names (forces AI fallback)', () => {
    expect(svc.fastClassifyByName('mystery.bin')).toBeNull();
    expect(svc.fastClassifyByName('Project Notes.docx')).toBeNull();
  });
});

describe('attachmentClassifier.sanitizeFields', () => {
  it('drops invalid entries and normalizes keys', () => {
    const out = svc.sanitizeFields([
      { key: 'Company Name!!', label: 'Company Name', required: true, example: 'Colaberry' },
      { key: '', label: 'Empty Key' },
      'not an object',
      null,
      { key: 'EIN', label: 'EIN', required: true },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].key).toBe('company_name');
    expect(out[0].required).toBe(true);
    expect(out[1].key).toBe('ein');
  });

  it('caps the field list at 30 entries', () => {
    const big = Array.from({ length: 50 }, (_, i) => ({ key: 'f' + i, label: 'F' + i }));
    expect(svc.sanitizeFields(big)).toHaveLength(30);
  });

  it('returns [] for non-array input', () => {
    expect(svc.sanitizeFields(null)).toEqual([]);
    expect(svc.sanitizeFields('string')).toEqual([]);
  });
});

describe('attachmentClassifier.classifyOne — fast path persistence', () => {
  it('persists fast-path classification on row.metadata without calling AI for unambiguous names', async () => {
    const row = fakeRow({ name: '6-01. RFO 601440000053067.pdf' });
    OpportunityAttachment.findByPk.mockResolvedValue(row);
    const out = await svc.classifyOne({ attachmentId: 'att-1' });
    expect(out.classification).toBe('read_only_reference');
    expect(out.via).toBe('fast_path');
    expect(row.metadata.classification).toBe('read_only_reference');
    expect(row.metadata.classification_via).toBe('fast_path');
    expect(row.metadata.fields).toEqual([]);
    expect(row.save).toHaveBeenCalled();
    expect(aiMod.__client.chat).not.toHaveBeenCalled();
  });

  it('still calls AI for vendor_form rows even after a fast-path hit (to extract fields)', async () => {
    const row = fakeRow({ name: '2-04. Execution of Offer.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', parsedText: 'Click or tap here to enter text.' });
    OpportunityAttachment.findByPk.mockResolvedValue(row);
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({
        classification: 'vendor_form',
        confidence: 0.95,
        reason: 'Vendor signs + fills company info',
        fields: [
          { key: 'company_name', label: 'Company Name', required: true, example: 'Colaberry' },
          { key: 'signatory_name', label: 'Authorized Signatory', required: true },
        ],
      }),
    });
    const out = await svc.classifyOne({ attachmentId: 'att-1' });
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1);
    expect(out.fields).toHaveLength(2);
    expect(out.fields[0].key).toBe('company_name');
    expect(out.via).toBe('ai');
  });
});

describe('attachmentClassifier.classifyOne — AI fallback for ambiguous names', () => {
  it('calls AI when no fast-path match', async () => {
    const row = fakeRow({ name: 'mystery_doc.pdf', parsedText: 'Vendor must affirm…' });
    OpportunityAttachment.findByPk.mockResolvedValue(row);
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({
        classification: 'vendor_form',
        confidence: 0.7,
        reason: 'Has vendor-affirmation language',
        fields: [{ key: 'signatory_name', label: 'Signatory', required: true }],
      }),
    });
    const out = await svc.classifyOne({ attachmentId: 'att-1' });
    expect(out.classification).toBe('vendor_form');
    expect(out.via).toBe('ai');
    expect(out.fields).toHaveLength(1);
  });

  it('falls back to "other" when AI returns malformed JSON and no fast-path matched', async () => {
    const row = fakeRow({ name: 'mystery.bin' });
    OpportunityAttachment.findByPk.mockResolvedValue(row);
    aiMod.__client.chat.mockResolvedValue({ content: 'not json' });
    const out = await svc.classifyOne({ attachmentId: 'att-1' });
    expect(out.classification).toBe('other');
    expect(row.metadata.classification).toBe('other');
  });

  it('records classification_error when AI throws but does not throw itself', async () => {
    const row = fakeRow({ name: 'mystery.bin' });
    OpportunityAttachment.findByPk.mockResolvedValue(row);
    aiMod.__client.chat.mockRejectedValue(new Error('Rate limit'));
    const out = await svc.classifyOne({ attachmentId: 'att-1' });
    expect(out.classification).toBe('other');
    expect(row.metadata.classification_error).toBe('Rate limit');
  });
});

describe('attachmentClassifier.classifyAllForOpp', () => {
  it('classifies every attachment for the opp and groups counts by classification', async () => {
    OpportunityAttachment.findAll.mockResolvedValue([
      { id: 'a1', name: '6-01. RFO 601440000053067.pdf' },
      { id: 'a2', name: '7-03. Pricing Schedule.xlsx' },
      { id: 'a3', name: '2-04. Execution of Offer.docx' },
    ]);
    // findByPk per item — mock to return matching shapes.
    OpportunityAttachment.findByPk.mockImplementation(async (id) => {
      const map = {
        a1: fakeRow({ id: 'a1', name: '6-01. RFO 601440000053067.pdf' }),
        a2: fakeRow({ id: 'a2', name: '7-03. Pricing Schedule.xlsx' }),
        a3: fakeRow({ id: 'a3', name: '2-04. Execution of Offer.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      };
      return map[id];
    });
    aiMod.__client.chat.mockResolvedValue({
      content: JSON.stringify({ classification: 'vendor_form', confidence: 0.9, reason: 'form', fields: [] }),
    });
    const out = await svc.classifyAllForOpp({ bonfireOpportunityId: 'opp-1' });
    expect(out.classified).toBe(3);
    expect(out.failed).toBe(0);
    expect(out.by_classification.read_only_reference).toBe(1);
    expect(out.by_classification.vendor_schedule).toBe(1);
    expect(out.by_classification.vendor_form).toBe(1);
  });
});
