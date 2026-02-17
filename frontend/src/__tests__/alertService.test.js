import api from '../services/api';
import alertService from '../services/alertService';

jest.mock('../services/api');

describe('alertService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list()', () => {
    it('should call GET /alerts with query params', () => {
      const mockResponse = { data: { data: [], pagination: {} } };
      api.get.mockResolvedValue(mockResponse);

      const params = {
        type: 'opportunity_match',
        severity: 'high',
        unreadOnly: true,
        page: 3,
        limit: 15,
      };

      alertService.list(params);

      expect(api.get).toHaveBeenCalledTimes(1);
      const calledUrl = api.get.mock.calls[0][0];
      expect(calledUrl).toContain('/alerts?');
      expect(calledUrl).toContain('page=3');
      expect(calledUrl).toContain('limit=15');
      expect(calledUrl).toContain('type=opportunity_match');
      expect(calledUrl).toContain('severity=high');
      expect(calledUrl).toContain('unreadOnly=true');
    });

    it('should only include truthy params', () => {
      const mockResponse = { data: { data: [], pagination: {} } };
      api.get.mockResolvedValue(mockResponse);

      alertService.list({});

      const calledUrl = api.get.mock.calls[0][0];
      expect(calledUrl).toContain('page=1');
      expect(calledUrl).toContain('limit=20');
      expect(calledUrl).not.toContain('type=');
      expect(calledUrl).not.toContain('severity=');
      expect(calledUrl).not.toContain('unreadOnly=');
    });
  });

  describe('getUnreadCount()', () => {
    it('should call GET /alerts/unread', () => {
      const mockResponse = { data: { data: { unreadCount: 5 } } };
      api.get.mockResolvedValue(mockResponse);

      alertService.getUnreadCount();

      expect(api.get).toHaveBeenCalledWith('/alerts/unread');
    });
  });

  describe('markAsRead()', () => {
    it('should call PUT /alerts/:id/read', () => {
      api.put.mockResolvedValue({ data: {} });

      alertService.markAsRead(99);

      expect(api.put).toHaveBeenCalledWith('/alerts/99/read');
    });
  });

  describe('markAllAsRead()', () => {
    it('should call PUT /alerts/read-all', () => {
      api.put.mockResolvedValue({ data: {} });

      alertService.markAllAsRead();

      expect(api.put).toHaveBeenCalledWith('/alerts/read-all');
    });
  });

  describe('delete()', () => {
    it('should call DELETE /alerts/:id', () => {
      api.delete.mockResolvedValue({ data: {} });

      alertService.delete(42);

      expect(api.delete).toHaveBeenCalledWith('/alerts/42');
    });
  });
});
