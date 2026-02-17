jest.mock('../../../backend/src/models', () => {
  const { Op } = require('sequelize');
  const mockContent = {
    findAndCountAll: jest.fn(),
  };
  const mockUser = {};
  return { Content: mockContent, User: mockUser, Sequelize: { Op } };
});

const { Content } = require('../../../backend/src/models');
const searchService = require('../../../backend/src/search/search.service');

describe('SearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should return paginated results with no filters', async () => {
      Content.findAndCountAll.mockResolvedValue({
        rows: [{ id: 1, title: 'Article' }],
        count: 1,
      });

      const result = await searchService.search({});

      expect(result.results).toHaveLength(1);
      expect(result.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      });
      expect(Content.findAndCountAll).toHaveBeenCalledTimes(1);
    });

    it('should filter by keyword (q) on title and body', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await searchService.search({ q: 'AI contracts' });

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      // Should have an OR condition for title and body matching
      expect(callArgs.where).toBeDefined();
    });

    it('should filter by category', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await searchService.search({ category: 'jobs' });

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.category).toBe('jobs');
    });

    it('should filter by status', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await searchService.search({ status: 'published' });

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.status).toBe('published');
    });

    it('should filter by tags (OR matching)', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await searchService.search({ tags: 'AI,government' });

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      // Tags filter should use overlap operator
      expect(callArgs.where.tags).toBeDefined();
    });

    it('should filter by date range', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await searchService.search({
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      });

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      // created_at should be set as a where condition
      expect(callArgs.where.created_at).toBeDefined();
      // Verify the filters echo includes dates
      expect(result.filters.dateFrom).toBe('2026-01-01');
      expect(result.filters.dateTo).toBe('2026-02-01');
    });

    it('should return empty results array (not 404) when nothing matches', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await searchService.search({ q: 'nonexistent' });

      expect(result.results).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('should sort by newest by default', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await searchService.search({});

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order).toEqual([['created_at', 'DESC']]);
    });

    it('should sort by oldest when requested', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await searchService.search({ sort: 'oldest' });

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order).toEqual([['created_at', 'ASC']]);
    });

    it('should handle pagination correctly', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 100 });

      const result = await searchService.search({ page: 3, limit: 10 });

      const callArgs = Content.findAndCountAll.mock.calls[0][0];
      expect(callArgs.offset).toBe(20);
      expect(callArgs.limit).toBe(10);
      expect(result.pagination).toEqual({
        total: 100,
        page: 3,
        limit: 10,
        pages: 10,
      });
    });

    it('should return applied filters in response', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await searchService.search({
        q: 'AI',
        category: 'contracts',
        status: 'published',
      });

      expect(result.filters).toEqual(
        expect.objectContaining({
          q: 'AI',
          category: 'contracts',
          status: 'published',
        })
      );
    });
  });
});
