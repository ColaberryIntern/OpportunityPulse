// Mock logger to suppress output
jest.mock('../../../backend/src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock models before importing service
jest.mock('../../../backend/src/models', () => {
  const mockDataSource = {
    findOne: jest.fn(),
    findAll: jest.fn(),
  };
  const mockOpportunity = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const mockIngestionLog = {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
  };
  return {
    DataSource: mockDataSource,
    Opportunity: mockOpportunity,
    IngestionLog: mockIngestionLog,
    sequelize: {},
  };
});

// Mock adapters
jest.mock('../../../backend/src/ingestion/adapters/mockJobs.adapter', () => {
  return jest.fn().mockImplementation(() => ({
    fetch: jest.fn().mockResolvedValue([
      { id: 'job-1', title: 'ML Engineer' },
      { id: 'job-2', title: 'AI Researcher' },
    ]),
    transform: jest.fn().mockReturnValue([
      {
        type: 'ai_job',
        title: 'ML Engineer',
        source: 'mock_jobs',
        sourceId: 'job-1',
        status: 'active',
        description: 'ML Engineer role',
        sourceData: { skills: ['Python', 'TensorFlow'] },
      },
      {
        type: 'ai_job',
        title: 'AI Researcher',
        source: 'mock_jobs',
        sourceId: 'job-2',
        status: 'active',
        description: 'AI Researcher role',
        sourceData: { skills: ['PyTorch', 'NLP'] },
      },
    ]),
  }));
});

jest.mock('../../../backend/src/ingestion/adapters/mockInvestments.adapter', () => {
  return jest.fn().mockImplementation(() => ({
    fetch: jest.fn().mockResolvedValue([
      { id: 'inv-1', title: 'AI Startup A' },
    ]),
    transform: jest.fn().mockReturnValue([
      {
        type: 'investment',
        title: 'AI Startup A',
        source: 'mock_investments',
        sourceId: 'inv-1',
        status: 'active',
        description: 'Series A funding',
        sourceData: { round: 'Series A', investors: ['VC Fund'] },
      },
    ]),
  }));
});

jest.mock('../../../backend/src/ingestion/adapters/samGov.adapter', () => {
  return jest.fn().mockImplementation(() => ({
    fetch: jest.fn().mockResolvedValue([
      { id: 'sam-1', title: 'Federal IT Contract' },
    ]),
    transform: jest.fn().mockReturnValue([
      {
        type: 'gov_contract',
        title: 'Federal IT Contract',
        source: 'sam_gov',
        sourceId: 'sam-1',
        status: 'active',
        description: 'IT services contract',
        sourceData: {},
      },
    ]),
  }));
});

const { DataSource, Opportunity, IngestionLog } = require('../../../backend/src/models');
const ingestionService = require('../../../backend/src/ingestion/ingestion.service');

describe('IngestionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeMockDataSource(overrides = {}) {
    return {
      id: 1,
      name: 'mock_jobs',
      type: 'mock',
      config: {},
      enabled: true,
      lastRunAt: null,
      lastRunStatus: null,
      update: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  function makeMockLog() {
    return {
      id: 1,
      status: 'running',
      recordsFetched: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: [],
      update: jest.fn().mockResolvedValue(true),
    };
  }

  describe('runIngestion', () => {
    it('should create an IngestionLog with status running', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      await ingestionService.runIngestion('mock_jobs');

      expect(IngestionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          dataSourceId: 1,
        })
      );
    });

    it('should call adapter fetch() and transform()', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      const result = await ingestionService.runIngestion('mock_jobs');

      expect(result).toBeDefined();
      expect(result.recordsFetched).toBe(2);
      expect(result.status).toBe('success');
    });

    it('should create new opportunities for new sourceIds', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      const result = await ingestionService.runIngestion('mock_jobs');

      expect(Opportunity.create).toHaveBeenCalledTimes(2);
      expect(result.recordsCreated).toBe(2);
    });

    it('should update existing opportunities for existing sourceIds', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      const existingOpp = {
        id: 10,
        source: 'mock_jobs',
        sourceId: 'job-1',
        update: jest.fn().mockResolvedValue(true),
      };
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(existingOpp);

      const result = await ingestionService.runIngestion('mock_jobs');

      expect(existingOpp.update).toHaveBeenCalled();
      expect(result.recordsUpdated).toBe(2);
    });

    it('should update IngestionLog with success status on completion', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      await ingestionService.runIngestion('mock_jobs');

      expect(mockLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          completedAt: expect.any(Date),
        })
      );
    });

    it('should update DataSource.lastRunAt on success', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      await ingestionService.runIngestion('mock_jobs');

      expect(mockDs.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastRunAt: expect.any(Date),
          lastRunStatus: 'success',
        })
      );
    });

    it('should handle adapter fetch() errors and set log status to failed', async () => {
      const MockJobsAdapter = require('../../../backend/src/ingestion/adapters/mockJobs.adapter');
      MockJobsAdapter.mockImplementationOnce(() => ({
        fetch: jest.fn().mockRejectedValue(new Error('Network error')),
        transform: jest.fn(),
      }));

      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);

      await expect(ingestionService.runIngestion('mock_jobs')).rejects.toThrow();

      expect(mockLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      );
    });

    it('should set partial status when some records fail', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create
        .mockResolvedValueOnce({ id: 1 })
        .mockRejectedValueOnce(new Error('Validation error'));

      const result = await ingestionService.runIngestion('mock_jobs');

      expect(result.status).toBe('partial');
      expect(result.recordsCreated).toBe(1);
      expect(result.recordsSkipped).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('should throw 404 for unknown data source name', async () => {
      DataSource.findOne.mockResolvedValue(null);

      await expect(ingestionService.runIngestion('unknown_source'))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('should throw 400 for disabled data source', async () => {
      const disabledDs = makeMockDataSource({ enabled: false });
      DataSource.findOne.mockResolvedValue(disabledDs);

      await expect(ingestionService.runIngestion('mock_jobs'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('should return a summary object with correct fields', async () => {
      const mockDs = makeMockDataSource();
      const mockLog = makeMockLog();
      DataSource.findOne.mockResolvedValue(mockDs);
      IngestionLog.create.mockResolvedValue(mockLog);
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      const result = await ingestionService.runIngestion('mock_jobs');

      expect(result).toEqual(expect.objectContaining({
        dataSource: 'mock_jobs',
        status: 'success',
        recordsFetched: 2,
        recordsCreated: 2,
        recordsUpdated: 0,
        recordsSkipped: 0,
        errors: 0,
        ingestionLogId: 1,
      }));
    });
  });

  describe('runAllEnabled', () => {
    it('should iterate all enabled sources and return results', async () => {
      const enabledSources = [
        makeMockDataSource({ name: 'mock_jobs' }),
        makeMockDataSource({ id: 2, name: 'mock_investments' }),
      ];
      DataSource.findAll.mockResolvedValue(enabledSources);
      DataSource.findOne
        .mockResolvedValueOnce(makeMockDataSource({ name: 'mock_jobs' }))
        .mockResolvedValueOnce(makeMockDataSource({ id: 2, name: 'mock_investments' }));

      IngestionLog.create.mockResolvedValue(makeMockLog());
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      const result = await ingestionService.runAllEnabled();

      expect(DataSource.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { enabled: true },
        })
      );
      expect(result.message).toContain('2 data source(s)');
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it('should return empty results when no enabled sources exist', async () => {
      DataSource.findAll.mockResolvedValue([]);

      const result = await ingestionService.runAllEnabled();

      expect(result.message).toContain('No enabled data sources');
      expect(result.results).toEqual([]);
    });

    it('should continue processing after a source fails', async () => {
      const enabledSources = [
        makeMockDataSource({ name: 'mock_jobs' }),
        makeMockDataSource({ id: 2, name: 'mock_investments' }),
      ];
      DataSource.findAll.mockResolvedValue(enabledSources);
      DataSource.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeMockDataSource({ id: 2, name: 'mock_investments' }));

      IngestionLog.create.mockResolvedValue(makeMockLog());
      Opportunity.findOne.mockResolvedValue(null);
      Opportunity.create.mockResolvedValue({ id: 1 });

      const result = await ingestionService.runAllEnabled();

      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('failed');
      expect(result.results[1].status).toBe('success');
    });
  });

  describe('getIngestionLogs', () => {
    it('should return paginated logs', async () => {
      const mockLogs = [
        { id: 1, status: 'success', recordsFetched: 10 },
        { id: 2, status: 'failed', recordsFetched: 0 },
      ];
      IngestionLog.findAndCountAll.mockResolvedValue({ rows: mockLogs, count: 2 });

      const result = await ingestionService.getIngestionLogs({ page: 1, limit: 20, offset: 0 });

      expect(result.logs).toEqual(mockLogs);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter by dataSourceId when provided', async () => {
      IngestionLog.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

      await ingestionService.getIngestionLogs({ page: 1, limit: 20, offset: 0, dataSourceId: 1 });

      const callArgs = IngestionLog.findAndCountAll.mock.calls[0][0];
      expect(callArgs.where.dataSourceId).toBe(1);
    });
  });

  describe('getAllDataSources', () => {
    it('should return all data sources ordered by name', async () => {
      const mockSources = [
        { id: 1, name: 'mock_investments' },
        { id: 2, name: 'mock_jobs' },
        { id: 3, name: 'sam_gov' },
      ];
      DataSource.findAll.mockResolvedValue(mockSources);

      const result = await ingestionService.getAllDataSources();

      expect(result).toEqual(mockSources);
      expect(DataSource.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          order: [['name', 'ASC']],
        })
      );
    });
  });
});
