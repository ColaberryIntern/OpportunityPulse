const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../../../backend/src/config/socket', () => ({
  getIO: jest.fn(),
}));

jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { broadcast } = require('../../../backend/src/config/socketBroadcaster');
const { getIO } = require('../../../backend/src/config/socket');

describe('Socket Broadcaster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call io.emit for untargeted events', () => {
    getIO.mockReturnValue({ emit: mockEmit, to: mockTo });

    broadcast('opportunity:created', { id: 1, title: 'New Opp' });

    expect(mockEmit).toHaveBeenCalledWith('opportunity:created', { id: 1, title: 'New Opp' });
    // Should NOT use .to() since no userId provided
    expect(mockTo).not.toHaveBeenCalled();
  });

  it('should call io.to().emit for user-targeted events', () => {
    getIO.mockReturnValue({ emit: mockEmit, to: mockTo });

    broadcast('recommendation:updated', { recommendations: [] }, { userId: 'user-42' });

    expect(mockTo).toHaveBeenCalledWith('user:user-42');
    expect(mockEmit).toHaveBeenCalledWith('recommendation:updated', { recommendations: [] });
  });

  it('should silently handle errors when socket not initialized', () => {
    getIO.mockImplementation(() => { throw new Error('Socket.IO not initialized'); });

    // Should not throw
    expect(() => broadcast('test:event', { data: 'hello' })).not.toThrow();
  });
});
