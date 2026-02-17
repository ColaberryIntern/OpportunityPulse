// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockForumPost = {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
  };
  const mockComment = {
    create: jest.fn(),
    findByPk: jest.fn(),
  };
  const mockUser = {};
  const mockSequelize = {
    literal: jest.fn((str) => ({ literal: true, str })),
  };
  return { ForumPost: mockForumPost, Comment: mockComment, User: mockUser, sequelize: mockSequelize };
});

const { ForumPost, Comment } = require('../../../backend/src/models');
const forumService = require('../../../backend/src/forums/forum.service');

describe('ForumService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPost', () => {
    it('should create post and re-fetch with author include', async () => {
      const mockCreated = { id: 1 };
      const mockFull = {
        id: 1,
        title: 'Best AI contracts?',
        body: 'Looking for recommendations.',
        category: 'gov_contracts',
        userId: 5,
        author: { id: 5, email: 'user@test.com', name: 'Test User' },
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          title: 'Best AI contracts?',
          body: 'Looking for recommendations.',
          category: 'gov_contracts',
          userId: 5,
          author: { id: 5, email: 'user@test.com', name: 'Test User' },
        }),
      };
      ForumPost.create.mockResolvedValue(mockCreated);
      ForumPost.findByPk.mockResolvedValue(mockFull);

      const result = await forumService.createPost(5, {
        title: 'Best AI contracts?',
        body: 'Looking for recommendations.',
        category: 'gov_contracts',
      });

      expect(result).toHaveProperty('title', 'Best AI contracts?');
      expect(result).toHaveProperty('author');
      expect(ForumPost.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 5, title: 'Best AI contracts?' })
      );
      expect(ForumPost.findByPk).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ as: 'author' }),
          ]),
        })
      );
    });
  });

  describe('listPosts', () => {
    it('should return paginated post list with comment count', async () => {
      const mockRows = [
        { id: 1, title: 'Post 1' },
        { id: 2, title: 'Post 2' },
      ];
      ForumPost.findAndCountAll.mockResolvedValue({ rows: mockRows, count: 50 });

      const result = await forumService.listPosts({ page: 1, limit: 20 });

      expect(result.posts).toEqual(mockRows);
      expect(result.pagination).toEqual({
        total: 50,
        page: 1,
        limit: 20,
        pages: 3,
      });
      expect(ForumPost.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            include: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ literal: true }),
              ]),
            ]),
          }),
        })
      );
    });

    it('should filter by category when provided', async () => {
      ForumPost.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await forumService.listPosts({ page: 1, limit: 20, category: 'gov_contracts' });

      expect(ForumPost.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'gov_contracts' }),
        })
      );
    });

    it('should filter by status when provided', async () => {
      ForumPost.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await forumService.listPosts({ page: 1, limit: 20, status: 'open' });

      expect(ForumPost.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'open' }),
        })
      );
    });
  });

  describe('getPostById', () => {
    it('should return post with author and comments, and increment viewCount', async () => {
      const mockPost = {
        id: 1,
        title: 'Test Post',
        userId: 5,
        viewCount: 10,
        comments: [],
        author: { id: 5, email: 'user@test.com', name: 'Test User' },
        increment: jest.fn(),
      };
      ForumPost.findByPk.mockResolvedValue(mockPost);

      const result = await forumService.getPostById(1);

      expect(result).toEqual(mockPost);
      expect(mockPost.increment).toHaveBeenCalledWith('viewCount');
      expect(ForumPost.findByPk).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ as: 'author' }),
            expect.objectContaining({ as: 'comments' }),
          ]),
        })
      );
    });

    it('should throw 404 when post not found', async () => {
      ForumPost.findByPk.mockResolvedValue(null);

      await expect(forumService.getPostById(999))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updatePost', () => {
    it('should allow owner to update title, body, and category', async () => {
      const mockPost = {
        id: 1,
        title: 'Old Title',
        body: 'Old Body',
        category: 'general',
        userId: 5,
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          title: 'New Title',
          body: 'New Body',
          category: 'gov_contracts',
          userId: 5,
        }),
      };
      ForumPost.findByPk.mockResolvedValue(mockPost);

      const result = await forumService.updatePost(1, 5, 'consultant', {
        title: 'New Title',
        body: 'New Body',
        category: 'gov_contracts',
      });

      expect(mockPost.title).toBe('New Title');
      expect(mockPost.body).toBe('New Body');
      expect(mockPost.category).toBe('gov_contracts');
      expect(mockPost.save).toHaveBeenCalled();
    });

    it('should allow admin to change status', async () => {
      const mockPost = {
        id: 1,
        title: 'Some Post',
        userId: 10,
        status: 'open',
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({ id: 1, status: 'closed' }),
      };
      ForumPost.findByPk.mockResolvedValue(mockPost);

      const result = await forumService.updatePost(1, 99, 'admin', {
        status: 'closed',
      });

      expect(mockPost.status).toBe('closed');
      expect(mockPost.save).toHaveBeenCalled();
    });

    it('should throw 403 for non-owner non-admin', async () => {
      const mockPost = { id: 1, userId: 10 };
      ForumPost.findByPk.mockResolvedValue(mockPost);

      await expect(forumService.updatePost(1, 5, 'consultant', { title: 'Hacked' }))
        .rejects.toMatchObject({ statusCode: 403 });
    });

    it('should throw 404 when post not found', async () => {
      ForumPost.findByPk.mockResolvedValue(null);

      await expect(forumService.updatePost(999, 1, 'admin', { title: 'X' }))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deletePost', () => {
    it('should allow owner to delete post', async () => {
      const mockPost = {
        id: 1,
        userId: 5,
        destroy: jest.fn(),
      };
      ForumPost.findByPk.mockResolvedValue(mockPost);

      await forumService.deletePost(1, 5, 'consultant');

      expect(mockPost.destroy).toHaveBeenCalled();
    });
  });

  describe('addComment', () => {
    it('should create comment on an open post', async () => {
      const mockPost = { id: 1, status: 'open' };
      const mockCreated = { id: 1 };
      const mockFullComment = {
        id: 1,
        body: 'Great post!',
        userId: 5,
        forumPostId: 1,
        author: { id: 5, email: 'user@test.com', name: 'Test User' },
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          body: 'Great post!',
          userId: 5,
          forumPostId: 1,
          author: { id: 5, email: 'user@test.com', name: 'Test User' },
        }),
      };
      ForumPost.findByPk.mockResolvedValue(mockPost);
      Comment.create.mockResolvedValue(mockCreated);
      Comment.findByPk.mockResolvedValue(mockFullComment);

      const result = await forumService.addComment(1, 5, { body: 'Great post!' });

      expect(result).toHaveProperty('body', 'Great post!');
      expect(result).toHaveProperty('author');
      expect(Comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 5,
          forumPostId: 1,
          body: 'Great post!',
        })
      );
      expect(Comment.findByPk).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          include: expect.arrayContaining([
            expect.objectContaining({ as: 'author' }),
          ]),
        })
      );
    });

    it('should throw 403 when post is closed', async () => {
      const mockPost = { id: 1, status: 'closed' };
      ForumPost.findByPk.mockResolvedValue(mockPost);

      await expect(forumService.addComment(1, 5, { body: 'Nope' }))
        .rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('deleteComment', () => {
    it('should allow owner to delete comment', async () => {
      const mockComment = {
        id: 1,
        userId: 5,
        destroy: jest.fn(),
      };
      Comment.findByPk.mockResolvedValue(mockComment);

      await forumService.deleteComment(1, 5, 'consultant');

      expect(mockComment.destroy).toHaveBeenCalled();
    });

    it('should throw 403 for non-owner non-admin', async () => {
      const mockComment = { id: 1, userId: 10 };
      Comment.findByPk.mockResolvedValue(mockComment);

      await expect(forumService.deleteComment(1, 5, 'consultant'))
        .rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
