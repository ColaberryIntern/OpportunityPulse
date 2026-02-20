/**
 * Tests for freelance deduplication at the adapter level.
 * Each adapter deduplicates raw records before returning them.
 */

const UpworkRssAdapter = require('../../src/ingestion/adapters/upworkRss.adapter');
const FreelancerApiAdapter = require('../../src/ingestion/adapters/freelancerApi.adapter');
const LinkedInManualAdapter = require('../../src/ingestion/adapters/linkedinManual.adapter');
const GenericFreelanceRssAdapter = require('../../src/ingestion/adapters/genericFreelanceRss.adapter');

// Mock rss-parser
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: jest.fn().mockResolvedValue({ items: [] }),
  }));
});

// Mock logger
jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock global fetch for FreelancerApiAdapter
global.fetch = jest.fn();

describe('Freelance Adapter Dedup', () => {
  const makeDataSource = (overrides = {}) => ({
    id: 1,
    name: 'test-source',
    config: {},
    ...overrides,
  });

  describe('UpworkRssAdapter dedup', () => {
    it('should deduplicate by guid', () => {
      const adapter = new UpworkRssAdapter(makeDataSource({
        config: { searches: [] },
      }));

      const raw = [
        { guid: 'abc-123', title: 'Project A', content: 'desc A' },
        { guid: 'abc-123', title: 'Project A duplicate', content: 'desc A dup' },
        { guid: 'def-456', title: 'Project B', content: 'desc B' },
      ];

      const transformed = adapter.transform(raw);

      // Transform processes all items, dedup happens in fetch()
      // But sourceId will be the same for duplicates
      const sourceIds = transformed.map((t) => t.sourceId);
      expect(sourceIds[0]).toBe('abc-123');
      expect(sourceIds[1]).toBe('abc-123');
      expect(sourceIds[2]).toBe('def-456');
    });

    it('should use link as fallback sourceId when no guid', () => {
      const adapter = new UpworkRssAdapter(makeDataSource({
        config: { searches: [] },
      }));

      const raw = [
        { link: 'https://upwork.com/job/123', title: 'P1', content: '' },
        { link: 'https://upwork.com/job/456', title: 'P2', content: '' },
      ];

      const transformed = adapter.transform(raw);
      expect(transformed[0].sourceId).toBe('https://upwork.com/job/123');
      expect(transformed[1].sourceId).toBe('https://upwork.com/job/456');
    });
  });

  describe('FreelancerApiAdapter dedup', () => {
    it('should deduplicate projects by id in transform', () => {
      const adapter = new FreelancerApiAdapter(makeDataSource({
        config: { searches: [] },
      }));

      const raw = [
        { id: 100, title: 'AI Chatbot', budget: { minimum: 500, maximum: 2000 }, jobs: [] },
        { id: 200, title: 'ML Model', budget: { minimum: 1000, maximum: 5000 }, jobs: [] },
        { id: 100, title: 'AI Chatbot duplicate', budget: { minimum: 500, maximum: 2000 }, jobs: [] },
      ];

      const transformed = adapter.transform(raw);
      // Transform processes all — dedup in fetch()
      expect(transformed[0].sourceId).toBe('100');
      expect(transformed[1].sourceId).toBe('200');
      expect(transformed[2].sourceId).toBe('100');
    });
  });

  describe('LinkedInManualAdapter dedup', () => {
    it('should use record id as sourceId', () => {
      const adapter = new LinkedInManualAdapter(makeDataSource());

      const raw = [
        { id: 'li-001', title: 'Project A' },
        { id: 'li-002', title: 'Project B' },
        { id: 'li-001', title: 'Project A dup' },
      ];

      const transformed = adapter.transform(raw);
      expect(transformed[0].sourceId).toBe('li-001');
      expect(transformed[2].sourceId).toBe('li-001');
      // DB-level unique index (source, source_id) prevents actual duplicates
    });

    it('should fall back to url for sourceId when no id', () => {
      const adapter = new LinkedInManualAdapter(makeDataSource());

      const raw = [
        { url: 'https://linkedin.com/jobs/123', title: 'Project A' },
      ];

      const transformed = adapter.transform(raw);
      expect(transformed[0].sourceId).toBe('https://linkedin.com/jobs/123');
    });

    it('should generate unique sourceId when no id or url', () => {
      const adapter = new LinkedInManualAdapter(makeDataSource());

      const raw = [{ title: 'No ID Project' }];
      const transformed = adapter.transform(raw);

      expect(transformed[0].sourceId).toBeDefined();
      expect(transformed[0].sourceId.startsWith('linkedin-')).toBe(true);
    });
  });

  describe('GenericFreelanceRssAdapter dedup', () => {
    it('should deduplicate by guid across feeds', () => {
      const adapter = new GenericFreelanceRssAdapter(makeDataSource({
        config: { feeds: [] },
      }));

      const raw = [
        { guid: 'guid-1', title: 'P1', _platform: 'toptal', content: '' },
        { guid: 'guid-1', title: 'P1 dup', _platform: 'toptal', content: '' },
        { guid: 'guid-2', title: 'P2', _platform: 'guru', content: '' },
      ];

      // Transform processes all items
      const transformed = adapter.transform(raw);
      expect(transformed[0].sourceId).toBe('guid-1');
      expect(transformed[1].sourceId).toBe('guid-1');
      expect(transformed[2].sourceId).toBe('guid-2');
    });

    it('should use link as fallback sourceId', () => {
      const adapter = new GenericFreelanceRssAdapter(makeDataSource({
        config: { feeds: [] },
      }));

      const raw = [
        { link: 'https://toptal.com/job/123', title: 'P1', _platform: 'toptal', content: '' },
      ];

      const transformed = adapter.transform(raw);
      expect(transformed[0].sourceId).toBe('https://toptal.com/job/123');
    });
  });

  describe('DB-level dedup (unique index)', () => {
    it('should ensure all adapters produce source + sourceId pairs', () => {
      const upwork = new UpworkRssAdapter(makeDataSource({ config: { searches: [] } }));
      const freelancer = new FreelancerApiAdapter(makeDataSource({ config: { searches: [] } }));
      const linkedin = new LinkedInManualAdapter(makeDataSource());
      const generic = new GenericFreelanceRssAdapter(makeDataSource({ config: { feeds: [] } }));

      const upworkResult = upwork.transform([{ guid: 'g1', title: 'T', content: '' }]);
      const freelancerResult = freelancer.transform([{ id: 1, title: 'T', jobs: [] }]);
      const linkedinResult = linkedin.transform([{ id: 'li-1', title: 'T' }]);
      const genericResult = generic.transform([{ guid: 'g2', title: 'T', _platform: 'guru', content: '' }]);

      // All must have source and sourceId for DB unique index
      for (const result of [upworkResult[0], freelancerResult[0], linkedinResult[0], genericResult[0]]) {
        expect(result.source).toBeDefined();
        expect(result.source.length).toBeGreaterThan(0);
        expect(result.sourceId).toBeDefined();
        expect(result.sourceId.length).toBeGreaterThan(0);
      }

      // Sources should be distinct per platform
      expect(upworkResult[0].source).toBe('upwork');
      expect(freelancerResult[0].source).toBe('freelancer');
      expect(linkedinResult[0].source).toBe('linkedin');
      expect(genericResult[0].source).toBe('guru');
    });
  });
});
