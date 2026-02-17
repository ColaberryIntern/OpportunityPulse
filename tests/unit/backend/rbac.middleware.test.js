const { checkPermissions } = require('../../../backend/src/middleware/rbac.middleware');

describe('RBAC Middleware - checkPermissions', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: null };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it('should call next() when user has the required role', () => {
    req.user = { userId: 1, role: 'admin' };
    const middleware = checkPermissions('admin');

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should call next() when user has one of multiple required roles', () => {
    req.user = { userId: 1, role: 'consultant' };
    const middleware = checkPermissions('admin', 'consultant');

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should return 403 when user role is not in required roles', () => {
    req.user = { userId: 1, role: 'consultant' };
    const middleware = checkPermissions('admin');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', code: 403 })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when req.user is missing', () => {
    req.user = null;
    const middleware = checkPermissions('admin');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when req.user has no role', () => {
    req.user = { userId: 1 };
    const middleware = checkPermissions('admin');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should block auditor from admin-only routes', () => {
    req.user = { userId: 1, role: 'auditor' };
    const middleware = checkPermissions('admin');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should block devops from consultant-only routes', () => {
    req.user = { userId: 1, role: 'devops' };
    const middleware = checkPermissions('consultant');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
