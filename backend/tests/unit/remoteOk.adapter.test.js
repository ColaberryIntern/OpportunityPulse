// Mock global fetch for RemoteOK API calls
const originalFetch = global.fetch;
global.fetch = jest.fn();

// Mock logger
jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const RemoteOkAdapter = require('../../src/ingestion/adapters/remoteOk.adapter');

describe('RemoteOkAdapter', () => {
  let adapter;

  const mockDataSource = {
    id: 10,
    name: 'remote_ok',
    type: 'api',
    config: {
      searches: ['ai', 'machine learning'],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    adapter = new RemoteOkAdapter(mockDataSource);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // ---------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------
  describe('constructor', () => {
    it('should read config.searches from dataSource', () => {
      expect(adapter.searches).toEqual(['ai', 'machine learning']);
    });

    it('should use default searches when config.searches is not provided', () => {
      const ds = { id: 10, name: 'remote_ok', config: {} };
      const defaultAdapter = new RemoteOkAdapter(ds);
      expect(defaultAdapter.searches).toEqual(['ai', 'machine learning', 'artificial intelligence']);
    });
  });

  // ---------------------------------------------------------------
  // fetch()
  // ---------------------------------------------------------------
  describe('fetch', () => {
    const makeApiResponse = (jobs) => {
      // RemoteOK API returns metadata as the first element
      const metadata = { '0': 'legal', legal: 'https://remoteok.com/legal' };
      return [metadata, ...jobs];
    };

    const aiJob = {
      id: 101,
      position: 'Machine Learning Engineer',
      company: 'DeepTech',
      tags: ['machine-learning', 'python'],
      description: '<p>Build ML pipelines for production AI systems.</p>',
      url: 'https://remoteok.com/remote-jobs/101',
      date: '2026-01-15T00:00:00+00:00',
      location: 'Remote',
      salary_min: 120000,
      salary_max: 180000,
    };

    const nonAiJob = {
      id: 202,
      position: 'Frontend Developer',
      company: 'WebCorp',
      tags: ['react', 'javascript'],
      description: '<p>Build beautiful UIs with React.</p>',
      url: 'https://remoteok.com/remote-jobs/202',
      date: '2026-01-20T00:00:00+00:00',
      location: 'Remote',
    };

    it('should skip the first metadata element from the API response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeApiResponse([aiJob]),
      });

      const records = await adapter.fetch();

      // Should only return the actual job, not the metadata
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe(101);
    });

    it('should filter for AI-related jobs only', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeApiResponse([aiJob, nonAiJob]),
      });

      const records = await adapter.fetch();

      expect(records).toHaveLength(1);
      expect(records[0].position).toBe('Machine Learning Engineer');
    });

    it('should return empty array when no AI-related jobs exist', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeApiResponse([nonAiJob]),
      });

      const records = await adapter.fetch();

      expect(records).toEqual([]);
    });

    it('should return empty array when API returns only metadata', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeApiResponse([]),
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
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(adapter.fetch()).rejects.toThrow('429');
    });

    it('should pass correct headers including User-Agent', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeApiResponse([]),
      });

      await adapter.fetch();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callOptions = global.fetch.mock.calls[0][1];
      expect(callOptions.headers).toHaveProperty('User-Agent');
      expect(callOptions.headers).toHaveProperty('Accept', 'application/json');
    });

    it('should handle non-array API response gracefully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'unexpected format' }),
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
        position: 'Senior ML Engineer',
        company: 'DeepTech',
        tags: ['machine-learning', 'python', 'tensorflow'],
        description: '<p>Build <strong>ML</strong> pipelines for production systems.</p>',
        url: 'https://remoteok.com/remote-jobs/101',
        date: '2026-01-15T00:00:00+00:00',
        location: 'Worldwide',
        salary_min: 120000,
        salary_max: 180000,
      },
      {
        id: 202,
        position: 'AI Research Scientist',
        company: 'LabAI',
        tags: ['deep-learning', 'research'],
        description: 'Conduct cutting-edge AI research.',
        url: 'https://remoteok.com/remote-jobs/202',
        date: '2026-02-01T00:00:00+00:00',
        location: 'US Only',
        salary_min: 150000,
        salary_max: null,
      },
    ];

    it('should map all fields correctly', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed).toHaveLength(2);

      const first = transformed[0];
      expect(first.type).toBe('ai_job');
      expect(first.source).toBe('remote_ok');
      expect(first.sourceId).toBe('101');
      expect(first.title).toBe('Senior ML Engineer \u2014 DeepTech');
      expect(first.description).toBe('Build ML pipelines for production systems.');
      expect(first.sourceUrl).toBe('https://remoteok.com/remote-jobs/101');
      expect(first.status).toBe('active');
      expect(first.category).toBe('AI/ML');
      expect(first.tags).toEqual(['machine-learning', 'python', 'tensorflow']);
      expect(first.location).toBe('Worldwide');
      expect(first.value).toBe(180000);
      expect(first.publishedAt).toEqual(new Date('2026-01-15T00:00:00+00:00'));
      expect(first.expiresAt).toBeNull();
      expect(first.sourceData).toBe(sampleRawRecords[0]);
    });

    it('should prefer salary_max over salary_min', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].value).toBe(180000);
    });

    it('should fall back to salary_min when salary_max is null', () => {
      const transformed = adapter.transform(sampleRawRecords);

      // Second record has salary_max = null, salary_min = 150000
      expect(transformed[1].value).toBe(150000);
    });

    it('should strip HTML from description', () => {
      const transformed = adapter.transform(sampleRawRecords);

      expect(transformed[0].description).not.toContain('<p>');
      expect(transformed[0].description).not.toContain('<strong>');
      expect(transformed[0].description).toBe('Build ML pipelines for production systems.');
    });

    it('should truncate description to 2000 characters', () => {
      const longDescription = '<p>' + 'A'.repeat(3000) + '</p>';
      const records = [{ ...sampleRawRecords[0], description: longDescription }];

      const transformed = adapter.transform(records);

      expect(transformed[0].description.length).toBeLessThanOrEqual(2000);
    });

    it('should handle missing/null fields gracefully', () => {
      const sparseRecords = [
        {
          id: 999,
          // position, company, description, url, date, location, salary all missing
        },
      ];

      const transformed = adapter.transform(sparseRecords);

      expect(transformed).toHaveLength(1);
      const record = transformed[0];
      expect(record.type).toBe('ai_job');
      expect(record.source).toBe('remote_ok');
      expect(record.sourceId).toBe('999');
      expect(record.title).toBe('Untitled \u2014 Unknown');
      expect(record.description).toBe('');
      expect(record.sourceUrl).toBe('https://remoteok.com/remote-jobs/999');
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
      const manyTags = Array.from({ length: 15 }, (_, i) => `tag-${i}`);
      const records = [{ ...sampleRawRecords[0], tags: manyTags }];

      const transformed = adapter.transform(records);

      expect(transformed[0].tags).toHaveLength(10);
    });

    it('should convert sourceId to string', () => {
      const records = [{ ...sampleRawRecords[0], id: 12345 }];

      const transformed = adapter.transform(records);

      expect(typeof transformed[0].sourceId).toBe('string');
      expect(transformed[0].sourceId).toBe('12345');
    });
  });
});
