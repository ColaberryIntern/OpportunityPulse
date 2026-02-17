// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockContent = {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
  };
  const mockUser = {};
  return { Content: mockContent, User: mockUser };
});

const { Content } = require('../../../backend/src/models');
const contentService = require('../../../backend/src/contentManager/content.service');

describe('ContentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createContent', () => {
    it('should create content and return it', async () => {
      const mockCreated = {
        id: 1,
        title: 'AI Contract Insights',
        body: 'Analysis of recent government AI contracts.',
        category: 'contracts',
        tags: ['AI', 'government'],
        status: 'draft',
        userId: 5,
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          title: 'AI Contract Insights',
          body: 'Analysis of recent government AI contracts.',
          category: 'contracts',
          tags: ['AI', 'government'],
          status: 'draft',
          userId: 5,
        }),
      };
      Content.create.mockResolvedValue(mockCreated);

      const result = await contentService.createContent(5, {
        title: 'AI Contract Insights',
        body: 'Analysis of recent government AI contracts.',
        category: 'contracts',
        tags: ['AI', 'government'],
      });

      expect(result).toHaveProperty('title', 'AI Contract Insights');
      expect(Content.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 5, title: 'AI Contract Insights' })
      );
    });

    it('should default status to draft', async () => {
      const mockCreated = {
        toJSON: jest.fn().mockReturnValue({ id: 1, status: 'draft' }),
      };
      Content.create.mockResolvedValue(mockCreated);

      await contentService.createContent(1, {
        title: 'Test',
        body: 'Body',
      });

      expect(Content.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft' })
      );
    });
  });

  describe('listContent', () => {
    it('should return paginated content list', async () => {
      const mockRows = [
        { id: 1, title: 'Article 1' },
        { id: 2, title: 'Article 2' },
      ];
      Content.findAndCountAll.mockResolvedValue({ rows: mockRows, count: 50 });

      const result = await contentService.listContent({ page: 1, limit: 20 });

      expect(result.content).toEqual(mockRows);
      expect(result.pagination).toEqual({
        total: 50,
        page: 1,
        limit: 20,
        pages: 3,
      });
    });

    it('should filter by status when provided', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await contentService.listContent({ page: 1, limit: 20, status: 'published' });

      expect(Content.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'published' }),
        })
      );
    });

    it('should filter by category when provided', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await contentService.listContent({ page: 1, limit: 20, category: 'contracts' });

      expect(Content.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'contracts' }),
        })
      );
    });

    it('should return empty array when no content exists', async () => {
      Content.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      const result = await contentService.listContent({ page: 1, limit: 20 });

      expect(result.content).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getContentById', () => {
    it('should return content by id', async () => {
      const mockContent = { id: 1, title: 'Article', userId: 5 };
      Content.findByPk.mockResolvedValue(mockContent);

      const result = await contentService.getContentById(1);

      expect(result).toEqual(mockContent);
    });

    it('should throw 404 when content not found', async () => {
      Content.findByPk.mockResolvedValue(null);

      await expect(contentService.getContentById(999))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateContent', () => {
    it('should update content when user is owner', async () => {
      const mockContent = {
        id: 1,
        title: 'Old Title',
        userId: 5,
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({
          id: 1,
          title: 'New Title',
          userId: 5,
        }),
      };
      Content.findByPk.mockResolvedValue(mockContent);

      const result = await contentService.updateContent(1, 5, 'consultant', {
        title: 'New Title',
      });

      expect(mockContent.title).toBe('New Title');
      expect(mockContent.save).toHaveBeenCalled();
    });

    it('should allow admin to update any content', async () => {
      const mockContent = {
        id: 1,
        title: 'Title',
        userId: 10, // different user
        save: jest.fn(),
        toJSON: jest.fn().mockReturnValue({ id: 1, title: 'Updated' }),
      };
      Content.findByPk.mockResolvedValue(mockContent);

      const result = await contentService.updateContent(1, 99, 'admin', {
        title: 'Updated',
      });

      expect(mockContent.save).toHaveBeenCalled();
    });

    it('should throw 403 when non-owner non-admin tries to update', async () => {
      const mockContent = { id: 1, userId: 10 };
      Content.findByPk.mockResolvedValue(mockContent);

      await expect(contentService.updateContent(1, 5, 'consultant', { title: 'Hacked' }))
        .rejects.toMatchObject({ statusCode: 403 });
    });

    it('should throw 404 when content not found', async () => {
      Content.findByPk.mockResolvedValue(null);

      await expect(contentService.updateContent(999, 1, 'admin', { title: 'X' }))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteContent', () => {
    it('should soft delete content when user is owner', async () => {
      const mockContent = {
        id: 1,
        userId: 5,
        destroy: jest.fn(),
      };
      Content.findByPk.mockResolvedValue(mockContent);

      await contentService.deleteContent(1, 5, 'consultant');

      expect(mockContent.destroy).toHaveBeenCalled();
    });

    it('should allow admin to delete any content', async () => {
      const mockContent = {
        id: 1,
        userId: 10,
        destroy: jest.fn(),
      };
      Content.findByPk.mockResolvedValue(mockContent);

      await contentService.deleteContent(1, 99, 'admin');

      expect(mockContent.destroy).toHaveBeenCalled();
    });

    it('should throw 403 when non-owner non-admin tries to delete', async () => {
      const mockContent = { id: 1, userId: 10 };
      Content.findByPk.mockResolvedValue(mockContent);

      await expect(contentService.deleteContent(1, 5, 'consultant'))
        .rejects.toMatchObject({ statusCode: 403 });
    });

    it('should throw 404 when content not found', async () => {
      Content.findByPk.mockResolvedValue(null);

      await expect(contentService.deleteContent(999, 1, 'admin'))
        .rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
