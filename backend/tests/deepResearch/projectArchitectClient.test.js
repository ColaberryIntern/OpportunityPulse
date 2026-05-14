// Deep Research Phase 3 — projectArchitectClient.service tests.
// Mocks global fetch; NODE_ENV=test makes the backoff delay 0.

const svc = require('../../src/deepResearch/projectArchitectClient.service');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_URL = process.env.AGENT_FOUNDRY_API_URL;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) delete process.env.AGENT_FOUNDRY_API_URL;
  else process.env.AGENT_FOUNDRY_API_URL = ORIGINAL_URL;
});

describe('projectArchitectClient.isConfigured', () => {
  it('is false when AGENT_FOUNDRY_API_URL is unset', () => {
    delete process.env.AGENT_FOUNDRY_API_URL;
    expect(svc.isConfigured()).toBe(false);
  });
  it('is true when AGENT_FOUNDRY_API_URL is set', () => {
    process.env.AGENT_FOUNDRY_API_URL = 'https://agent-foundry.example.com';
    expect(svc.isConfigured()).toBe(true);
  });
});

describe('projectArchitectClient.classifyError', () => {
  it('classifies HTTP statuses + network errors', () => {
    expect(svc.classifyError(null, 429)).toBe('rate_limit');
    expect(svc.classifyError(null, 401)).toBe('auth');
    expect(svc.classifyError(null, 502)).toBe('server');
    expect(svc.classifyError(new Error('fetch failed'))).toBe('network');
    expect(svc.classifyError(new Error('The operation was aborted'))).toBe('timeout');
  });
});

describe('projectArchitectClient.normalizeJob', () => {
  it('normalizes varied remote field names', () => {
    expect(svc.normalizeJob({ job_id: 'abc', status: 'running', progress: 40 }))
      .toMatchObject({ externalJobId: 'abc', status: 'running', progressPercent: 40 });
    expect(svc.normalizeJob({ id: 'x', artifact_url: '/p/x' }))
      .toMatchObject({ externalJobId: 'x', artifactUrl: '/p/x' });
  });
});

describe('projectArchitectClient — calls throw NOT_CONFIGURED when unconfigured', () => {
  it('createJob / pollJob / getArtifacts all throw NOT_CONFIGURED', async () => {
    delete process.env.AGENT_FOUNDRY_API_URL;
    await expect(svc.createJob({})).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await expect(svc.pollJob('x')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await expect(svc.getArtifacts('x')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});

describe('projectArchitectClient — real HTTP path (mocked fetch)', () => {
  beforeEach(() => { process.env.AGENT_FOUNDRY_API_URL = 'https://agent-foundry.example.com'; });

  it('createJob POSTs and normalizes the response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-123', status: 'queued' }),
    });
    const job = await svc.createJob({ project_name: 'X' });
    expect(job.externalJobId).toBe('job-123');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://agent-foundry.example.com/api/v1/jobs');
    expect(opts.method).toBe('POST');
  });

  it('pollJob retries a transient 503 then succeeds', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'job-1', status: 'success', progress: 100 }) });
    const job = await svc.pollJob('job-1');
    expect(job.status).toBe('success');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a 401 — fails fast', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'no key' });
    await expect(svc.pollJob('job-1')).rejects.toThrow(/401/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
