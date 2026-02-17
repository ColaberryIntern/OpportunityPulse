// Mock global fetch for SAM.gov API calls
const originalFetch = global.fetch;
global.fetch = jest.fn();

// Mock logger
jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const SamGovAdapter = require('../../../backend/src/ingestion/adapters/samGov.adapter');

describe('SamGovAdapter', () => {
  let adapter;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SAM_GOV_API_KEY = 'test-api-key-12345';

    const mockDataSource = {
      id: 3,
      name: 'sam_gov',
      type: 'api',
      config: {
        lookbackDays: 7,
        pageLimit: 25,
      },
    };
    adapter = new SamGovAdapter(mockDataSource);
  });

  afterAll(() => {
    global.fetch = originalFetch;
    delete process.env.SAM_GOV_API_KEY;
  });

  describe('fetch', () => {
    it('should call SAM.gov API with correct URL and api_key', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalRecords: 2,
          opportunitiesData: [
            { noticeId: 'SAM-001', title: 'IT Services Contract', description: 'Federal IT' },
            { noticeId: 'SAM-002', title: 'AI Research Grant', description: 'DoD AI research' },
          ],
        }),
      });

      const records = await adapter.fetch();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).toContain('api.sam.gov');
      expect(callUrl).toContain('api_key=test-api-key-12345');
      expect(Array.isArray(records)).toBe(true);
      expect(records).toHaveLength(2);
    });

    it('should paginate when results fill a page', async () => {
      // First page returns pageLimit (25) records — triggers next page
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalRecords: 30,
          opportunitiesData: Array.from({ length: 25 }, (_, i) => ({
            noticeId: `SAM-${String(i + 1).padStart(3, '0')}`,
            title: `Contract ${i + 1}`,
          })),
        }),
      });
      // Second page returns fewer than pageLimit — stops
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalRecords: 30,
          opportunitiesData: Array.from({ length: 5 }, (_, i) => ({
            noticeId: `SAM-${String(i + 26).padStart(3, '0')}`,
            title: `Contract ${i + 26}`,
          })),
        }),
      });

      const records = await adapter.fetch();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(records).toHaveLength(30);
    });

    it('should return empty array when no results', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          totalRecords: 0,
          opportunitiesData: [],
        }),
      });

      const records = await adapter.fetch();

      expect(records).toEqual([]);
    });

    it('should return empty array when SAM_GOV_API_KEY is not set', async () => {
      delete process.env.SAM_GOV_API_KEY;

      const dsNoKey = {
        id: 3,
        name: 'sam_gov',
        type: 'api',
        config: {},
      };

      const adapterNoKey = new SamGovAdapter(dsNoKey);
      const records = await adapterNoKey.fetch();
      expect(records).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API error responses gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'Service temporarily unavailable',
      });

      await expect(adapter.fetch()).rejects.toThrow();
    });
  });

  describe('transform', () => {
    const sampleRawRecords = [
      {
        noticeId: 'SAM-001',
        title: 'Cloud Migration Services',
        description: 'Federal cloud migration and modernization support.',
        type: 'Solicitation',
        naicsCode: '541512',
        classificationCode: 'D302',
        postedDate: '2026-02-01',
        responseDeadLine: '2026-03-01',
        typeOfSetAside: 'SBA',
        award: { amount: 5000000 },
        placeOfPerformance: { state: { code: 'VA' } },
      },
      {
        noticeId: 'SAM-002',
        title: 'AI Analytics Platform',
        description: 'Develop AI analytics for intelligence community.',
        type: 'Combined Synopsis',
        naicsCode: '541511',
        postedDate: '2026-01-15',
        responseDeadLine: '2026-02-28',
      },
    ];

    it('should map SAM.gov fields to Opportunity schema correctly', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed).toHaveLength(2);

      const first = transformed[0];
      expect(first).toHaveProperty('title', 'Cloud Migration Services');
      expect(first).toHaveProperty('sourceId', 'SAM-001');
      expect(first).toHaveProperty('description');
      expect(first).toHaveProperty('publishedAt');
      expect(first).toHaveProperty('expiresAt');
      expect(first).toHaveProperty('sourceData');
      expect(first.location).toBe('VA');
      expect(first.value).toBe(5000000);
    });

    it('should set type to gov_contract and source to sam_gov', () => {
      const transformed = adapter.transform(sampleRawRecords);

      transformed.forEach((record) => {
        expect(record.type).toBe('gov_contract');
        expect(record.source).toBe('sam_gov');
      });
    });

    it('should build tags from classificationCode, naicsCode, and setAside', () => {
      const transformed = adapter.transform(sampleRawRecords);

      const first = transformed[0];
      expect(first.tags).toContain('classification:D302');
      expect(first.tags).toContain('naics:541512');
      expect(first.tags).toContain('set-aside:SBA');
    });

    it('should handle missing optional fields', () => {
      const sparseRecords = [
        {
          noticeId: 'SAM-003',
          title: 'Minimal Listing',
        },
      ];

      const transformed = adapter.transform(sparseRecords);

      expect(transformed).toHaveLength(1);
      expect(transformed[0].type).toBe('gov_contract');
      expect(transformed[0].source).toBe('sam_gov');
      expect(transformed[0].title).toBe('Minimal Listing');
      expect(transformed[0].sourceId).toBe('SAM-003');
      expect(transformed[0]).toHaveProperty('sourceData');
    });
  });
});
