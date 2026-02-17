// Mock models BEFORE importing service
jest.mock('../../../backend/src/models', () => ({
  Opportunity: {
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  },
}));

const { Opportunity } = require('../../../backend/src/models');
const {
  listPublicOpportunities,
  getPublicOpportunity,
  getPublicStats,
  AppError,
} = require('../../../backend/src/public/public.service');

describe('PublicService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listPublicOpportunities', () => {
    it('should return opportunities with pagination', async () => {
      const mockRows = [
        { id: 1, title: 'Federal AI Contract', type: 'gov_contract' },
        { id: 2, title: 'ML Engineer Position', type: 'ai_job' },
      ];
      Opportunity.findAndCountAll.mockResolvedValue({ rows: mockRows, count: 40 });

      const result = await listPublicOpportunities({ page: 1, limit: 10 });

      expect(result.opportunities).toEqual(mockRows);
      expect(result.pagination).toEqual({
        total: 40,
        page: 1,
        limit: 10,
        pages: 4,
      });
      expect(Opportunity.findAndCountAll).toHaveBeenCalledTimes(1);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where).toEqual({ status: 'active' });
      expect(callArgs.attributes).toEqual({ exclude: ['aiScore', 'aiAnalysis', 'sourceData'] });
      expect(callArgs.order).toEqual([['published_at', 'DESC']]);
    });

    it('should enforce max 20 per page when limit exceeds PUBLIC_MAX_LIMIT', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await listPublicOpportunities({ page: 1, limit: 50 });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.limit).toBe(20);
      expect(result.pagination.limit).toBe(20);
    });

    it('should filter by type when provided', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listPublicOpportunities({ type: 'gov_contract' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.type).toBe('gov_contract');
      expect(callArgs.where.status).toBe('active');
    });

    it('should filter by category when provided', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listPublicOpportunities({ category: 'IT' });

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.category).toBe('IT');
      expect(callArgs.where.status).toBe('active');
    });
  });

  describe('getPublicOpportunity', () => {
    it('should return the opportunity when found', async () => {
      const mockOpp = { id: 7, title: 'Open Data Platform RFP', status: 'active' };
      Opportunity.findOne.mockResolvedValue(mockOpp);

      const result = await getPublicOpportunity(7);

      expect(result).toEqual(mockOpp);
      expect(Opportunity.findOne).toHaveBeenCalledTimes(1);

      const callArgs = Opportunity.findOne.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: 7, status: 'active' });
      expect(callArgs.attributes).toEqual({ exclude: ['aiScore', 'aiAnalysis', 'sourceData'] });
    });

    it('should throw AppError with 404 when opportunity not found', async () => {
      Opportunity.findOne.mockResolvedValue(null);

      await expect(getPublicOpportunity(999)).rejects.toThrow(AppError);
      await expect(getPublicOpportunity(999)).rejects.toMatchObject({
        message: 'Opportunity not found.',
        statusCode: 404,
      });
    });
  });

  describe('getPublicStats', () => {
    it('should return counts by type', async () => {
      Opportunity.count
        .mockResolvedValueOnce(100)  // total active
        .mockResolvedValueOnce(40)   // gov_contract
        .mockResolvedValueOnce(35)   // ai_job
        .mockResolvedValueOnce(25);  // investment

      const result = await getPublicStats();

      expect(result).toEqual({
        totalActive: 100,
        byType: {
          gov_contract: 40,
          ai_job: 35,
          investment: 25,
        },
      });

      expect(Opportunity.count).toHaveBeenCalledTimes(4);

      // Verify each count call received the correct where clause
      expect(Opportunity.count.mock.calls[0][0]).toEqual({ where: { status: 'active' } });
      expect(Opportunity.count.mock.calls[1][0]).toEqual({ where: { status: 'active', type: 'gov_contract' } });
      expect(Opportunity.count.mock.calls[2][0]).toEqual({ where: { status: 'active', type: 'ai_job' } });
      expect(Opportunity.count.mock.calls[3][0]).toEqual({ where: { status: 'active', type: 'investment' } });
    });
  });
});
