/**
 * Tests for freelanceTrend.service.js
 * Covers daily snapshot generation, trending skills aggregation,
 * skill time series, and demand heatmap.
 */

const { generateDailySnapshot, getTrendingSkills, getSkillTrend, getDemandHeatmap } = require('../../src/freelance/freelanceTrend.service');

// Mock all models used by the service
jest.mock('../../src/models', () => {
  const mockUpsert = jest.fn().mockResolvedValue([{}, true]);
  const mockFindAll = jest.fn().mockResolvedValue([]);
  const mockMax = jest.fn().mockResolvedValue(null);

  return {
    Opportunity: {
      findAll: jest.fn().mockResolvedValue([]),
    },
    FreelanceTrendSnapshot: {
      upsert: mockUpsert,
      findAll: mockFindAll,
      max: mockMax,
    },
    AnalysisRun: {
      create: jest.fn().mockResolvedValue({
        id: 1,
        update: jest.fn().mockResolvedValue({}),
      }),
    },
    sequelize: {},
  };
});

jest.mock('../../src/logging/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const { Opportunity, FreelanceTrendSnapshot, AnalysisRun } = require('../../src/models');

describe('Freelance Trend Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AnalysisRun.create.mockResolvedValue({
      id: 1,
      update: jest.fn().mockResolvedValue({}),
    });
  });

  describe('generateDailySnapshot', () => {
    it('should return early when no freelance opportunities exist', async () => {
      Opportunity.findAll.mockResolvedValue([]);

      const run = await generateDailySnapshot();

      expect(Opportunity.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'freelance' }),
        })
      );
      expect(FreelanceTrendSnapshot.upsert).not.toHaveBeenCalled();
      expect(run.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          inputCount: 0,
          outputCount: 0,
        })
      );
    });

    it('should group opportunities by skill and upsert snapshots', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1,
          value: 5000,
          sourceData: { platform: 'upwork', proposals: 10 },
          aiAnalysis: { skills: ['python', 'llm'] },
          source: 'upwork',
        },
        {
          id: 2,
          value: 8000,
          sourceData: { platform: 'freelancer', bid_count: 5 },
          aiAnalysis: { skills: ['python', 'react'] },
          source: 'freelancer',
        },
        {
          id: 3,
          value: 3000,
          sourceData: { platform: 'upwork', proposals: 20 },
          aiAnalysis: { skills: ['llm', 'nlp'] },
          source: 'upwork',
        },
      ]);

      const run = await generateDailySnapshot();

      // python appears in 2 opps, llm in 2, react in 1, nlp in 1
      expect(FreelanceTrendSnapshot.upsert).toHaveBeenCalledTimes(4);

      // Check python upsert
      const pythonCall = FreelanceTrendSnapshot.upsert.mock.calls.find(
        (call) => call[0].skill === 'python'
      );
      expect(pythonCall).toBeDefined();
      expect(pythonCall[0].demandCount).toBe(2);
      expect(pythonCall[0].avgBudget).toBe(6500); // (5000+8000)/2

      expect(run.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          inputCount: 3,
          outputCount: 4,
        })
      );
    });

    it('should normalize skill names to lowercase', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1,
          value: 1000,
          sourceData: {},
          aiAnalysis: { skills: ['Python', 'REACT', 'llm'] },
          source: 'upwork',
        },
      ]);

      await generateDailySnapshot();

      const skills = FreelanceTrendSnapshot.upsert.mock.calls.map(
        (call) => call[0].skill
      );
      expect(skills).toContain('python');
      expect(skills).toContain('react');
      expect(skills).toContain('llm');
      expect(skills).not.toContain('Python');
    });

    it('should handle opportunities with no skills and no tags', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1,
          value: 2000,
          sourceData: {},
          aiAnalysis: {},
          tags: [],
          source: 'upwork',
        },
      ]);

      const run = await generateDailySnapshot();

      expect(FreelanceTrendSnapshot.upsert).not.toHaveBeenCalled();
      expect(run.update).toHaveBeenCalledWith(
        expect.objectContaining({ outputCount: 0 })
      );
    });

    it('should use tags as fallback when aiAnalysis.skills is empty', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1,
          value: 5000,
          sourceData: { platform: 'freelancer' },
          aiAnalysis: {},
          tags: ['python', 'react'],
          source: 'freelancer',
        },
      ]);

      await generateDailySnapshot();

      expect(FreelanceTrendSnapshot.upsert).toHaveBeenCalledTimes(2);
      const skills = FreelanceTrendSnapshot.upsert.mock.calls.map((c) => c[0].skill);
      expect(skills).toContain('python');
      expect(skills).toContain('react');
    });

    it('should use sourceData.skills as fallback when both aiAnalysis.skills and tags are empty', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1,
          value: 3000,
          sourceData: { platform: 'freelancer', skills: ['node.js', 'mongodb'] },
          aiAnalysis: {},
          tags: [],
          source: 'freelancer',
        },
      ]);

      await generateDailySnapshot();

      expect(FreelanceTrendSnapshot.upsert).toHaveBeenCalledTimes(2);
      const skills = FreelanceTrendSnapshot.upsert.mock.calls.map((c) => c[0].skill);
      expect(skills).toContain('node.js');
      expect(skills).toContain('mongodb');
    });

    it('should prefer aiAnalysis.skills over tags when both exist', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1,
          value: 5000,
          sourceData: { platform: 'freelancer' },
          aiAnalysis: { skills: ['tensorflow', 'pytorch'] },
          tags: ['python', 'react'],
          source: 'freelancer',
        },
      ]);

      await generateDailySnapshot();

      expect(FreelanceTrendSnapshot.upsert).toHaveBeenCalledTimes(2);
      const skills = FreelanceTrendSnapshot.upsert.mock.calls.map((c) => c[0].skill);
      expect(skills).toContain('tensorflow');
      expect(skills).toContain('pytorch');
      expect(skills).not.toContain('python');
    });

    it('should handle stringified JSON in sourceData and aiAnalysis', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1,
          value: 5000,
          sourceData: JSON.stringify({ platform: 'upwork', proposals: 10 }),
          aiAnalysis: JSON.stringify({ skills: ['python'] }),
          source: 'upwork',
        },
      ]);

      await generateDailySnapshot();

      expect(FreelanceTrendSnapshot.upsert).toHaveBeenCalledTimes(1);
      const call = FreelanceTrendSnapshot.upsert.mock.calls[0][0];
      expect(call.skill).toBe('python');
      expect(call.demandCount).toBe(1);
    });

    it('should compute avg_proposals correctly', async () => {
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1, value: 0,
          sourceData: { proposals: 10 },
          aiAnalysis: { skills: ['llm'] },
          source: 'upwork',
        },
        {
          id: 2, value: 0,
          sourceData: { proposals: 30 },
          aiAnalysis: { skills: ['llm'] },
          source: 'upwork',
        },
      ]);

      await generateDailySnapshot();

      const llmCall = FreelanceTrendSnapshot.upsert.mock.calls[0][0];
      expect(llmCall.avgProposals).toBe(20); // (10+30)/2
    });

    it('should track top platforms by count', async () => {
      Opportunity.findAll.mockResolvedValue([
        { id: 1, value: 0, sourceData: { platform: 'upwork' }, aiAnalysis: { skills: ['python'] }, source: 'upwork' },
        { id: 2, value: 0, sourceData: { platform: 'upwork' }, aiAnalysis: { skills: ['python'] }, source: 'upwork' },
        { id: 3, value: 0, sourceData: { platform: 'freelancer' }, aiAnalysis: { skills: ['python'] }, source: 'freelancer' },
      ]);

      await generateDailySnapshot();

      const call = FreelanceTrendSnapshot.upsert.mock.calls[0][0];
      expect(call.topPlatforms).toEqual([
        { platform: 'upwork', count: 2 },
        { platform: 'freelancer', count: 1 },
      ]);
    });

    it('should mark run as failed on error', async () => {
      const mockRun = { id: 1, update: jest.fn().mockResolvedValue({}) };
      AnalysisRun.create.mockResolvedValue(mockRun);
      Opportunity.findAll.mockRejectedValue(new Error('DB down'));

      await expect(generateDailySnapshot()).rejects.toThrow('DB down');
      expect(mockRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errors: [{ error: 'DB down' }],
        })
      );
    });
  });

  describe('getTrendingSkills', () => {
    it('should return trending skills sorted by growth rate', async () => {
      FreelanceTrendSnapshot.findAll
        // Latest snapshots
        .mockResolvedValueOnce([
          { skill: 'llm', demand_count: 50, avg_budget: 5000, avg_proposals: 10, top_platforms: [] },
          { skill: 'nlp', demand_count: 30, avg_budget: 4000, avg_proposals: 15, top_platforms: [] },
        ])
        // Prior snapshots
        .mockResolvedValueOnce([
          { skill: 'llm', demand_count: 25 },
          { skill: 'nlp', demand_count: 28 },
        ]);

      const result = await getTrendingSkills(30);

      expect(result.length).toBe(2);
      // llm grew 100% (25→50), nlp grew ~7.1% (28→30)
      expect(result[0].skill).toBe('llm');
      expect(result[0].growthRate).toBe(100);
      expect(result[1].skill).toBe('nlp');
    });

    it('should give 100% growth for new skills with no prior data', async () => {
      FreelanceTrendSnapshot.findAll
        .mockResolvedValueOnce([
          { skill: 'new-skill', demand_count: 10, avg_budget: 3000, avg_proposals: 5, top_platforms: [] },
        ])
        .mockResolvedValueOnce([]);

      const result = await getTrendingSkills(30);

      expect(result[0].growthRate).toBe(100);
    });

    it('should limit results to top 20', async () => {
      const manySkills = Array.from({ length: 30 }, (_, i) => ({
        skill: `skill-${i}`,
        demand_count: 30 - i,
        avg_budget: 1000,
        avg_proposals: 5,
        top_platforms: [],
      }));

      FreelanceTrendSnapshot.findAll
        .mockResolvedValueOnce(manySkills)
        .mockResolvedValueOnce([]);

      const result = await getTrendingSkills(30);

      expect(result.length).toBe(20);
    });

    it('should fall back to real-time aggregation when snapshots have all zero demands', async () => {
      // Snapshot returns skills with 0 demand
      FreelanceTrendSnapshot.max.mockResolvedValue('2026-02-21');
      FreelanceTrendSnapshot.findAll.mockResolvedValueOnce([
        { skill: 'php', demand_count: 0, avg_budget: null, avg_proposals: null, top_platforms: [] },
      ]);

      // Real-time query returns opportunities with tags
      Opportunity.findAll.mockResolvedValue([
        {
          id: 1, value: 5000,
          sourceData: { platform: 'freelancer', bid_count: 10 },
          aiAnalysis: {},
          tags: ['python', 'react'],
          source: 'freelancer',
        },
        {
          id: 2, value: 3000,
          sourceData: { platform: 'freelancer', bid_count: 5 },
          aiAnalysis: {},
          tags: ['python', 'node.js'],
          source: 'freelancer',
        },
      ]);

      const result = await getTrendingSkills(30);

      expect(result.length).toBe(3);
      expect(result[0].skill).toBe('python');
      expect(result[0].demandCount).toBe(2);
      expect(result[0].isRealTime).toBe(true);
      // python appears in 2 of 2 opps → 100% demand share
      expect(result[0].growthRate).toBe(100);
      // react appears in 1 of 2 opps → 50% demand share
      expect(result[1].growthRate).toBe(50);
      expect(result[1].demandCount).toBe(1);
    });

    it('should fall back to real-time aggregation when no snapshots exist', async () => {
      FreelanceTrendSnapshot.max.mockResolvedValue(null);
      FreelanceTrendSnapshot.findAll.mockResolvedValue([]);

      Opportunity.findAll.mockResolvedValue([
        {
          id: 1, value: 2000,
          sourceData: { platform: 'freelancer' },
          aiAnalysis: {},
          tags: ['javascript', 'react'],
          source: 'freelancer',
        },
      ]);

      const result = await getTrendingSkills(30);

      expect(result.length).toBe(2);
      const skills = result.map((r) => r.skill);
      expect(skills).toContain('javascript');
      expect(skills).toContain('react');
      // Both skills appear in 1 of 1 opps → 100% demand share
      expect(result[0].growthRate).toBe(100);
      expect(result[0].isRealTime).toBe(true);
    });
  });

  describe('getSkillTrend', () => {
    it('should return daily time series for a skill', async () => {
      FreelanceTrendSnapshot.findAll.mockResolvedValue([
        { snapshot_date: '2026-02-18', demand_count: 10, avg_budget: 3000, avg_proposals: 5 },
        { snapshot_date: '2026-02-19', demand_count: 12, avg_budget: 3200, avg_proposals: 6 },
        { snapshot_date: '2026-02-20', demand_count: 15, avg_budget: 3500, avg_proposals: 4 },
      ]);

      const result = await getSkillTrend('python', 30);

      expect(result.length).toBe(3);
      expect(result[0]).toEqual({
        date: '2026-02-18',
        demandCount: 10,
        avgBudget: 3000,
        avgProposals: 5,
      });
      expect(result[2].demandCount).toBe(15);
    });

    it('should normalize skill to lowercase in the query', async () => {
      FreelanceTrendSnapshot.findAll.mockResolvedValue([]);

      await getSkillTrend('Python', 30);

      expect(FreelanceTrendSnapshot.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ skill: 'python' }),
        })
      );
    });

    it('should return empty array when no data exists', async () => {
      FreelanceTrendSnapshot.findAll.mockResolvedValue([]);

      const result = await getSkillTrend('nonexistent', 30);

      expect(result).toEqual([]);
    });
  });

  describe('getDemandHeatmap', () => {
    it('should return skill × platform matrix', async () => {
      FreelanceTrendSnapshot.max.mockResolvedValue('2026-02-20');
      FreelanceTrendSnapshot.findAll.mockResolvedValue([
        {
          skill: 'llm',
          demand_count: 50,
          avg_budget: 5000,
          top_platforms: [
            { platform: 'upwork', count: 30 },
            { platform: 'freelancer', count: 20 },
          ],
        },
        {
          skill: 'nlp',
          demand_count: 30,
          avg_budget: 4000,
          top_platforms: [
            { platform: 'upwork', count: 25 },
            { platform: 'toptal', count: 5 },
          ],
        },
      ]);

      const result = await getDemandHeatmap(30);

      expect(result.skills).toEqual(['llm', 'nlp']);
      expect(result.platforms).toContain('upwork');
      expect(result.platforms).toContain('freelancer');
      expect(result.platforms).toContain('toptal');
      expect(result.data.length).toBe(2);
    });

    it('should return empty result when no snapshots exist', async () => {
      FreelanceTrendSnapshot.max.mockResolvedValue(null);

      const result = await getDemandHeatmap(30);

      expect(result).toEqual({ skills: [], platforms: [], matrix: [] });
    });
  });
});
