const jwt = require('jsonwebtoken');
const { verifyToken } = require('../../../backend/src/middleware/auth.middleware');

process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-chars';

describe('Auth Middleware - verifyToken', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() and set req.user with a valid token', () => {
    const token = jwt.sign(
      { userId: 1, email: 'test@example.com', role: 'consultant' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    req.headers.authorization = `Bearer ${token}`;

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe(1);
    expect(req.user.role).toBe('consultant');
  });

  it('should return 401 when no Authorization header is present', () => {
    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', code: 401 })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header does not start with Bearer', () => {
    req.headers.authorization = 'Basic sometoken';

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is malformed', () => {
    req.headers.authorization = 'Bearer not-a-valid-jwt';

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is expired', () => {
    const token = jwt.sign(
      { userId: 1, email: 'test@example.com', role: 'consultant' },
      process.env.JWT_SECRET,
      { expiresIn: '0s' } // immediately expired
    );
    req.headers.authorization = `Bearer ${token}`;

    // Small delay to ensure token is expired
    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('expired') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is signed with wrong secret', () => {
    const token = jwt.sign(
      { userId: 1, email: 'test@example.com', role: 'consultant' },
      'wrong-secret-key-that-is-different',
      { expiresIn: '15m' }
    );
    req.headers.authorization = `Bearer ${token}`;

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
