// Mock global fetch for Jobicy API calls
const originalFetch = global.fetch;
global.fetch = jest.fn();

// Mock logger
jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const JobicyAdapter = require('../../src/ingestion/adapters/jobicy.adapter');

describe('JobicyAdapter', () => {
  let adapter;

  const mockDataSource = {
    id: 12,
    name: 'jobicy',
    type: 'api',
    config: {
      tags: ['ai', 'machine-learning'],
      count: 25,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    adapter = new JobicyAdapter(mockDataSource);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // ---------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------
  describe('constructor', () => {
    it('should read config tags and count from dataSource', () => {
      expect(adapter.tags).toEqual(['ai', 'machine-learning']);
      expect(adapter.count).toBe(25);
    });

    it('should use defaults when config values are not provided', () => {
      const ds = { id: 12, name: 'jobicy', config: {} };
      const defaultAdapter = new JobicyAdapter(ds);

      expect(defaultAdapter.tags).toEqual(['ai', 'machine-learning', 'data-science']);
      expect(defaultAdapter.count).toBe(50);
    });
  });

  // ---------------------------------------------------------------
  // fetch()
  // ---------------------------------------------------------------
  describe('fetch', () => {
    const makeJob = (id, title) => ({
      id,
      jobTitle: title || `AI Engineer ${id}`,
      companyName: 'TechCorp',
      jobExcerpt: 'Build AI systems.',
      jobDescription: '<p>Detailed description of the role.</p>',
      url: `https://jobicy.com/jobs/${id}`,
      jobIndustry: ['AI', 'Software'],
      jobType: 'full-time',
      jobGeo: 'Worldwide',
      annualSalaryMax: '180000',
      annualSalaryMin: '120000',
      pubDate: '2026-01-15T00:00:00Z',
    });

    it('should search multiple tags', async () => {
      // adapter.tags = ['ai', 'machine-learning']
      // First tag: 'ai'
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [makeJob(1, 'AI Engineer'), makeJob(2, 'Data Scientist')],
        }),
      });
      // Second tag: 'machine-learning'
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [makeJob(3, 'ML Engineer')],
        }),
      });

      const records = await adapter.fetch();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(records).toHaveLength(3);

      // Verify URLs contain the correct tags
      const firstCallUrl = global.fetch.mock.calls[0][0];
      const secondCallUrl = global.fetch.mock.calls[1][0];
      expect(firstCallUrl).toContain('tag=ai');
      expect(secondCallUrl).toContain('tag=machine-learning');
    });

    it('should deduplicate jobs across tag searches by ID', async () => {
      // Job with id=1 appears in both tag searches
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [makeJob(1, 'AI Engineer'), makeJob(2, 'Data Scientist')],
        }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [makeJob(1, 'AI Engineer'), makeJob(3, 'ML Engineer')],
        }),
      });

      const records = await adapter.fetch();

      // Should be 3 unique jobs, not 4
      expect(records).toHaveLength(3);
      const ids = records.map((j) => j.id);
      expect(ids).toEqual([1, 2, 3]);
    });

    it('should return empty array when no jobs found for any tag', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: [] }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
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
        status: 503,
        text: async () => 'Service Unavailable',
      });

      await expect(adapter.fetch()).rejects.toThrow('503');
    });

    it('should construct correct URL with count and tag parameters', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: [] }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: [] }),
      });

      await adapter.fetch();

      const firstCallUrl = global.fetch.mock.calls[0][0];
      expect(firstCallUrl).toContain('jobicy.com/api/v2/remote-jobs');
      expect(firstCallUrl).toContain('count=25');
      expect(firstCallUrl).toContain('tag=ai');
    });

    it('should handle missing jobs array in API response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'No results' }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: [makeJob(1)] }),
      });

      const records = await adapter.fetch();

      // First tag returned no jobs array, second returned 1 job
      expect(records).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------
  // transform()
  // ---------------------------------------------------------------
  describe('transform', () => {
    const sampleRawRecords = [
      {
        id: 101,
        jobTitle: 'Senior AI Engineer',
        companyName: 'DeepTech',
        jobExcerpt: 'Build <b>AI</b> systems for enterprise clients.',
        jobDescription: '<p>Full description of the AI engineering role at DeepTech.</p>',
        url: 'https://jobicy.com/jobs/101',
        jobIndustry: ['Artificial Intelligence', 'Software'],
        jobType: 'full-time',
        jobGeo: 'United States',
        annualSalaryMax: '200000',
        annualSalaryMin: '150000',
        pubDate: '2026-01-15T00:00:00Z',
      },
      {
        id: 202,
        jobTitle: 'ML Research Scientist',
        companyName: 'LabAI',
        jobExcerpt: 'Conduct ML research.',
        jobDescription: '<p>Research role in machine learning.</p>',
        url: 'https://jobicy.com/jobs/202',
        jobIndustry: 'Data Science',
        jobType: 'contract',
        jobGeo: 'Europe',
        annualSalaryMax: null,
        annualSalaryMin: '130000',
        pubDate: '2026-02-01T00:00:00Z',
      },
    ];

    it('should map all fields correctly', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed).toHaveLength(2);

      const first = transformed[0];
      expect(first.type).toBe('ai_job');
      expect(first.source).toBe('jobicy');
      expect(first.sourceId).toBe('101');
      expect(first.title).toBe('Senior AI Engineer \u2014 DeepTech');
      expect(first.description).toBe('Build AI systems for enterprise clients.');
      expect(first.sourceUrl).toBe('https://jobicy.com/jobs/101');
      expect(first.status).toBe('active');
      expect(first.category).toBe('AI/ML');
      expect(first.tags).toEqual(['Artificial Intelligence', 'Software', 'full-time']);
      expect(first.location).toBe('United States');
      expect(first.value).toBe(200000);
      expect(first.publishedAt).toEqual(new Date('2026-01-15T00:00:00Z'));
      expect(first.expiresAt).toBeNull();
      expect(first.sourceData).toBe(sampleRawRecords[0]);
    });

    it('should parse annualSalaryMax as a number', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(typeof transformed[0].value).toBe('number');
      expect(transformed[0].value).toBe(200000);
    });

    it('should fall back to annualSalaryMin when annualSalaryMax is null', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // Second record has annualSalaryMax: null, annualSalaryMin: '130000'
      expect(transformed[1].value).toBe(130000);
    });

    it('should set value to null when both salary fields are missing', () => {
      const records = [{
        ...sampleRawRecords[0],
        annualSalaryMax: null,
        annualSalaryMin: null,
      }];

      const transformed = adapter.transform(records);

      expect(transformed[0].value).toBeNull();
    });

    it('should handle jobIndustry as both array and string', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // First record: jobIndustry is an array
      expect(transformed[0].tags).toContain('Artificial Intelligence');
      expect(transformed[0].tags).toContain('Software');

      // Second record: jobIndustry is a string
      expect(transformed[1].tags).toContain('Data Science');
    });

    it('should include jobType in tags', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].tags).toContain('full-time');
      expect(transformed[1].tags).toContain('contract');
    });

    it('should strip HTML from jobExcerpt/jobDescription', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].description).not.toContain('<b>');
      expect(transformed[0].description).not.toContain('</b>');
      expect(transformed[0].description).toBe('Build AI systems for enterprise clients.');
    });

    it('should prefer jobExcerpt over jobDescription for description', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // First record has both jobExcerpt and jobDescription
      expect(transformed[0].description).toBe('Build AI systems for enterprise clients.');
    });

    it('should fall back to jobDescription when jobExcerpt is missing', () => {
      const records = [{
        ...sampleRawRecords[0],
        jobExcerpt: undefined,
      }];

      const transformed = adapter.transform(records);

      expect(transformed[0].description).toBe(
        'Full description of the AI engineering role at DeepTech.'
      );
    });

    it('should truncate description to 2000 characters', () => {
      const longExcerpt = '<p>' + 'C'.repeat(3000) + '</p>';
      const records = [{ ...sampleRawRecords[0], jobExcerpt: longExcerpt }];

      const transformed = adapter.transform(records);

      expect(transformed[0].description.length).toBeLessThanOrEqual(2000);
    });

    it('should handle missing fields gracefully', () => {
      const sparseRecords = [
        {
          id: 999,
          // jobTitle, companyName, jobExcerpt, jobDescription, url,
          // jobIndustry, jobType, jobGeo, annualSalaryMax, annualSalaryMin, pubDate all missing
        },
      ];

      const transformed = adapter.transform(sparseRecords);

      expect(transformed).toHaveLength(1);
      const record = transformed[0];
      expect(record.type).toBe('ai_job');
      expect(record.source).toBe('jobicy');
      expect(record.sourceId).toBe('999');
      expect(record.title).toBe('Untitled \u2014 Unknown');
      expect(record.description).toBe('');
      expect(record.sourceUrl).toBe('https://jobicy.com/jobs/999');
      expect(record.status).toBe('active');
      expect(record.category).toBe('AI/ML');
      expect(record.tags).toEqual([]);
      expect(record.location).toBe('Remote');
      expect(record.value).toBeNull();
      expect(record.publishedAt).toBeNull();
      expect(record.expiresAt).toBeNull();
      expect(record.sourceData).toBe(sparseRecords[0]);
    });

    it('should limit industry tags to 5 entries before adding jobType', () => {
      const manyIndustries = Array.from({ length: 8 }, (_, i) => `Industry-${i}`);
      const records = [{
        ...sampleRawRecords[0],
        jobIndustry: manyIndustries,
        jobType: 'full-time',
      }];

      const transformed = adapter.transform(records);

      // Should have 5 industries + 1 jobType = 6, capped at 10
      expect(transformed[0].tags).toHaveLength(6);
      expect(transformed[0].tags[5]).toBe('full-time');
    });

    it('should limit total tags to 10 entries', () => {
      const manyIndustries = Array.from({ length: 12 }, (_, i) => `Industry-${i}`);
      const records = [{
        ...sampleRawRecords[0],
        jobIndustry: manyIndustries,
        jobType: 'full-time',
      }];

      const transformed = adapter.transform(records);

      // 5 industries (sliced) + 1 jobType = 6, but final slice(0,10) caps at 10
      expect(transformed[0].tags.length).toBeLessThanOrEqual(10);
    });

    it('should convert sourceId to string', () => {
      const records = [{ ...sampleRawRecords[0], id: 67890 }];

      const transformed = adapter.transform(records);

      expect(typeof transformed[0].sourceId).toBe('string');
      expect(transformed[0].sourceId).toBe('67890');
    });

    it('should parse pubDate into a Date object', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].publishedAt).toBeInstanceOf(Date);
      expect(transformed[0].publishedAt).toEqual(new Date('2026-01-15T00:00:00Z'));
    });

    it('should set location from jobGeo field', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].location).toBe('United States');
      expect(transformed[1].location).toBe('Europe');
    });

    it('should default location to Remote when jobGeo is missing', () => {
      const records = [{ ...sampleRawRecords[0], jobGeo: undefined }];

      const transformed = adapter.transform(records);

      expect(transformed[0].location).toBe('Remote');
    });
  });
});
