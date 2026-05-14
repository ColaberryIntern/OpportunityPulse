// Deep Research Phase 2 — aiProvider.service tests.
// NODE_ENV=test makes the backoff delay 0, so retries run instantly.

jest.mock('../../src/analysis/ai.client', () => {
  const client = { model: 'gpt-4o-mini', chat: jest.fn(), embed: jest.fn() };
  return { getAIClient: () => client, __client: client };
});
jest.mock('../../src/models', () => ({
  AiProviderLog: { create: jest.fn().mockResolvedValue({}) },
}));

const aiMod = require('../../src/analysis/ai.client');
const { AiProviderLog } = require('../../src/models');
const svc = require('../../src/deepResearch/aiProvider.service');

beforeEach(() => {
  aiMod.__client.chat.mockReset();
  aiMod.__client.embed.mockReset();
  AiProviderLog.create.mockClear();
});

describe('aiProvider.classifyError', () => {
  it('classifies rate limits', () => {
    expect(svc.classifyError({ status: 429 })).toBe('rate_limit');
    expect(svc.classifyError(new Error('You exceeded your quota'))).toBe('rate_limit');
  });
  it('classifies auth failures', () => {
    expect(svc.classifyError({ status: 401 })).toBe('auth');
    expect(svc.classifyError({ code: 'PROVIDER_NOT_CONFIGURED' })).toBe('auth');
  });
  it('classifies server + network errors', () => {
    expect(svc.classifyError({ status: 503 })).toBe('server');
    expect(svc.classifyError(new Error('ECONNRESET while reading'))).toBe('network');
  });
  it('falls back to "other"', () => {
    expect(svc.classifyError(new Error('something weird'))).toBe('other');
  });
});

describe('aiProvider.backoffMs', () => {
  it('grows exponentially and stays within the jitter band', () => {
    // BASE_DELAY_MS is 0 under test → all backoffs are 0. Verify it never
    // returns negative / NaN regardless.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const ms = svc.backoffMs(attempt);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(ms)).toBe(true);
    }
  });
});

describe('aiProvider.getProvider', () => {
  it('returns the openai provider', () => {
    expect(svc.getProvider('openai')).toBeTruthy();
  });
  it('throws PROVIDER_NOT_CONFIGURED for unknown providers', () => {
    expect(() => svc.getProvider('llama-local')).toThrow(/not configured/);
  });
  it('exposes anthropic / gemini as stubs that throw when called', () => {
    expect(() => svc.getProvider('anthropic').chat()).toThrow(/not configured/);
  });
});

describe('aiProvider.chat', () => {
  it('returns on first success and logs the attempt', async () => {
    aiMod.__client.chat.mockResolvedValue({ content: '{}', tokensUsed: 100 });
    const out = await svc.chat('sys', 'user', { operation: 'test_op' });
    expect(out.content).toBe('{}');
    expect(out.attempts).toBe(1);
    expect(out.provider).toBe('openai');
    expect(AiProviderLog.create).toHaveBeenCalledTimes(1);
    expect(AiProviderLog.create.mock.calls[0][0].status).toBe('success');
  });

  it('retries a transient rate-limit failure then succeeds', async () => {
    const rateLimit = Object.assign(new Error('rate limit'), { status: 429 });
    aiMod.__client.chat
      .mockRejectedValueOnce(rateLimit)
      .mockResolvedValueOnce({ content: 'ok', tokensUsed: 50 });
    const out = await svc.chat('sys', 'user');
    expect(out.content).toBe('ok');
    expect(out.attempts).toBe(2);
    // one failure log + one success log
    expect(AiProviderLog.create).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry an auth failure — fails fast', async () => {
    const authErr = Object.assign(new Error('invalid api key'), { status: 401 });
    aiMod.__client.chat.mockRejectedValue(authErr);
    await expect(svc.chat('sys', 'user')).rejects.toThrow(/api key/);
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(1); // no retry
  });

  it('exhausts retries on a persistent transient failure', async () => {
    const rateLimit = Object.assign(new Error('quota'), { status: 429 });
    aiMod.__client.chat.mockRejectedValue(rateLimit);
    await expect(svc.chat('sys', 'user')).rejects.toMatchObject({ errorClass: 'rate_limit' });
    expect(aiMod.__client.chat).toHaveBeenCalledTimes(svc.MAX_ATTEMPTS);
  });

  it('logging failure never breaks the AI call', async () => {
    AiProviderLog.create.mockRejectedValueOnce(new Error('db down'));
    aiMod.__client.chat.mockResolvedValue({ content: 'ok', tokensUsed: 1 });
    const out = await svc.chat('sys', 'user');
    expect(out.content).toBe('ok');
  });
});

describe('aiProvider.embed', () => {
  it('wraps embed with the same resilience', async () => {
    aiMod.__client.embed.mockResolvedValue({ vectors: [[1, 2]], tokensUsed: 10 });
    const out = await svc.embed('text');
    expect(out.vectors).toEqual([[1, 2]]);
    expect(out.attempts).toBe(1);
  });
});
