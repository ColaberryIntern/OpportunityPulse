const { isBonfireEnabled, requireBonfireEnabled } = require('../../src/bonfire/bonfire.middleware');

describe('Bonfire feature flag middleware', () => {
  const origFlag = process.env.BONFIRE_ENGINE_ENABLED;
  afterEach(() => { process.env.BONFIRE_ENGINE_ENABLED = origFlag; });

  describe('isBonfireEnabled — reads env per-call (not cached at module load)', () => {
    it('returns true when env var is literally "true" (case-insensitive)', () => {
      process.env.BONFIRE_ENGINE_ENABLED = 'true';
      expect(isBonfireEnabled()).toBe(true);
      process.env.BONFIRE_ENGINE_ENABLED = 'TRUE';
      expect(isBonfireEnabled()).toBe(true);
    });

    it('returns false for any other value or when unset', () => {
      process.env.BONFIRE_ENGINE_ENABLED = 'false';
      expect(isBonfireEnabled()).toBe(false);
      process.env.BONFIRE_ENGINE_ENABLED = '1';
      expect(isBonfireEnabled()).toBe(false);
      process.env.BONFIRE_ENGINE_ENABLED = '';
      expect(isBonfireEnabled()).toBe(false);
      delete process.env.BONFIRE_ENGINE_ENABLED;
      expect(isBonfireEnabled()).toBe(false);
    });

    it('flips state within the same process (proves no module-load capture)', () => {
      process.env.BONFIRE_ENGINE_ENABLED = 'true';
      expect(isBonfireEnabled()).toBe(true);
      process.env.BONFIRE_ENGINE_ENABLED = 'false';
      expect(isBonfireEnabled()).toBe(false);
    });
  });

  describe('requireBonfireEnabled middleware', () => {
    function mockRes() {
      const r = {};
      r.status = jest.fn().mockReturnValue(r);
      r.json = jest.fn().mockReturnValue(r);
      return r;
    }

    it('calls next() when flag is on', () => {
      process.env.BONFIRE_ENGINE_ENABLED = 'true';
      const next = jest.fn();
      const res = mockRes();
      requireBonfireEnabled({ method: 'GET', originalUrl: '/api/v1/bonfire/opportunities' }, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 404 when flag is off', () => {
      process.env.BONFIRE_ENGINE_ENABLED = 'false';
      const next = jest.fn();
      const res = mockRes();
      requireBonfireEnabled({ method: 'GET', originalUrl: '/api/v1/bonfire/opportunities' }, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', code: 404 }));
    });
  });
});
