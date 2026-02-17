const MockJobsAdapter = require('../../../backend/src/ingestion/adapters/mockJobs.adapter');

describe('MockJobsAdapter', () => {
  let adapter;

  beforeEach(() => {
    const mockDataSource = {
      id: 1,
      name: 'mock_jobs',
      type: 'mock',
      config: {},
    };
    adapter = new MockJobsAdapter(mockDataSource);
  });

  describe('fetch', () => {
    it('should return an array of records', async () => {
      const records = await adapter.fetch();

      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
    });

    it('should return exactly 15 records', async () => {
      const records = await adapter.fetch();

      expect(records).toHaveLength(15);
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

    it('should set type to ai_job and source to mock_jobs for all records', async () => {
      const raw = await adapter.fetch();
      const transformed = adapter.transform(raw);

      transformed.forEach((record) => {
        expect(record.type).toBe('ai_job');
        expect(record.source).toBe('mock_jobs');
      });
    });

    it('should include realistic sourceData with skills array', async () => {
      const raw = await adapter.fetch();
      const transformed = adapter.transform(raw);

      transformed.forEach((record) => {
        expect(record).toHaveProperty('sourceData');
        expect(record.sourceData).toHaveProperty('skills');
        expect(Array.isArray(record.sourceData.skills)).toBe(true);
        expect(record.sourceData.skills.length).toBeGreaterThan(0);
      });
    });
  });
});
