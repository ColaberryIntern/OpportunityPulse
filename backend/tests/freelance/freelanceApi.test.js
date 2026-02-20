/**
 * Tests for freelance API endpoints (controller logic).
 * Tests controller functions with mocked models and services.
 */

const {
  listOpportunities,
  getOpportunity,
  getTrends,
  getSkillTrendData,
  generateAction,
  importProjects,
} = require('../../src/freelance/freelance.controller');

// Mock models
jest.mock('../../src/models', () => ({
  Opportunity: {
    findAndCountAll: jest.fn(),
    findOne: jest.fn(),
  },
  DataSource: {
    findOne: jest.fn(),
  },
}));

// Mock services
jest.mock('../../src/freelance/freelanceTrend.service', () => ({
  getTrendingSkills: jest.fn(),
  getSkillTrend: jest.fn(),
  getDemandHeatmap: jest.fn(),
}));

jest.mock('../../src/freelance/freelanceAction.service', () => ({
  generateFreelanceAction: jest.fn(),
}));

jest.mock('../../src/ingestion/ingestion.service', () => ({
  runIngestion: jest.fn(),
}));

jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const { Opportunity, DataSource } = require('../../src/models');
const { getTrendingSkills, getSkillTrend: getSkillTrendService, getDemandHeatmap } = require('../../src/freelance/freelanceTrend.service');
const { generateFreelanceAction } = require('../../src/freelance/freelanceAction.service');
const { runIngestion } = require('../../src/ingestion/ingestion.service');

