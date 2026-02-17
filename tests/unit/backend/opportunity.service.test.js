const { Op, fn, col, literal } = require('sequelize');

// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const { Op, fn, col, literal } = require('sequelize');
  const mockOpportunity = {
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    count: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
  const mockDataSource = {};
  return {
    Opportunity: mockOpportunity,
    DataSource: mockDataSource,
    Sequelize: { Op },
    sequelize: {},
  };
});

const { Opportunity } = require('../../../backend/src/models');
const opportunityService = require('../../../backend/src/opportunities/opportunity.service');

describe('OpportunityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listOpportunities', () => {
    it('should return paginated results with no filters', async () => {
      const mockRows = [
        { id: 1, title: 'Federal AI Contract', type: 'gov_contract' },
        { id: 2, title: 'ML Engineer Position', type: 'ai_job' },
      ];
      Opportunity.findAndCountAll.mockResolvedValue({ rows: mockRows, count: 50 });

      const result = await opportunityService.listOpportunities({});

      expect(result.results).toEqual(mockRows);
      expect(result.pagination).toEqual({
        total: 50,
        page: 1,
        limit: 20,
        pages: 3,
      });
      expect(Opportunity.findAndCountAll).toHaveBeenCalledTimes(1);
    });

    it('should filter by type', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ type: 'gov_contract' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.type).toBe('gov_contract');
    });

    it('should filter by category', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ category: 'IT' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.category).toBe('IT');
    });

    it('should filter by status (defaults to active)', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({});

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.status).toBe('active');
    });

    it('should filter by explicit status', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ status: 'closed' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.status).toBe('closed');
    });

    it('should use Op.iLike for keyword search on title and description', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ q: 'machine learning' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where[Op.or]).toBeDefined();
      expect(callArgs.where[Op.or]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: { [Op.iLike]: '%machine learning%' } }),
          expect.objectContaining({ description: { [Op.iLike]: '%machine learning%' } }),
        ])
      );
    });

    it('should filter by date range on publishedAt', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.publishedAt).toBeDefined();
      expect(callArgs.where.publishedAt[Op.gte]).toBeDefined();
      expect(callArgs.where.publishedAt[Op.lte]).toBeDefined();
    });

    it('should filter by minScore on aiScore', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ minScore: 75 });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.aiScore).toBeDefined();
      expect(callArgs.where.aiScore[Op.gte]).toBe(75);
    });

    it('should filter by tags using Op.overlap', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ tags: 'Python,TensorFlow' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.tags).toBeDefined();
      expect(callArgs.where.tags[Op.overlap]).toEqual(['Python', 'TensorFlow']);
    });

    it('should combine multiple filters', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({
        type: 'gov_contract',
        category: 'IT',
        status: 'active',
        q: 'AI',
        minScore: 50,
      });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.type).toBe('gov_contract');
      expect(callArgs.where.category).toBe('IT');
      expect(callArgs.where.status).toBe('active');
      expect(callArgs.where[Op.or]).toBeDefined();
      expect(callArgs.where.aiScore[Op.gte]).toBe(50);
    });

    it('should sort by oldest (publishedAt ASC)', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ sort: 'oldest' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order).toEqual([['published_at', 'ASC']]);
    });

    it('should sort by score (aiScore DESC NULLS LAST)', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ sort: 'score' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order).toEqual([['ai_score', 'DESC NULLS LAST']]);
    });

    it('should sort by value (value DESC NULLS LAST)', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({ sort: 'value' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order).toBeDefined();
      expect(callArgs.order.length).toBe(1);
    });

    it('should default sort to newest (publishedAt DESC)', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await opportunityService.listOpportunities({});

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order).toEqual([['published_at', 'DESC']]);
    });

    it('should respect pagination parameters', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 100 });

      const result = await opportunityService.listOpportunities({ page: 3, limit: 10 });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.offset).toBe(20); // (3-1) * 10
      expect(callArgs.limit).toBe(10);
      expect(result.pagination).toEqual({
        total: 100,
        page: 3,
        limit: 10,
        pages: 10,
      });
    });

    it('should echo applied filters in the response', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await opportunityService.listOpportunities({
        type: 'ai_job',
        q: 'engineer',
      });

      expect(result.filters).toBeDefined();
      expect(result.filters.type).toBe('ai_job');
      expect(result.filters.q).toBe('engineer');
    });
  });

  describe('getOpportunityById', () => {
    it('should return opportunity when found', async () => {
      const mockOpp = {
        id: 1,
        title: 'Federal AI Contract',
        type: 'gov_contract',
        source: 'sam_gov',
      };
      Opportunity.findByPk.mockResolvedValue(mockOpp);

      const result = await opportunityService.getOpportunityById(1);

      expect(result).toEqual(mockOpp);
      expect(Opportunity.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
    });

    it('should throw 404 when opportunity not found', async () => {
      Opportunity.findByPk.mockResolvedValue(null);

      await expect(opportunityService.getOpportunityById(999))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getOpportunityStats', () => {
    it('should return aggregated statistics', async () => {
      // Mock the 8 parallel calls in Promise.all order:
      // 1. total count
      Opportunity.count
        .mockResolvedValueOnce(50)    // total
        .mockResolvedValueOnce(20)    // gov_contract
        .mockResolvedValueOnce(15)    // ai_job
        .mockResolvedValueOnce(10)    // investment
        .mockResolvedValueOnce(5);    // recent (last 7 days)

      // Status counts (findAll with group)
      Opportunity.findAll.mockResolvedValue([
        { status: 'active', count: '40' },
        { status: 'closed', count: '8' },
        { status: 'expired', count: '2' },
      ]);

      // Average score (findOne)
      Opportunity.findOne
        .mockResolvedValueOnce({ avgScore: '72.50' })  // avg AI score
        .mockResolvedValueOnce({ totalValue: '5000000' }); // total value

      const result = await opportunityService.getOpportunityStats();

      expect(result.total).toBe(50);
      expect(result.byType).toEqual({
        gov_contract: 20,
        ai_job: 15,
        investment: 10,
      });
      expect(result.byStatus).toEqual({
        active: 40,
        closed: 8,
        expired: 2,
      });
      expect(result.averageAiScore).toBe(72.5);
      expect(result.totalValue).toBe(5000000);
      expect(result.addedLast7Days).toBe(5);
    });

    it('should handle null averageAiScore when no scored opportunities exist', async () => {
      Opportunity.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      Opportunity.findAll.mockResolvedValue([]);
      Opportunity.findOne
        .mockResolvedValueOnce({ avgScore: null })
        .mockResolvedValueOnce({ totalValue: null });

      const result = await opportunityService.getOpportunityStats();

      expect(result.averageAiScore).toBeNull();
      expect(result.totalValue).toBeNull();
    });
  });
});
