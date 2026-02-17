import api from '../services/api';
import opportunityService from '../services/opportunityService';

jest.mock('../services/api');

describe('opportunityService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list()', () => {
    it('should call GET /opportunities with query params', () => {
      const mockResponse = { data: { data: { results: [] }, pagination: {} } };
      api.get.mockResolvedValue(mockResponse);

      const params = {
        type: 'grant',
        category: 'education',
        status: 'active',
        q: 'stem',
        sort: 'score',
        minScore: 70,
        page: 2,
        limit: 10,
      };

      opportunityService.list(params);

      expect(api.get).toHaveBeenCalledTimes(1);
      const calledUrl = api.get.mock.calls[0][0];
      expect(calledUrl).toContain('/opportunities?');
      expect(calledUrl).toContain('page=2');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('type=grant');
      expect(calledUrl).toContain('category=education');
      expect(calledUrl).toContain('status=active');
      expect(calledUrl).toContain('q=stem');
      expect(calledUrl).toContain('sort=score');
      expect(calledUrl).toContain('minScore=70');
    });

    it('should only include truthy params', () => {
      const mockResponse = { data: { data: { results: [] }, pagination: {} } };
      api.get.mockResolvedValue(mockResponse);

      opportunityService.list({ page: 1, limit: 20 });

      const calledUrl = api.get.mock.calls[0][0];
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('limit=20');
      expect(calledUrl).not.toContain('type=');
      expect(calledUrl).not.toContain('category=');
      expect(calledUrl).not.toContain('status=');
      expect(calledUrl).not.toContain('q=');
      expect(calledUrl).not.toContain('sort=');
      expect(calledUrl).not.toContain('minScore=');
    });
  });

  describe('getById()', () => {
    it('should call GET /opportunities/:id', () => {
      const mockResponse = { data: { data: { opportunity: { id: 42 } } } };
      api.get.mockResolvedValue(mockResponse);

      opportunityService.getById(42);

      expect(api.get).toHaveBeenCalledWith('/opportunities/42');
    });
  });

  describe('getStats()', () => {
    it('should call GET /opportunities/stats', () => {
      const mockResponse = { data: { data: { stats: {} } } };
      api.get.mockResolvedValue(mockResponse);

      opportunityService.getStats();

      expect(api.get).toHaveBeenCalledWith('/opportunities/stats');
    });
  });
});
