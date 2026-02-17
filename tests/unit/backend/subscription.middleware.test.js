jest.mock('../../../backend/src/models', () => ({
  Subscription: { findOne: jest.fn() },
}));

const { Subscription } = require('../../../backend/src/models');
const { checkSubscription, checkPremiumQuery } = require('../../../backend/src/middleware/subscription.middleware');

describe('Subscription Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: null, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // checkSubscription
  // ---------------------------------------------------------------------------
  describe('checkSubscription', () => {
    it('should call next() for admin user regardless of subscription', async () => {
      req.user = { userId: 1, role: 'admin' };

      await checkSubscription('premium')(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(Subscription.findOne).not.toHaveBeenCalled();
    });

    it('should return 401 when no user on request', async () => {
      req.user = null;

      await checkSubscription('premium')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', code: 401, message: 'Access denied. Authentication required.' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user has no subscription record', async () => {
      req.user = { userId: 10, role: 'consultant' };
      Subscription.findOne.mockResolvedValue(null);

      await checkSubscription('premium')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          code: 403,
          message: 'Premium subscription required. Upgrade to access this feature.',
          errors: [{ upgradeRequired: true }],
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when subscription is expired', async () => {
      req.user = { userId: 10, role: 'consultant' };
      const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
      Subscription.findOne.mockResolvedValue({ planType: 'premium', endDate: pastDate });

      await checkSubscription('premium')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          code: 403,
          message: 'Your subscription has expired. Please renew to access this feature.',
          errors: [{ upgradeRequired: true, expired: true }],
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user has free plan and premium required', async () => {
      req.user = { userId: 10, role: 'consultant' };
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString(); // 30 days from now
      Subscription.findOne.mockResolvedValue({ planType: 'free', endDate: futureDate });

      await checkSubscription('premium')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          code: 403,
          message: 'Premium subscription required. Upgrade to access this feature.',
          errors: [{ upgradeRequired: true, currentPlan: 'free' }],
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() and attach subscription when user has premium plan', async () => {
      req.user = { userId: 10, role: 'consultant' };
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      const mockSub = { planType: 'premium', endDate: futureDate };
      Subscription.findOne.mockResolvedValue(mockSub);

      await checkSubscription('premium')(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.subscription).toBe(mockSub);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should call next() when required plan is free and user has free plan', async () => {
      req.user = { userId: 10, role: 'consultant' };
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      const mockSub = { planType: 'free', endDate: futureDate };
      Subscription.findOne.mockResolvedValue(mockSub);

      await checkSubscription('free')(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.subscription).toBe(mockSub);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // checkPremiumQuery
  // ---------------------------------------------------------------------------
  describe('checkPremiumQuery', () => {
    it('should call next() when no premium params are present in query', async () => {
      req.user = { userId: 10, role: 'consultant' };
      req.query = { page: '1', limit: '20' };

      await checkPremiumQuery('minScore', 'advancedFilter')(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(Subscription.findOne).not.toHaveBeenCalled();
    });

    it('should call next() for admin user even with premium params', async () => {
      req.user = { userId: 1, role: 'admin' };
      req.query = { minScore: '80' };

      await checkPremiumQuery('minScore')(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(Subscription.findOne).not.toHaveBeenCalled();
    });

    it('should return 403 when free user uses premium param', async () => {
      req.user = { userId: 10, role: 'consultant' };
      req.query = { minScore: '80' };
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      Subscription.findOne.mockResolvedValue({ planType: 'free', endDate: futureDate });

      await checkPremiumQuery('minScore', 'advancedFilter')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          code: 403,
          message: 'Premium subscription required to use filter: minScore.',
          errors: [{ upgradeRequired: true, premiumParams: ['minScore'] }],
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() when premium user uses premium param', async () => {
      req.user = { userId: 10, role: 'consultant' };
      req.query = { minScore: '80' };
      const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
      const mockSub = { planType: 'premium', endDate: futureDate };
      Subscription.findOne.mockResolvedValue(mockSub);

      await checkPremiumQuery('minScore')(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.subscription).toBe(mockSub);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
