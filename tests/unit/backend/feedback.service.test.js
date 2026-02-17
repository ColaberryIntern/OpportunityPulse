// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockFeedback = {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
  };
  const mockUser = {};
  const mockSequelize = {
    fn: jest.fn((...args) => ({ fn: true, args })),
    col: jest.fn((name) => ({ col: true, name })),
    literal: jest.fn((str) => ({ literal: true, str })),
  };
  return { Feedback: mockFeedback, User: mockUser, Sequelize: mockSequelize };
});

const { Feedback } = require('../../../backend/src/models');
const feedbackService = require('../../../backend/src/feedbackManager/feedback.service');

describe('FeedbackService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createFeedback', () => {
    it('should create feedback and re-fetch with user include', async () => {
      const mockCreated = { id: 1 };
      const mockFull = {
        id: 1,
        score: 4,
        comments: 'Great platform',
        type: 'platform',
        targetId: null,
        userId: 5,
        user: { id: 5, email: 'user@test.com', name: 'Test User' },
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          score: 4,
          comments: 'Great platform',
          type: 'platform',
          targetId: null,
          userId: 5,
          user: { id: 5, email: 'user@test.com', name: 'Test User' },
        }),
      };
      Feedback.create.mockResolvedValue(mockCreated);
      Feedback.findByPk.mockResolvedValue(mockFull);

      const result = await feedbackService.createFeedback(5, {
        score: 4,
        comments: 'Great platform',
        type: 'platform',
      });

      expect(result).toHaveProperty('score', 4);
      expect(result).toHaveProperty('user');
      expect(Feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 5, score: 4 })
      );
      expect(Feedback.findByPk).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ as: 'user' }),
          ]),
        })
      );
    });

    it('should default type to platform when not provided', async () => {
      const mockCreated = { id: 2 };
      const mockFull = {
        toJSON: jest.fn().mockReturnValue({ id: 2, type: 'platform' }),
      };
      Feedback.create.mockResolvedValue(mockCreated);
      Feedback.findByPk.mockResolvedValue(mockFull);

      await feedbackService.createFeedback(1, {
        score: 5,
        comments: 'Nice',
      });

      expect(Feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'platform' })
      );
    });
  });

  describe('listFeedback', () => {
    it('should return paginated feedback list', async () => {
      const mockRows = [
        { id: 1, score: 4 },
        { id: 2, score: 5 },
      ];
      Feedback.findAndCountAll.mockResolvedValue({ rows: mockRows, count: 50 });

      const result = await feedbackService.listFeedback({ page: 1, limit: 20 });

      expect(result.feedback).toEqual(mockRows);
      expect(result.pagination).toEqual({
        total: 50,
        page: 1,
        limit: 20,
        pages: 3,
      });
    });

    it('should filter by type when provided', async () => {
      Feedback.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await feedbackService.listFeedback({ page: 1, limit: 20, type: 'opportunity' });

      expect(Feedback.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'opportunity' }),
        })
      );
    });

    it('should filter by status when provided', async () => {
      Feedback.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await feedbackService.listFeedback({ page: 1, limit: 20, status: 'reviewed' });

      expect(Feedback.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'reviewed' }),
        })
      );
    });
  });

  describe('getFeedbackById', () => {
    it('should return feedback with user include', async () => {
      const mockFeedback = {
        id: 1,
        score: 4,
        userId: 5,
        user: { id: 5, email: 'user@test.com', name: 'Test User' },
      };
      Feedback.findByPk.mockResolvedValue(mockFeedback);

      const result = await feedbackService.getFeedbackById(1);

      expect(result).toEqual(mockFeedback);
      expect(Feedback.findByPk).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ as: 'user' }),
          ]),
        })
      );
    });

    it('should throw 404 when feedback not found', async () => {
      Feedback.findByPk.mockResolvedValue(null);

      await expect(feedbackService.getFeedbackById(999))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateFeedback', () => {
    it('should allow owner to update score and comments', async () => {
      const mockFeedback = {
        id: 1,
        userId: 5,
        score: 3,
        comments: 'Old comment',
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          userId: 5,
          score: 5,
          comments: 'Updated comment',
        }),
      };
      Feedback.findByPk.mockResolvedValue(mockFeedback);

      const result = await feedbackService.updateFeedback(1, 5, 'consultant', {
        score: 5,
        comments: 'Updated comment',
      });

      expect(mockFeedback.score).toBe(5);
      expect(mockFeedback.comments).toBe('Updated comment');
      expect(mockFeedback.save).toHaveBeenCalled();
    });

    it('should allow admin to change status', async () => {
      const mockFeedback = {
        id: 1,
        userId: 10,
        status: 'pending',
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({ id: 1, status: 'reviewed' }),
      };
      Feedback.findByPk.mockResolvedValue(mockFeedback);

      const result = await feedbackService.updateFeedback(1, 99, 'admin', {
        status: 'reviewed',
      });

      expect(mockFeedback.status).toBe('reviewed');
      expect(mockFeedback.save).toHaveBeenCalled();
    });

    it('should throw 403 for non-owner non-admin', async () => {
      const mockFeedback = { id: 1, userId: 10 };
      Feedback.findByPk.mockResolvedValue(mockFeedback);

      await expect(feedbackService.updateFeedback(1, 5, 'consultant', { score: 1 }))
        .rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('deleteFeedback', () => {
    it('should allow owner to delete feedback', async () => {
      const mockFeedback = {
        id: 1,
        userId: 5,
        destroy: jest.fn(),
      };
      Feedback.findByPk.mockResolvedValue(mockFeedback);

      await feedbackService.deleteFeedback(1, 5, 'consultant');

      expect(mockFeedback.destroy).toHaveBeenCalled();
    });

    it('should throw 403 for non-owner non-admin', async () => {
      const mockFeedback = { id: 1, userId: 10 };
      Feedback.findByPk.mockResolvedValue(mockFeedback);

      await expect(feedbackService.deleteFeedback(1, 5, 'consultant'))
        .rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
