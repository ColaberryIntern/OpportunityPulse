/**
 * Tests for freelance ingestion adapters.
 * Covers transform() for each adapter with sample data,
 * budget parsing, and edge cases.
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

jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

global.fetch = jest.fn();

describe('Freelance Adapters', () => {
  const makeDataSource = (overrides = {}) => ({
    id: 1,
    name: 'test-source',
    config: {},
    ...overrides,
  });

  describe('UpworkRssAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new UpworkRssAdapter(makeDataSource({
        config: { searches: ['AI'] },
      }));
    });

    describe('transform', () => {
      it('should transform RSS items to opportunity shape', () => {
        const items = [{
          guid: 'upwork-123',
          title: 'Build an AI Chatbot',
          content: '<p>Need an AI chatbot. Budget: $5,000-$10,000. Skills: Python, NLP, TensorFlow</p>',
          link: 'https://upwork.com/jobs/123',
          pubDate: '2026-02-20T10:00:00Z',
          categories: ['AI', 'Python'],
        }];

        const result = adapter.transform(items);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: 'freelance',
          source: 'upwork',
          sourceId: 'upwork-123',
          title: 'Build an AI Chatbot',
          status: 'active',
          category: 'Freelance',
          location: 'Remote',
          sourceData: expect.objectContaining({ platform: 'upwork' }),
        });
        expect(result[0].sourceUrl).toBe('https://upwork.com/jobs/123');
      });

      it('should parse fixed-price budget', () => {
        const items = [{
          guid: 'u1',
          title: 'Test',
          content: 'Budget: $5,000-$10,000',
          link: 'https://upwork.com/1',
        }];

        const result = adapter.transform(items);
        expect(result[0].value).toBe(10000);
      });

      it('should parse single fixed-price budget', () => {
        const items = [{
          guid: 'u2',
          title: 'Test',
          content: 'Fixed-Price: $3,500',
          link: 'https://upwork.com/2',
        }];

        const result = adapter.transform(items);
        expect(result[0].value).toBe(3500);
      });

      it('should parse hourly rate and estimate monthly', () => {
        const items = [{
          guid: 'u3',
          title: 'Test',
          content: 'Hourly: $50-$100/hr',
          link: 'https://upwork.com/3',
        }];

        const result = adapter.transform(items);
        // $100/hr * 160 hours = $16,000
        expect(result[0].value).toBe(16000);
      });

      it('should handle missing budget', () => {
        const items = [{
          guid: 'u4',
          title: 'Test',
          content: 'Just a description without budget info.',
          link: 'https://upwork.com/4',
        }];

        const result = adapter.transform(items);
        expect(result[0].value).toBeNull();
      });

      it('should extract skills from categories', () => {
        const items = [{
          guid: 'u5',
          title: 'Test',
          content: '',
          link: 'https://upwork.com/5',
          categories: ['Machine Learning', 'Python', 'TensorFlow'],
        }];

        const result = adapter.transform(items);
        expect(result[0].tags).toContain('Machine Learning');
        expect(result[0].tags).toContain('Python');
      });

      it('should extract skills from description Skills: section', () => {
        const items = [{
          guid: 'u6',
          title: 'Test',
          contentSnippet: 'Description here. Skills: React, Node.js, TypeScript',
          link: 'https://upwork.com/6',
        }];

        const result = adapter.transform(items);
        expect(result[0].tags).toContain('React');
        expect(result[0].tags).toContain('Node.js');
      });

      it('should limit skills to 10', () => {
        const items = [{
          guid: 'u7',
          title: 'Test',
          content: '',
          categories: Array.from({ length: 20 }, (_, i) => `skill-${i}`),
          link: 'https://upwork.com/7',
        }];

        const result = adapter.transform(items);
        expect(result[0].tags.length).toBeLessThanOrEqual(10);
      });

      it('should strip HTML from content', () => {
        const items = [{
          guid: 'u8',
          title: 'Test',
          content: '<p>Build an <b>AI</b> model for <a href="#">our company</a></p>',
          link: 'https://upwork.com/8',
        }];

        const result = adapter.transform(items);
        expect(result[0].description).not.toContain('<');
        expect(result[0].description).toContain('Build an AI model');
      });

      it('should truncate description to 2000 chars', () => {
        const items = [{
          guid: 'u9',
          title: 'Test',
          content: 'A'.repeat(3000),
          link: 'https://upwork.com/9',
        }];

        const result = adapter.transform(items);
        expect(result[0].description.length).toBeLessThanOrEqual(2000);
      });

      it('should truncate title to 500 chars', () => {
        const items = [{
          guid: 'u10',
          title: 'T'.repeat(600),
          content: '',
          link: 'https://upwork.com/10',
        }];

        const result = adapter.transform(items);
        expect(result[0].title.length).toBeLessThanOrEqual(500);
      });

      it('should handle empty RSS item gracefully', () => {
        const items = [{}];
        const result = adapter.transform(items);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('freelance');
        expect(result[0].title).toBe('Untitled Project');
      });
    });
  });

  describe('FreelancerApiAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new FreelancerApiAdapter(makeDataSource({
        config: { searches: ['AI'] },
      }));
    });

    describe('transform', () => {
      it('should transform API projects to opportunity shape', () => {
        const projects = [{
          id: 12345,
          title: 'Machine Learning Pipeline',
          preview_description: 'Build an ML pipeline for data processing',
          seo_url: 'machine-learning-pipeline',
          budget: { minimum: 2000, maximum: 5000 },
          jobs: [{ name: 'Python' }, { name: 'Machine Learning' }],
          time_submitted: 1708387200,
          bid_stats: { bid_count: 15 },
          owner: {
            location: { country: { name: 'United States' } },
            employer_reputation: {
              entire_history: { overall: 4.8, reviews: 50 },
            },
          },
          currency: { code: 'USD' },
        }];

        const result = adapter.transform(projects);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: 'freelance',
          source: 'freelancer',
          sourceId: '12345',
          title: 'Machine Learning Pipeline',
          status: 'active',
          value: 5000,
          tags: ['Python', 'Machine Learning'],
        });
        expect(result[0].sourceData).toMatchObject({
          platform: 'freelancer',
          budget_minimum: 2000,
          budget_maximum: 5000,
          currency: 'USD',
          bid_count: 15,
          client_rating: 4.8,
          client_reviews: 50,
        });
      });

      it('should use budget_minimum when no maximum', () => {
        const projects = [{
          id: 1,
          title: 'Test',
          budget: { minimum: 500, maximum: null },
          jobs: [],
        }];

        const result = adapter.transform(projects);
        expect(result[0].value).toBe(500);
      });

      it('should handle missing budget', () => {
        const projects = [{
          id: 2,
          title: 'Test',
          budget: {},
          jobs: [],
        }];

        const result = adapter.transform(projects);
        expect(result[0].value).toBeNull();
      });

      it('should extract skills from jobs array', () => {
        const projects = [{
          id: 3,
          title: 'Test',
          jobs: [{ name: 'Python' }, { name: 'Django' }, { name: 'REST API' }],
        }];

        const result = adapter.transform(projects);
        expect(result[0].tags).toEqual(['Python', 'Django', 'REST API']);
      });

      it('should default location to Remote when owner has no location', () => {
        const projects = [{
          id: 4,
          title: 'Test',
          jobs: [],
          owner: {},
        }];

        const result = adapter.transform(projects);
        expect(result[0].location).toBe('Remote');
      });

      it('should construct sourceUrl from seo_url', () => {
        const projects = [{
          id: 5,
          title: 'Test',
          seo_url: 'my-ai-project',
          jobs: [],
        }];

        const result = adapter.transform(projects);
        expect(result[0].sourceUrl).toBe('https://www.freelancer.com/projects/my-ai-project');
      });

      it('should fall back to id in sourceUrl when no seo_url', () => {
        const projects = [{
          id: 6,
          title: 'Test',
          jobs: [],
        }];

        const result = adapter.transform(projects);
        expect(result[0].sourceUrl).toBe('https://www.freelancer.com/projects/6');
      });

      it('should convert time_submitted epoch to Date', () => {
        const projects = [{
          id: 7,
          title: 'Test',
          time_submitted: 1708387200,
          jobs: [],
        }];

        const result = adapter.transform(projects);
        expect(result[0].publishedAt).toBeInstanceOf(Date);
      });
    });
  });

  describe('LinkedInManualAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new LinkedInManualAdapter(makeDataSource());
    });

    describe('fetch', () => {
      it('should return config importData', async () => {
        const ds = makeDataSource({
          config: { importData: [{ id: 'li-1', title: 'Test' }] },
        });
        const a = new LinkedInManualAdapter(ds);
        const result = await a.fetch();
        expect(result).toHaveLength(1);
      });

      it('should return empty array when no importData', async () => {
        const result = await adapter.fetch();
        expect(result).toEqual([]);
      });
    });

    describe('transform', () => {
      it('should transform LinkedIn records to opportunity shape', () => {
        const records = [{
          id: 'li-001',
          title: 'AI Engineer Needed',
          description: 'Looking for an AI engineer to build NLP system',
          url: 'https://linkedin.com/jobs/123',
          budget: 8000,
          skills: ['Python', 'NLP', 'BERT'],
          company: 'TechCorp',
          location: 'San Francisco, CA',
          postedAt: '2026-02-15T00:00:00Z',
        }];

        const result = adapter.transform(records);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: 'freelance',
          source: 'linkedin',
          sourceId: 'li-001',
          title: 'AI Engineer Needed',
          value: 8000,
          location: 'San Francisco, CA',
          tags: ['Python', 'NLP', 'BERT'],
        });
        expect(result[0].sourceData).toMatchObject({
          platform: 'linkedin',
          company: 'TechCorp',
          budget: 8000,
        });
      });

      it('should default title when missing', () => {
        const records = [{ id: 'li-002' }];
        const result = adapter.transform(records);
        expect(result[0].title).toBe('Untitled LinkedIn Project');
      });

      it('should default location to Remote', () => {
        const records = [{ id: 'li-003' }];
        const result = adapter.transform(records);
        expect(result[0].location).toBe('Remote');
      });

      it('should handle empty skills array', () => {
        const records = [{ id: 'li-004', skills: [] }];
        const result = adapter.transform(records);
        expect(result[0].tags).toEqual([]);
      });

      it('should filter out null/empty skills', () => {
        const records = [{ id: 'li-005', skills: ['Python', null, '', 'React'] }];
        const result = adapter.transform(records);
        expect(result[0].tags).toEqual(['Python', 'React']);
      });
    });
  });

  describe('GenericFreelanceRssAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new GenericFreelanceRssAdapter(makeDataSource({
        config: { feeds: [] },
      }));
    });

    describe('fetch', () => {
      it('should return empty array when no feeds configured', async () => {
        const result = await adapter.fetch();
        expect(result).toEqual([]);
      });
    });

    describe('transform', () => {
      it('should transform generic RSS items to opportunity shape', () => {
        const items = [{
          guid: 'toptal-789',
          title: 'Senior AI Developer',
          content: '<p>Looking for a senior AI developer</p>',
          link: 'https://toptal.com/jobs/789',
          pubDate: '2026-02-20T10:00:00Z',
          categories: ['AI', 'Senior'],
          _platform: 'toptal',
          _feedUrl: 'https://toptal.com/feed/jobs',
        }];

        const result = adapter.transform(items);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          type: 'freelance',
          source: 'toptal',
          sourceId: 'toptal-789',
          title: 'Senior AI Developer',
          status: 'active',
          category: 'Freelance',
          tags: ['AI', 'Senior'],
        });
        expect(result[0].sourceData).toMatchObject({
          platform: 'toptal',
          feedUrl: 'https://toptal.com/feed/jobs',
        });
      });

      it('should default platform to unknown', () => {
        const items = [{
          guid: 'x1',
          title: 'Test',
          content: '',
        }];

        const result = adapter.transform(items);
        expect(result[0].source).toBe('unknown');
      });

      it('should set value to null (no budget in generic RSS)', () => {
        const items = [{
          guid: 'x2',
          title: 'Test',
          content: '',
          _platform: 'guru',
        }];

        const result = adapter.transform(items);
        expect(result[0].value).toBeNull();
      });

      it('should strip HTML from content', () => {
        const items = [{
          guid: 'x3',
          title: 'Test',
          content: '<h1>Title</h1><p>Build <strong>ML</strong> model</p>',
          _platform: 'guru',
        }];

        const result = adapter.transform(items);
        expect(result[0].description).not.toContain('<');
        expect(result[0].description).toContain('Build ML model');
      });

      it('should use link as fallback sourceId when no guid', () => {
        const items = [{
          link: 'https://guru.com/job/999',
          title: 'Test',
          content: '',
          _platform: 'guru',
        }];

        const result = adapter.transform(items);
        expect(result[0].sourceId).toBe('https://guru.com/job/999');
      });

      it('should handle empty categories', () => {
        const items = [{
          guid: 'x4',
          title: 'Test',
          content: '',
          categories: [],
          _platform: 'guru',
        }];

        const result = adapter.transform(items);
        expect(result[0].tags).toEqual([]);
      });
    });
  });

  describe('Common contract across all adapters', () => {
    it('all adapters should set type to freelance', () => {
      const upwork = new UpworkRssAdapter(makeDataSource({ config: { searches: [] } }));
      const freelancer = new FreelancerApiAdapter(makeDataSource({ config: { searches: [] } }));
      const linkedin = new LinkedInManualAdapter(makeDataSource());
      const generic = new GenericFreelanceRssAdapter(makeDataSource({ config: { feeds: [] } }));

      const u = upwork.transform([{ guid: 'g1', title: 'T', content: '' }]);
      const f = freelancer.transform([{ id: 1, title: 'T', jobs: [] }]);
      const l = linkedin.transform([{ id: 'li-1', title: 'T' }]);
      const g = generic.transform([{ guid: 'g2', title: 'T', _platform: 'test', content: '' }]);

      expect(u[0].type).toBe('freelance');
      expect(f[0].type).toBe('freelance');
      expect(l[0].type).toBe('freelance');
      expect(g[0].type).toBe('freelance');
    });

    it('all adapters should set status to active', () => {
      const upwork = new UpworkRssAdapter(makeDataSource({ config: { searches: [] } }));
      const freelancer = new FreelancerApiAdapter(makeDataSource({ config: { searches: [] } }));
      const linkedin = new LinkedInManualAdapter(makeDataSource());
      const generic = new GenericFreelanceRssAdapter(makeDataSource({ config: { feeds: [] } }));

      const u = upwork.transform([{ guid: 'g1', title: 'T', content: '' }]);
      const f = freelancer.transform([{ id: 1, title: 'T', jobs: [] }]);
      const l = linkedin.transform([{ id: 'li-1', title: 'T' }]);
      const g = generic.transform([{ guid: 'g2', title: 'T', _platform: 'test', content: '' }]);

      expect(u[0].status).toBe('active');
      expect(f[0].status).toBe('active');
      expect(l[0].status).toBe('active');
      expect(g[0].status).toBe('active');
    });

    it('all adapters should set category to Freelance', () => {
      const upwork = new UpworkRssAdapter(makeDataSource({ config: { searches: [] } }));
      const freelancer = new FreelancerApiAdapter(makeDataSource({ config: { searches: [] } }));
      const linkedin = new LinkedInManualAdapter(makeDataSource());
      const generic = new GenericFreelanceRssAdapter(makeDataSource({ config: { feeds: [] } }));

      const u = upwork.transform([{ guid: 'g1', title: 'T', content: '' }]);
      const f = freelancer.transform([{ id: 1, title: 'T', jobs: [] }]);
      const l = linkedin.transform([{ id: 'li-1', title: 'T' }]);
      const g = generic.transform([{ guid: 'g2', title: 'T', _platform: 'test', content: '' }]);

      expect(u[0].category).toBe('Freelance');
      expect(f[0].category).toBe('Freelance');
      expect(l[0].category).toBe('Freelance');
      expect(g[0].category).toBe('Freelance');
    });
  });
});
