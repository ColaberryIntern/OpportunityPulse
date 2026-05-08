// v0.4 — attachmentFetcher service tests focused on the parts that don't
// require a real browser: mime inference + upsert idempotency.

jest.mock('../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: {},
  Opportunity: {},
  OpportunityAttachment: { findOne: jest.fn(), create: jest.fn() },
}));

const { OpportunityAttachment } = require('../../src/models');
const fetcher = require('../../src/bonfire/attachmentFetcher.service');

beforeEach(() => {
  OpportunityAttachment.findOne.mockReset();
  OpportunityAttachment.create.mockReset();
});

describe('attachmentFetcher.inferMime', () => {
  it('prefers a non-octet-stream header mime', () => {
    expect(fetcher.inferMime('foo.bin', 'application/json')).toBe('application/json');
  });
  it('falls back to extension on application/octet-stream', () => {
    expect(fetcher.inferMime('foo.pdf', 'application/octet-stream')).toBe('application/pdf');
  });
  it('infers from common extensions', () => {
    expect(fetcher.inferMime('a.pdf')).toBe('application/pdf');
    expect(fetcher.inferMime('a.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(fetcher.inferMime('a.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(fetcher.inferMime('a.txt')).toBe('text/plain');
    expect(fetcher.inferMime('a.png')).toBe('image/png');
  });
  it('returns null for unknown extensions', () => {
    expect(fetcher.inferMime('mystery')).toBeNull();
    expect(fetcher.inferMime('a.exotic')).toBeNull();
  });
  it('handles query strings on URLs', () => {
    expect(fetcher.inferMime('a.pdf?token=xyz', null)).toBe('application/pdf');
  });
});

describe('attachmentFetcher.upsertAttachment idempotency', () => {
  it('creates a new row when none exists for (bonfireOpportunityId, urlOriginal)', async () => {
    OpportunityAttachment.findOne.mockResolvedValue(null);
    OpportunityAttachment.create.mockImplementation(async (row) => ({ ...row, id: 'attn-1' }));
    const out = await fetcher.upsertAttachment({
      bonfireOpportunityId: 'opp-1',
      source: 'bonfire',
      name: 'RFP.pdf',
      fileRel: 'opportunities/opp-1/x.pdf',
      mime: 'application/pdf',
      sizeBytes: 12345,
      urlOriginal: 'https://dhantx.bonfirehub.com/file/abc',
      parsedText: 'Bid bond required.',
    });
    expect(out.action).toBe('created');
    expect(OpportunityAttachment.create).toHaveBeenCalledTimes(1);
  });

  it('updates the existing row when (bonfireOpportunityId, urlOriginal) already exists', async () => {
    const existing = {
      id: 'attn-old',
      save: jest.fn(async function () { return this; }),
    };
    OpportunityAttachment.findOne.mockResolvedValue(existing);
    const out = await fetcher.upsertAttachment({
      bonfireOpportunityId: 'opp-1',
      source: 'bonfire',
      name: 'RFP.pdf (re-fetched)',
      fileRel: 'opportunities/opp-1/y.pdf',
      mime: 'application/pdf',
      sizeBytes: 23456,
      urlOriginal: 'https://dhantx.bonfirehub.com/file/abc',
      parsedText: 'Bid bond required. Updated.',
    });
    expect(out.action).toBe('updated');
    expect(existing.save).toHaveBeenCalledTimes(1);
    expect(existing.name).toBe('RFP.pdf (re-fetched)');
    expect(existing.parsedText).toBe('Bid bond required. Updated.');
    expect(OpportunityAttachment.create).not.toHaveBeenCalled();
  });
});