describe('Freelance API Controller', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      query: {},
      params: {},
      body: {},
      user: { id: 1, profileData: {} },
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('GET /opportunities (listOpportunities)', () => {
    it('should return paginated freelance opportunities', async () => {
      const mockRows = [
        { id: 1, title: 'AI Project', type: 'freelance' },
        { id: 2, title: 'ML Project', type: 'freelance' },
      ];
      Opportunity.findAndCountAll.mockResolvedValue({ rows: mockRows, count: 2 });

      await listOpportunities(req, res, next);

      expect(Opportunity.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'freelance' }),
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunities: mockRows,
          pagination: expect.objectContaining({
            total: 2,
            page: 1,
          }),
        })
      );
    });

    it('should apply skill filter using overlap', async () => {
      req.query.skills = 'python,react';
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.tags).toBeDefined();
    });

    it('should apply budget range filters', async () => {
      req.query.minBudget = '1000';
      req.query.maxBudget = '10000';
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.value).toBeDefined();
    });

    it('should apply platform filter', async () => {
      req.query.platform = 'upwork';
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.source).toBe('upwork');
    });

    it('should apply minimum score filter', async () => {
      req.query.minScore = '60';
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.aiScore).toBeDefined();
    });

    it('should sort by score by default', async () => {
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order[0][0]).toBe('ai_score');
    });

    it('should sort by budget when requested', async () => {
      req.query.sort = 'budget';
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order[0][0]).toBe('value');
    });

    it('should sort by newest when requested', async () => {
      req.query.sort = 'newest';
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.order[0][0]).toBe('created_at');
    });

    it('should handle pagination parameters', async () => {
      req.query.page = '2';
      req.query.limit = '5';
      Opportunity.findAndCountAll.mockResolvedValue({ rows: [], count: 20 });

      await listOpportunities(req, res, next);

      const callArgs = Opportunity.findAndCountAll.mock.calls[0][0];
      expect(callArgs.limit).toBe(5);
      expect(callArgs.offset).toBe(5); // (2-1) * 5
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            page: 2,
            limit: 5,
            pages: 4,
          }),
        })
      );
    });

    it('should call next on error', async () => {
      Opportunity.findAndCountAll.mockRejectedValue(new Error('DB error'));

      await listOpportunities(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('GET /opportunities/:id (getOpportunity)', () => {
    it('should return a single freelance opportunity', async () => {
      const mockOpp = { id: 1, title: 'AI Project', type: 'freelance' };
      Opportunity.findOne.mockResolvedValue(mockOpp);
      req.params.id = '1';

      await getOpportunity(req, res, next);

      expect(Opportunity.findOne).toHaveBeenCalledWith({
        where: { id: '1', type: 'freelance' },
      });
      expect(res.json).toHaveBeenCalledWith(mockOpp);
    });

    it('should return 404 when opportunity not found', async () => {
      Opportunity.findOne.mockResolvedValue(null);
      req.params.id = '999';

      await getOpportunity(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('not found') })
      );
    });

    it('should call next on error', async () => {
      Opportunity.findOne.mockRejectedValue(new Error('DB error'));
      req.params.id = '1';

      await getOpportunity(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('GET /trends (getTrends)', () => {
    it('should return trending skills and heatmap', async () => {
      const mockTrending = [{ skill: 'llm', growthRate: 50 }];
      const mockHeatmap = { skills: ['llm'], platforms: ['upwork'], data: [] };
      getTrendingSkills.mockResolvedValue(mockTrending);
      getDemandHeatmap.mockResolvedValue(mockHeatmap);

      await getTrends(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        trending: mockTrending,
        heatmap: mockHeatmap,
      });
    });

    it('should pass days parameter to services', async () => {
      req.query.days = '7';
      getTrendingSkills.mockResolvedValue([]);
      getDemandHeatmap.mockResolvedValue({ skills: [], platforms: [], data: [] });

      await getTrends(req, res, next);

      expect(getTrendingSkills).toHaveBeenCalledWith(7);
      expect(getDemandHeatmap).toHaveBeenCalledWith(7);
    });

    it('should default to 30 days', async () => {
      getTrendingSkills.mockResolvedValue([]);
      getDemandHeatmap.mockResolvedValue({ skills: [], platforms: [], data: [] });

      await getTrends(req, res, next);

      expect(getTrendingSkills).toHaveBeenCalledWith(30);
      expect(getDemandHeatmap).toHaveBeenCalledWith(30);
    });
  });

  describe('GET /trends/:skill (getSkillTrendData)', () => {
    it('should return trend data for a specific skill', async () => {
      const mockTrend = [
        { date: '2026-02-18', demandCount: 10, avgBudget: 3000 },
        { date: '2026-02-19', demandCount: 12, avgBudget: 3200 },
      ];
      getSkillTrendService.mockResolvedValue(mockTrend);
      req.params.skill = 'python';

      await getSkillTrendData(req, res, next);

      expect(getSkillTrendService).toHaveBeenCalledWith('python', 30);
      expect(res.json).toHaveBeenCalledWith({
        skill: 'python',
        trend: mockTrend,
      });
    });
  });

  describe('POST /actions/:id/generate (generateAction)', () => {
    it('should generate action for a valid freelance opportunity', async () => {
      const mockOpp = { id: 1, title: 'AI Project', type: 'freelance' };
      Opportunity.findOne.mockResolvedValue(mockOpp);
      generateFreelanceAction.mockResolvedValue({
        content: '# Proposal\n...',
        format: 'markdown',
      });
      req.params.id = '1';
      req.body.actionType = 'PROPOSAL';

      await generateAction(req, res, next);

      expect(generateFreelanceAction).toHaveBeenCalledWith('PROPOSAL', mockOpp, {});
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.any(String), format: 'markdown' })
      );
    });

    it('should return 400 when actionType is missing', async () => {
      req.params.id = '1';
      req.body = {};

      await generateAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when opportunity not found', async () => {
      Opportunity.findOne.mockResolvedValue(null);
      req.params.id = '999';
      req.body.actionType = 'PROPOSAL';

      await generateAction(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('POST /import (importProjects)', () => {
    it('should import LinkedIn projects', async () => {
      const mockDs = {
        config: {},
        update: jest.fn().mockResolvedValue({}),
      };
      DataSource.findOne.mockResolvedValue(mockDs);
      runIngestion.mockResolvedValue({ created: 2, updated: 0 });
      req.body.projects = [
        { id: 'li-1', title: 'Project 1' },
        { id: 'li-2', title: 'Project 2' },
      ];

      await importProjects(req, res, next);

      expect(DataSource.findOne).toHaveBeenCalledWith({
        where: { name: 'linkedin_manual' },
      });
      expect(mockDs.update).toHaveBeenCalledTimes(2); // Set config, then clear
      expect(runIngestion).toHaveBeenCalledWith('linkedin_manual');
      expect(res.json).toHaveBeenCalled();
    });

    it('should return 400 when projects array is missing', async () => {
      req.body = {};

      await importProjects(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when projects is empty array', async () => {
      req.body.projects = [];

      await importProjects(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when linkedin_manual data source not found', async () => {
      DataSource.findOne.mockResolvedValue(null);
      req.body.projects = [{ id: 'li-1', title: 'Test' }];

      await importProjects(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should clear importData after ingestion', async () => {
      const mockDs = {
        config: { existingKey: true },
        update: jest.fn().mockResolvedValue({}),
      };
      DataSource.findOne.mockResolvedValue(mockDs);
      runIngestion.mockResolvedValue({ created: 1 });
      req.body.projects = [{ id: 'li-1', title: 'Test' }];

      await importProjects(req, res, next);

      // Second update call should clear importData
      const secondUpdateCall = mockDs.update.mock.calls[1][0];
      expect(secondUpdateCall.config.importData).toEqual([]);
    });
  });
});
