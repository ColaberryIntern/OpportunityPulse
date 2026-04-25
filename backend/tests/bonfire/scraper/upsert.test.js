// Validates the upsert split logic in bonfire.service.upsertJsonArray:
// - Rows with external_id are sent through bulkCreate with the right
//   updateOnDuplicate column set (which deliberately EXCLUDES enrichment fields).
// - Rows without external_id fall through to a plain bulkCreate.
//
// This is mock-based — full DB ON CONFLICT behavior is verified by the manual
// smoke test described in the plan's verification section.

const mockBulkCreate = jest.fn().mockResolvedValue([{ id: 'fake' }]);

jest.mock('../../../src/models', () => ({
  sequelize: {},
  BonfireOpportunity: { bulkCreate: mockBulkCreate, findByPk: jest.fn(), findAll: jest.fn(), findAndCountAll: jest.fn() },
  BonfireOpportunityTag: { destroy: jest.fn(), bulkCreate: jest.fn() },
}));
jest.mock('../../../src/bonfire/bonfireAI.service', () => ({
  enrichOpportunity: jest.fn(),
  generateStrategy: jest.fn(),
}));

const { upsertJsonArray } = require('../../../src/bonfire/bonfire.service');

beforeEach(() => {
  mockBulkCreate.mockClear();
  mockBulkCreate.mockResolvedValue([{ id: 'fake' }]);
});

describe('bonfire.service.upsertJsonArray', () => {
  it('routes rows with external_id through bulkCreate with updateOnDuplicate', async () => {
    await upsertJsonArray([
      {
        external_id: 'bonfire:agency:dhantx:RFP-1',
        title: 'Title I Compliance',
        agency: 'DHA',
      },
    ]);
    expect(mockBulkCreate).toHaveBeenCalledTimes(1);
    const [rows, options] = mockBulkCreate.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].externalId).toBe('bonfire:agency:dhantx:RFP-1');
    expect(options).toBeDefined();
    // updateOnDuplicate uses Sequelize attribute names (camelCase) so they map
    // through the model's `field:` mappings to the underlying snake_case columns.
    expect(options.updateOnDuplicate).toEqual(
      expect.arrayContaining(['title', 'agency', 'description', 'closeDate', 'sourceUrl', 'rawText', 'updatedAt']),
    );
    expect(options.conflictAttributes).toEqual(['externalId']);
    // CRITICAL invariant — re-scraping must NOT clobber enrichment fields.
    expect(options.updateOnDuplicate).not.toContain('fitScore');
    expect(options.updateOnDuplicate).not.toContain('priorityScore');
    expect(options.updateOnDuplicate).not.toContain('automationPotential');
    expect(options.updateOnDuplicate).not.toContain('enrichedAt');
    expect(options.updateOnDuplicate).not.toContain('enrichmentHash');
    expect(options.updateOnDuplicate).not.toContain('signals');
    expect(options.updateOnDuplicate).not.toContain('strategy');
  });

  it('routes rows without external_id through plain bulkCreate (no updateOnDuplicate)', async () => {
    await upsertJsonArray([{ title: 'No External ID Row' }]);
    expect(mockBulkCreate).toHaveBeenCalledTimes(1);
    const [, options] = mockBulkCreate.mock.calls[0];
    expect(options.updateOnDuplicate).toBeUndefined();
  });

  it('splits a mixed batch: one bulkCreate with upsert + one plain bulkCreate', async () => {
    await upsertJsonArray([
      { external_id: 'bonfire:agency:dhantx:R1', title: 'Has ID' },
      { title: 'No ID' },
    ]);
    expect(mockBulkCreate).toHaveBeenCalledTimes(2);
    const calls = mockBulkCreate.mock.calls;
    const upsertCall = calls.find((c) => c[1] && c[1].updateOnDuplicate);
    const plainCall = calls.find((c) => !c[1] || !c[1].updateOnDuplicate);
    expect(upsertCall).toBeTruthy();
    expect(plainCall).toBeTruthy();
    expect(upsertCall[0]).toHaveLength(1);
    expect(plainCall[0]).toHaveLength(1);
  });

  it('rejects rows missing title and reports them in errors', async () => {
    const out = await upsertJsonArray([{ external_id: 'x', title: '' }, { title: '   ' }]);
    expect(out.errors).toHaveLength(2);
    expect(out.errors[0].reason).toMatch(/title required/);
    expect(mockBulkCreate).not.toHaveBeenCalled();
  });

  it('throws on non-array input', async () => {
    await expect(upsertJsonArray({})).rejects.toThrow('payload must be an array');
  });

  it('reports processed count and upserted count', async () => {
    const out = await upsertJsonArray([
      { external_id: 'a', title: 'A' },
      { external_id: 'b', title: 'B' },
    ]);
    expect(out.processed).toBe(2);
    expect(out.upserted).toBe(2);
  });
});
