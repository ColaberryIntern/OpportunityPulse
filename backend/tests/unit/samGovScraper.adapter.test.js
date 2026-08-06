// Mock global fetch for SAM.gov public-search calls
const originalFetch = global.fetch;
global.fetch = jest.fn();

// Mock logger
jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const SamGovScraperAdapter = require('../../src/ingestion/adapters/samGovScraper.adapter');

/** Build a SAM.gov public-search result in the real payload shape. */
function samResult(overrides = {}) {
  return {
    _id: 'abc123',
    title: 'AI/ML Support Services',
    isActive: true,
    isCanceled: false,
    publishDate: '2026-08-06T18:40:59+00:00',
    responseDate: '2026-08-20T15:00:00+00:00',
    solicitationNumber: 'HM047626Q0035',
    cleanSolicitationNumber: 'HM047626Q0035',
    type: { code: 'k', value: 'Combined Synopsis/Solicitation' },
    solicitation: { setAside: 'SBA', originalSetAside: null },
    descriptions: [{ content: '<p>Needs <strong>AI</strong> &amp; ML support.</p>' }],
    naics: [{ code: '541511', value: 'Custom Computer Programming Services' }],
    psc: [{ code: 'D307', value: 'IT AND TELECOM' }, { code: null, value: null }],
    organizationHierarchy: [
      { level: 1, name: 'DEPT OF DEFENSE' },
      { level: 2, name: 'NATIONAL GEOSPATIAL-INTELLIGENCE AGENCY (NGA)' },
      { level: 3, name: 'NATL GEOSPATIAL-INTELLIGENCE AGENCY' },
    ],
    placeOfPerformance: [{ state: 'VA', country: 'USA' }],
    award: { amount: null },
    ...overrides,
  };
}

function okResponse(results) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ _embedded: { results } }),
  };
}

describe('SamGovScraperAdapter', () => {
  let adapter;

  const mockDataSource = {
    id: 22,
    name: 'sam_gov_scraper',
    type: 'api',
    config: { keywords: ['artificial intelligence'], maxResults: 25 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    adapter = new SamGovScraperAdapter(mockDataSource);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  // ---------------------------------------------------------------
  // Request contract — the 406 bug this adapter shipped with
  // ---------------------------------------------------------------
  describe('request headers', () => {
    it('sends Accept: application/hal+json (plain application/json returns 406)', async () => {
      global.fetch.mockResolvedValue(okResponse([samResult()]));

      await adapter.fetch();

      const [, options] = global.fetch.mock.calls[0];
      expect(options.headers.Accept).toBe('application/hal+json');
    });

    it('requests the keyless public search endpoint', async () => {
      global.fetch.mockResolvedValue(okResponse([samResult()]));

      await adapter.fetch();

      const [url] = global.fetch.mock.calls[0];
      expect(url).toContain('https://sam.gov/api/prod/sgs/v1/search/');
      expect(url).not.toContain('api_key');
    });
  });

  // ---------------------------------------------------------------
  // Failure policy — never fabricate opportunities
  // ---------------------------------------------------------------
  describe('failure policy', () => {
    it('throws when every keyword fails, rather than returning placeholder data', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 503 });

      await expect(adapter.fetch()).rejects.toThrow(/failed for all/i);
    });

    it('throws on network error rather than returning placeholder data', async () => {
      global.fetch.mockRejectedValue(new Error('ECONNRESET'));

      await expect(adapter.fetch()).rejects.toThrow(/failed for all/i);
    });

    it('tolerates a partial failure when another keyword succeeds', async () => {
      const multi = new SamGovScraperAdapter({
        ...mockDataSource,
        config: { keywords: ['ai', 'ml'], maxResults: 5 },
      });
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce(okResponse([samResult()]));

      const records = await multi.fetch();

      expect(records).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------
  // Field mapping — public search uses different names from the keyed API
  // ---------------------------------------------------------------
  describe('field mapping', () => {
    it('maps the public-search field names onto the Opportunity shape', async () => {
      global.fetch.mockResolvedValue(okResponse([samResult()]));

      const [record] = adapter.transform(await adapter.fetch());

      expect(record.sourceId).toBe('abc123');
      expect(record.title).toBe('AI/ML Support Services');
      expect(record.source).toBe('sam_gov_scraper');
      expect(record.sourceUrl).toBe('https://sam.gov/opp/abc123/view');
      expect(record.category).toBe('541511');
      expect(record.location).toBe('VA');
      expect(record.publishedAt).toEqual(new Date('2026-08-06T18:40:59+00:00'));
      expect(record.expiresAt).toEqual(new Date('2026-08-20T15:00:00+00:00'));
    });

    it('strips HTML and entities out of the description body', async () => {
      global.fetch.mockResolvedValue(okResponse([samResult()]));

      const [record] = adapter.transform(await adapter.fetch());

      expect(record.description).toBe('Needs AI & ML support.');
    });

    it('attributes to the most specific organization level', async () => {
      global.fetch.mockResolvedValue(okResponse([samResult()]));

      const [record] = adapter.transform(await adapter.fetch());

      expect(record.tags).toContain('agency:NATL GEOSPATIAL-INTELLIGENCE AGENCY');
    });

    it('tags naics, psc, solicitation, set-aside and notice type', async () => {
      global.fetch.mockResolvedValue(okResponse([samResult()]));

      const [record] = adapter.transform(await adapter.fetch());

      expect(record.tags).toEqual(
        expect.arrayContaining([
          'naics:541511',
          'classification:D307',
          'sol:HM047626Q0035',
          'setaside:SBA',
          'type:Combined Synopsis/Solicitation',
        ])
      );
    });

    it('leaves dates null when SAM omits them instead of emitting Invalid Date', async () => {
      global.fetch.mockResolvedValue(
        okResponse([samResult({ publishDate: null, responseDate: 'not-a-date' })])
      );

      const [record] = adapter.transform(await adapter.fetch());

      expect(record.publishedAt).toBeNull();
      expect(record.expiresAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Filtering and deduplication
  // ---------------------------------------------------------------
  describe('filtering', () => {
    it('drops archived and cancelled notices', async () => {
      global.fetch.mockResolvedValue(
        okResponse([
          samResult({ _id: 'live' }),
          samResult({ _id: 'archived', isActive: false }),
          samResult({ _id: 'cancelled', isCanceled: true }),
        ])
      );

      const records = await adapter.fetch();

      expect(records).toHaveLength(1);
      expect(records[0].noticeId).toBe('live');
    });

    it('deduplicates the same notice returned by multiple keywords', async () => {
      const multi = new SamGovScraperAdapter({
        ...mockDataSource,
        config: { keywords: ['ai', 'ml'], maxResults: 5 },
      });
      global.fetch.mockResolvedValue(okResponse([samResult({ _id: 'dupe' })]));

      const records = await multi.fetch();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(records).toHaveLength(1);
    });

    it('returns an empty list when SAM returns no results', async () => {
      global.fetch.mockResolvedValue(okResponse([]));

      await expect(adapter.fetch()).resolves.toEqual([]);
    });
  });
});
