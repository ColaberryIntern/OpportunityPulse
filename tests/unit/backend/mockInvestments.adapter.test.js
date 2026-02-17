const MockInvestmentsAdapter = require('../../../backend/src/ingestion/adapters/mockInvestments.adapter');

describe('MockInvestmentsAdapter', () => {
  let adapter;

  beforeEach(() => {
    const mockDataSource = {
      id: 2,
      name: 'mock_investments',
      type: 'mock',
      config: {},
    };
    adapter = new MockInvestmentsAdapter(mockDataSource);
  });

  describe('fetch', () => {
    it('should return an array of records', async () => {
      const records = await adapter.fetch();

      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
    });

    it('should return exactly 10 records', async () => {
      const records = await adapter.fetch();

      expect(records).toHaveLength(10);
    });
  });

  describe('transform', () => {
    it('should produce records with required Opportunity fields', async () => {
      const raw = await adapter.fetch();
      const transformed = adapter.transform(raw);

      expect(Array.isArray(transformed)).toBe(true);
      expect(transformed.length).toBeGreaterThan(0);

      transformed.forEach((record) => {
        expect(record).toHaveProperty('type');
        expect(record).toHaveProperty('title');
        expect(record).toHaveProperty('source');
        expect(record).toHaveProperty('sourceId');
        expect(record).toHaveProperty('description');
        expect(record).toHaveProperty('status');
        expect(record.title).toBeTruthy();
        expect(record.sourceId).toBeTruthy();
      });
    });

    it('should set type to investment and source to mock_investments for all records', async () => {
      const raw = await adapter.fetch();
      const transformed = adapter.transform(raw);

      transformed.forEach((record) => {
        expect(record.type).toBe('investment');
        expect(record.source).toBe('mock_investments');
      });
    });

    it('should include realistic sourceData with round and otherInvestors', async () => {
      const raw = await adapter.fetch();
      const transformed = adapter.transform(raw);

      transformed.forEach((record) => {
        expect(record).toHaveProperty('sourceData');
        expect(record.sourceData).toHaveProperty('round');
        expect(record.sourceData).toHaveProperty('otherInvestors');
        expect(typeof record.sourceData.round).toBe('string');
        expect(Array.isArray(record.sourceData.otherInvestors)).toBe(true);
        expect(record.sourceData.otherInvestors.length).toBeGreaterThan(0);
      });
    });
  });
});
