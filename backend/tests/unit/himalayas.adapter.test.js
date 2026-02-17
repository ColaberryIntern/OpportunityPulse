// Mock global fetch for Himalayas API calls
const originalFetch = global.fetch;
global.fetch = jest.fn();

// Mock logger
jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const HimalayasAdapter = require('../../src/ingestion/adapters/himalayas.adapter');

describe('HimalayasAdapter', () => {
  let adapter;

  const mockDataSource = {
    id: 11,
    name: 'himalayas',
    type: 'api',
    config: {
      keywords: ['machine learning', 'AI', 'data science'],
      maxPages: 2,
      limit: 10,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    adapter = new HimalayasAdapter(mockDataSource);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // ---------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------
  describe('constructor', () => {
    it('should read config keywords, maxPages, and limit from dataSource', () => {
      expect(adapter.keywords).toEqual(['machine learning', 'AI', 'data science']);
      expect(adapter.maxPages).toBe(2);
      expect(adapter.limit).toBe(10);
    });

    it('should use defaults when config values are not provided', () => {
      const ds = { id: 11, name: 'himalayas', config: {} };
      const defaultAdapter = new HimalayasAdapter(ds);

      expect(defaultAdapter.keywords).toEqual([
        'artificial intelligence', 'machine learning', 'AI',
        'data science', 'deep learning', 'NLP', 'computer vision',
        'LLM', 'GPT', 'neural network',
      ]);
      expect(defaultAdapter.maxPages).toBe(3);
      expect(defaultAdapter.limit).toBe(50);
    });
  });

  // ---------------------------------------------------------------
  // fetch()
  // ---------------------------------------------------------------
  describe('fetch', () => {
    const makeAiJob = (id) => ({
      id,
      title: 'Machine Learning Engineer',
      companyName: 'DeepTech',
      categories: ['Machine Learning', 'Engineering'],
      excerpt: 'Build ML pipelines for AI-powered products.',
      description: '<p>Deep learning and NLP experience required.</p>',
      applicationUrl: `https://himalayas.app/jobs/${id}/apply`,
      url: `https://himalayas.app/jobs/${id}`,
      locationRestrictions: ['US', 'EU'],
      salaryCurrency: 'USD',
      salaryMax: 200000,
      publishedDate: '2026-01-15T00:00:00Z',
    });

    const makeNonAiJob = (id) => ({
      id,
      title: 'Frontend Developer',
      companyName: 'WebCorp',
      categories: ['Frontend', 'JavaScript'],
      excerpt: 'Build beautiful UIs with React.',
      description: '<p>React and TypeScript experience required.</p>',
      applicationUrl: `https://himalayas.app/jobs/${id}/apply`,
      url: `https://himalayas.app/jobs/${id}`,
      locationRestrictions: ['Worldwide'],
      salaryCurrency: 'USD',
      salaryMax: 150000,
      publishedDate: '2026-01-20T00:00:00Z',
    });

    it('should paginate up to maxPages', async () => {
      // adapter.maxPages = 2, adapter.limit = 10
      // Page 1: returns 10 (full page, triggers next page)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: Array.from({ length: 10 }, (_, i) => makeAiJob(i + 1)),
        }),
      });
      // Page 2: also returns 10 (full page, but maxPages reached)
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: Array.from({ length: 10 }, (_, i) => makeAiJob(i + 11)),
        }),
      });

      const records = await adapter.fetch();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(records).toHaveLength(20);
    });

    it('should stop early when page returns fewer results than limit', async () => {
      // Page 1: returns fewer than limit (7 < 10) — should stop
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: Array.from({ length: 7 }, (_, i) => makeAiJob(i + 1)),
        }),
      });

      const records = await adapter.fetch();

      // Should only make 1 request since first page was not full
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(records).toHaveLength(7);
    });

    it('should filter for AI-related jobs by keywords', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [makeAiJob(1), makeNonAiJob(2), makeAiJob(3)],
        }),
      });

      const records = await adapter.fetch();

      // Only the 2 AI jobs should remain after filtering
      expect(records).toHaveLength(2);
      expect(records.every((j) => j.title === 'Machine Learning Engineer')).toBe(true);
    });

    it('should return empty array when no AI-related jobs found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [makeNonAiJob(1), makeNonAiJob(2)],
        }),
      });

      const records = await adapter.fetch();

      expect(records).toEqual([]);
    });

    it('should handle timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValueOnce(abortError);

      await expect(adapter.fetch()).rejects.toThrow('timed out');
    });

    it('should handle non-200 response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(adapter.fetch()).rejects.toThrow('500');
    });

    it('should construct correct URL with offset and limit', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: [] }),
      });

      await adapter.fetch();

      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).toContain('himalayas.app/jobs/api');
      expect(callUrl).toContain('limit=10');
      expect(callUrl).toContain('offset=0');
    });

    it('should handle missing jobs array in response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const records = await adapter.fetch();

      expect(records).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // transform()
  // ---------------------------------------------------------------
  describe('transform', () => {
    const sampleRawRecords = [
      {
        id: 101,
        title: 'Senior ML Engineer',
        companyName: 'DeepTech',
        categories: ['Machine Learning', 'Python', 'Engineering'],
        excerpt: 'Build <b>ML</b> pipelines for production.',
        description: '<p>Full description with deep learning details.</p>',
        applicationUrl: 'https://himalayas.app/jobs/101/apply',
        url: 'https://himalayas.app/jobs/101',
        locationRestrictions: ['US', 'Canada', 'EU'],
        salaryCurrency: 'USD',
        salaryMax: 200000,
        salaryMin: 150000,
        publishedDate: '2026-01-15T00:00:00Z',
      },
      {
        id: 202,
        title: 'AI Research Scientist',
        companyName: 'LabAI',
        categories: ['Deep Learning', 'Research'],
        description: 'Conduct cutting-edge AI research.',
        url: 'https://himalayas.app/jobs/202',
        locationRestrictions: [],
        salaryCurrency: null,
        salaryMax: 180000,
        publishedDate: '2026-02-01T00:00:00Z',
      },
    ];

    it('should map all fields correctly', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed).toHaveLength(2);

      const first = transformed[0];
      expect(first.type).toBe('ai_job');
      expect(first.source).toBe('himalayas');
      expect(first.sourceId).toBe('101');
      expect(first.title).toBe('Senior ML Engineer \u2014 DeepTech');
      expect(first.description).toBe('Build ML pipelines for production.');
      expect(first.sourceUrl).toBe('https://himalayas.app/jobs/101/apply');
      expect(first.status).toBe('active');
      expect(first.category).toBe('AI/ML');
      expect(first.tags).toEqual(['Machine Learning', 'Python', 'Engineering']);
      expect(first.location).toBe('US, Canada, EU');
      expect(first.value).toBe(200000);
      expect(first.publishedAt).toEqual(new Date('2026-01-15T00:00:00Z'));
      expect(first.expiresAt).toBeNull();
      expect(first.sourceData).toBe(sampleRawRecords[0]);
    });

    it('should prefer applicationUrl over url for sourceUrl', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].sourceUrl).toBe('https://himalayas.app/jobs/101/apply');
    });

    it('should fall back to url when applicationUrl is missing', () => {
      const records = [{
        ...sampleRawRecords[0],
        applicationUrl: undefined,
        url: 'https://himalayas.app/jobs/101',
      }];

      const transformed = adapter.transform(records);

      expect(transformed[0].sourceUrl).toBe('https://himalayas.app/jobs/101');
    });

    it('should fall back to constructed URL when both applicationUrl and url are missing', () => {
      const records = [{
        ...sampleRawRecords[0],
        applicationUrl: undefined,
        url: undefined,
      }];

      const transformed = adapter.transform(records);

      expect(transformed[0].sourceUrl).toBe('https://himalayas.app/jobs/101');
    });

    it('should set value to null when salaryCurrency is missing', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // Second record has salaryCurrency: null, so value should be null
      expect(transformed[1].value).toBeNull();
    });

    it('should set value to salaryMax when salaryCurrency is present', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // First record has salaryCurrency: 'USD' and salaryMax: 200000
      expect(transformed[0].value).toBe(200000);
    });

    it('should strip HTML from description/excerpt', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].description).not.toContain('<b>');
      expect(transformed[0].description).not.toContain('</b>');
    });

    it('should truncate description to 2000 characters', () => {
      const longExcerpt = '<p>' + 'B'.repeat(3000) + '</p>';
      const records = [{ ...sampleRawRecords[0], excerpt: longExcerpt }];

      const transformed = adapter.transform(records);

      expect(transformed[0].description.length).toBeLessThanOrEqual(2000);
    });

    it('should prefer excerpt over description for description field', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // First record has both excerpt and description; excerpt should be used
      expect(transformed[0].description).toBe('Build ML pipelines for production.');
    });

    it('should fall back to description when excerpt is missing', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // Second record has no excerpt, only description
      expect(transformed[1].description).toBe('Conduct cutting-edge AI research.');
    });

    it('should join locationRestrictions with comma-space', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].location).toBe('US, Canada, EU');
    });

    it('should default location to Remote when locationRestrictions is empty', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // Second record has empty locationRestrictions
      expect(transformed[1].location).toBe('Remote');
    });

    it('should handle jobs with missing fields gracefully', () => {
      const sparseRecords = [
        {
          id: 999,
          // title, companyName, categories, excerpt, description, applicationUrl,
          // url, locationRestrictions, salaryCurrency, salaryMax, publishedDate all missing
        },
      ];

      const transformed = adapter.transform(sparseRecords);

      expect(transformed).toHaveLength(1);
      const record = transformed[0];
      expect(record.type).toBe('ai_job');
      expect(record.source).toBe('himalayas');
      expect(record.sourceId).toBe('999');
      expect(record.title).toBe('Untitled \u2014 Unknown');
      expect(record.description).toBe('');
      expect(record.sourceUrl).toBe('https://himalayas.app/jobs/999');
      expect(record.status).toBe('active');
      expect(record.category).toBe('AI/ML');
      expect(record.tags).toEqual([]);
      expect(record.location).toBe('Remote');
      expect(record.value).toBeNull();
      expect(record.publishedAt).toBeNull();
      expect(record.expiresAt).toBeNull();
      expect(record.sourceData).toBe(sparseRecords[0]);
    });

    it('should limit tags to 10 entries', () => {
      const manyCategories = Array.from({ length: 15 }, (_, i) => `Category-${i}`);
      const records = [{ ...sampleRawRecords[0], categories: manyCategories }];

      const transformed = adapter.transform(records);

      expect(transformed[0].tags).toHaveLength(10);
    });

    it('should convert sourceId to string', () => {
      const records = [{ ...sampleRawRecords[0], id: 54321 }];

      const transformed = adapter.transform(records);

      expect(typeof transformed[0].sourceId).toBe('string');
      expect(transformed[0].sourceId).toBe('54321');
    });
  });
});
