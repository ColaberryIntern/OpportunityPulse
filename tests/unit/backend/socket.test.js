const mockUse = jest.fn();
const mockOn = jest.fn();
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    use: mockUse,
    on: mockOn,
    emit: mockEmit,
    to: mockTo,
  })),
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../backend/src/config/environment', () => ({
  env: {
    frontendUrl: 'http://localhost:3002',
    jwt: {
      secret: 'test-secret-that-is-long-enough-for-jwt',
    },
  },
}));

describe('Socket Config', () => {
  let socketModule;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the cached module so each test gets a fresh `io = null` state
    jest.resetModules();
  });

  describe('getIO', () => {
    it('should throw when Socket.IO is not initialized', () => {
      // Re-require after resetModules to get a fresh module with io = null
      const { getIO } = require('../../../backend/src/config/socket');

      expect(() => getIO()).toThrow('Socket.IO not initialized');
    });
  });

  describe('initializeSocket', () => {
    it('should return an io instance', () => {
      const { initializeSocket } = require('../../../backend/src/config/socket');
      const fakeHttpServer = {};

      const io = initializeSocket(fakeHttpServer);

      expect(io).toBeDefined();
      expect(io.use).toBeDefined();
      expect(io.on).toBeDefined();
      expect(io.emit).toBeDefined();
    });

    it('should set up JWT auth middleware', () => {
      const { initializeSocket } = require('../../../backend/src/config/socket');
      const fakeHttpServer = {};

      initializeSocket(fakeHttpServer);

      // io.use() should have been called at least once to register middleware
      expect(mockUse).toHaveBeenCalledTimes(1);
      expect(mockUse).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should set up a connection event handler', () => {
      const { initializeSocket } = require('../../../backend/src/config/socket');
      const fakeHttpServer = {};

      initializeSocket(fakeHttpServer);

      // io.on('connection', ...) should be registered
      expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should allow getIO after initialization', () => {
      const { initializeSocket, getIO } = require('../../../backend/src/config/socket');
      const fakeHttpServer = {};

      initializeSocket(fakeHttpServer);

      expect(() => getIO()).not.toThrow();
      const io = getIO();
      expect(io).toBeDefined();
    });
  });
});
