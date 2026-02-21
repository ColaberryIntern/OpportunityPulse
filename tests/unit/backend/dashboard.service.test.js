// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockUser = { count: jest.fn() };
  const mockContent = { count: jest.fn() };
  const mockUserActivity = {
    findAndCountAll: jest.fn(),
    count: jest.fn(),
  };
  const mockOpportunity = { count: jest.fn() };
  return { User: mockUser, Content: mockContent, UserActivity: mockUserActivity, Opportunity: mockOpportunity };
});

const { User, Content, UserActivity, Opportunity } = require('../../../backend/src/models');
const dashboardService = require('../../../backend/src/dashboard/dashboard.service');

describe('DashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('should return aggregated platform stats with RSS signals', async () => {
      User.count.mockResolvedValue(42);
      Content.count.mockResolvedValueOnce(156); // totalContent
      Content.count.mockResolvedValueOnce(12);  // myContentCount
      UserActivity.count.mockResolvedValue(25);
      Opportunity.count
        .mockResolvedValueOnce(10)  // budget signals
        .mockResolvedValueOnce(8)   // actor signals
        .mockResolvedValueOnce(5)   // enterprise signals
        .mockResolvedValueOnce(3);  // compliance signals

      const result = await dashboardService.getStats(1);

      expect(result).toEqual({
        totalUsers: 42,
        totalContent: 156,
        myContentCount: 12,
        recentActivityCount: 25,
        rssSignals: { budget: 10, actor: 8, enterprise: 5, compliance: 3 },
      });
      expect(User.count).toHaveBeenCalledTimes(1);
      expect(Content.count).toHaveBeenCalledTimes(2);
      expect(Opportunity.count).toHaveBeenCalledTimes(4);
    });

    it('should return zeros when no data exists', async () => {
      User.count.mockResolvedValue(0);
      Content.count.mockResolvedValue(0);
      UserActivity.count.mockResolvedValue(0);
      Opportunity.count.mockResolvedValue(0);

      const result = await dashboardService.getStats(1);

      expect(result).toEqual({
        totalUsers: 0,
        totalContent: 0,
        myContentCount: 0,
        recentActivityCount: 0,
        rssSignals: { budget: 0, actor: 0, enterprise: 0, compliance: 0 },
      });
    });
  });

  describe('getActivity', () => {
    it('should return paginated activity for a user', async () => {
      const mockActivities = [
        { id: 1, action: 'login', metadata: {}, created_at: '2026-02-14T10:00:00Z' },
        { id: 2, action: 'content_view', metadata: { contentId: 5 }, created_at: '2026-02-14T09:00:00Z' },
      ];
      UserActivity.findAndCountAll.mockResolvedValue({
        rows: mockActivities,
        count: 25,
      });

      const result = await dashboardService.getActivity(1, { page: 1, limit: 20 });

      expect(result.activities).toEqual(mockActivities);
      expect(result.pagination).toEqual({
        total: 25,
        page: 1,
        limit: 20,
        pages: 2,
      });
      expect(UserActivity.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          order: [['created_at', 'DESC']],
          limit: 20,
          offset: 0,
        })
      );
    });

    it('should return empty array when user has no activity', async () => {
      UserActivity.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0,
      });

      const result = await dashboardService.getActivity(1, { page: 1, limit: 20 });

      expect(result.activities).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.pages).toBe(0);
    });

    it('should handle pagination offset correctly', async () => {
      UserActivity.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 50,
      });

      await dashboardService.getActivity(1, { page: 3, limit: 10 });

      expect(UserActivity.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 20, // (3-1) * 10
          limit: 10,
        })
      );
    });

    it('should apply default pagination when not provided', async () => {
      UserActivity.findAndCountAll.mockResolvedValue({
        rows: [],
        count: 0,
      });

      await dashboardService.getActivity(1, {});

      expect(UserActivity.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 0,
          limit: 20,
        })
      );
    });
  });
});
