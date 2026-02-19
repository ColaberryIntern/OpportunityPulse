// Mock ioredis before importing
const mockGet = jest.fn();
const mockSetex = jest.fn().mockResolvedValue('OK');
const mockKeys = jest.fn();
const mockDel = jest.fn().mockResolvedValue(1);
const mockConnect = jest.fn().mockResolvedValue();

let mockConnected = true;

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockGet,
    setex: mockSetex,
    keys: mockKeys,
    del: mockDel,
    connect: mockConnect,
    on: jest.fn((event, cb) => {
      if (event === 'connect') cb();
    }),
  }));
});

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Override isRedisConnected to be controllable
jest.mock('../../../backend/src/config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    get: mockGet,
    setex: mockSetex,
    keys: mockKeys,
    del: mockDel,
  })),
  isRedisConnected: jest.fn(() => mockConnected),
}));

const { cacheResponse, invalidateCache } = require('../../../backend/src/middleware/cache.middleware');
const { isRedisConnected } = require('../../../backend/src/config/redis');

describe('Cache Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnected = true;
    isRedisConnected.mockReturnValue(true);

    req = {
      user: { userId: 1 },
      query: {},
    };
    res = {
      statusCode: 200,
      json: jest.fn(),
    };
    next = jest.fn();
  });

  describe('cacheResponse', () => {
    it('should call next() and skip cache when Redis is disconnected', async () => {
      isRedisConnected.mockReturnValue(false);

      const middleware = cacheResponse('test', 60);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('should return cached data on cache HIT', async () => {
      const cachedData = { status: 'success', data: { count: 42 } };
      mockGet.mockResolvedValue(JSON.stringify(cachedData));

      const middleware = cacheResponse('test', 60);
      await middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith(cachedData);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() on cache MISS', async () => {
      mockGet.mockResolvedValue(null);

      const middleware = cacheResponse('test', 60);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should cache the response after a cache MISS', async () => {
      mockGet.mockResolvedValue(null);

      const middleware = cacheResponse('test', 60);
      await middleware(req, res, next);

      // Simulate controller calling res.json
      const responseData = { status: 'success', data: { value: 1 } };
      res.json(responseData);

      expect(mockSetex).toHaveBeenCalledWith(
        expect.stringContaining('cache:test:'),
        60,
        JSON.stringify(responseData)
      );
    });

    it('should not cache error responses', async () => {
      mockGet.mockResolvedValue(null);

      const middleware = cacheResponse('test', 60);
      await middleware(req, res, next);

      res.statusCode = 500;
      res.json({ status: 'error' });

      expect(mockSetex).not.toHaveBeenCalled();
    });

    it('should include user ID in cache key', async () => {
      mockGet.mockResolvedValue(null);
      req.user = { userId: 42 };

      const middleware = cacheResponse('dashboard', 60);
      await middleware(req, res, next);

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(':42:')
      );
    });

    it('should include query params in cache key', async () => {
      mockGet.mockResolvedValue(null);
      req.query = { page: '1', limit: '20' };

      const middleware = cacheResponse('list', 60);
      await middleware(req, res, next);

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('{"page":"1","limit":"20"}')
      );
    });

    it('should use "anon" for unauthenticated requests', async () => {
      mockGet.mockResolvedValue(null);
      req.user = undefined;

      const middleware = cacheResponse('public', 120);
      await middleware(req, res, next);

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining(':anon:')
      );
    });

    it('should gracefully handle Redis read errors', async () => {
      mockGet.mockRejectedValue(new Error('Redis timeout'));

      const middleware = cacheResponse('test', 60);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('should delete all keys matching pattern', async () => {
      mockKeys.mockResolvedValue(['cache:test:1:{}', 'cache:test:2:{}']);

      await invalidateCache('cache:test:*');

      expect(mockKeys).toHaveBeenCalledWith('cache:test:*');
      expect(mockDel).toHaveBeenCalledWith('cache:test:1:{}', 'cache:test:2:{}');
    });

    it('should not call del when no keys match', async () => {
      mockKeys.mockResolvedValue([]);

      await invalidateCache('cache:nonexistent:*');

      expect(mockDel).not.toHaveBeenCalled();
    });

    it('should skip invalidation when Redis is disconnected', async () => {
      isRedisConnected.mockReturnValue(false);

      await invalidateCache('cache:test:*');

      expect(mockKeys).not.toHaveBeenCalled();
    });

    it('should gracefully handle invalidation errors', async () => {
      mockKeys.mockRejectedValue(new Error('Redis error'));

      await expect(invalidateCache('cache:test:*')).resolves.toBeUndefined();
    });
  });
});
