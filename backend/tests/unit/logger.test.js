// The production logging path specifically.
//
// Regression context: in production the Console transport was added only when
// NODE_ENV !== 'production', so winston wrote exclusively to files inside the
// container. `docker logs` carried nothing but dotenv's startup tips, and
// release.yml's post-rollout assertion could not pass for ANY flag value.
// Observed 2026-10-01: all three schedulers were provably disabled in
// logs/combined.log while the release failed asserting the opposite.
//
// These tests exercise the real logger with NODE_ENV=production, because that is
// the path that was broken; testing the development path would have stayed green
// throughout the incident.

const ORIGINAL_ENV = process.env.NODE_ENV;

function loadLoggerWith(nodeEnv) {
  let logger;
  jest.isolateModules(() => {
    process.env.NODE_ENV = nodeEnv;
    // eslint-disable-next-line global-require
    logger = require('../../src/logging/logger');
  });
  return logger;
}

/**
 * Capture what the Console transport is handed for one log call.
 *
 * Two earlier versions of this helper spied on `process.stdout.write`. That is
 * the wrong seam under Jest: winston's Console transport falls back to the
 * patched global `console`, which Jest buffers for its reporter instead of
 * writing through to the real stdout. The first version additionally restored
 * the spy synchronously and so raced winston's async flush — it passed locally
 * by timing luck and captured nothing in CI, twice.
 *
 * This asserts at the transport boundary instead. `info[Symbol.for('message')]`
 * is the fully-formatted string winston hands the transport — the exact bytes
 * that reach stdout in production — so it proves formatting and redaction
 * without depending on how the test runner patches console. The bounded wait
 * remains because the pipeline is still asynchronous.
 */
async function captureConsoleOutput(logger, fn, { timeoutMs = 2000 } = {}) {
  const consoleTransport = logger.transports.find(
    (t) => t.constructor && t.constructor.name === 'Console',
  );
  if (!consoleTransport) throw new Error('no Console transport registered');

  const written = [];
  const spy = jest
    .spyOn(consoleTransport, 'log')
    .mockImplementation(function capture(info, next) {
      written.push(String(info[Symbol.for('message')]));
      if (typeof next === 'function') next();
      return true;
    });

  try {
    fn();
    const deadline = Date.now() + timeoutMs;
    while (written.length === 0 && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    spy.mockRestore();
  }
  return written.join('\n');
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

// NOTE ON FIDELITY: these tests assert at the Console transport boundary, which
// proves the record is formatted and redacted correctly and is routed to the
// transport that writes stdout. They do NOT exercise winston's own write to the
// real file descriptor — that is winston's responsibility, and the end-to-end
// proof is operational: after deploy, `docker logs op-backend` must show these
// lines, which release.yml now asserts for all three schedulers.
describe('production logging path', () => {
  it('registers a Console transport when NODE_ENV=production', () => {
    const logger = loadLoggerWith('production');
    const consoleTransports = logger.transports.filter(
      (t) => t.constructor && t.constructor.name === 'Console',
    );
    expect(consoleTransports).toHaveLength(1);
  });

  it('hands fully-formatted JSON to the Console transport in production', async () => {
    const logger = loadLoggerWith('production');

    const out = await captureConsoleOutput(logger, () => {
      logger.warn('Ingestion scheduler DISABLED by INGESTION_SCHEDULER_ENABLED=false', {
        event: 'ingestion_scheduler_disabled',
        scheduler: 'ingestion',
      });
    });

    expect(out).not.toBe('');
    const line = out.trim().split('\n').pop();
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('ingestion_scheduler_disabled');
    expect(parsed.scheduler).toBe('ingestion');
    expect(parsed.level).toBe('warn');
    expect(parsed.service).toBe('opportunity-pulse');
    expect(parsed.timestamp).toEqual(expect.any(String));
  });

  it('emits a line release.yml can match, for each scheduler', async () => {
    const logger = loadLoggerWith('production');

    for (const scheduler of ['ingestion', 'freelance', 'research']) {
      const out = await captureConsoleOutput(logger, () => {
        logger.warn('disabled', { event: 'ingestion_scheduler_disabled', scheduler });
      });
      // This is the exact shape the workflow greps for.
      expect(out).toContain(`"scheduler":"${scheduler}"`);
    }
  });
});

describe('redaction applies before any transport', () => {
  it('redacts sensitive keys before the Console transport sees them', async () => {
    const logger = loadLoggerWith('production');

    const out = await captureConsoleOutput(logger, () => {
      logger.info('outbound call', {
        apiKey: 'should-not-appear',
        password: 'should-not-appear',
        access_key: 'should-not-appear',
        authorization: 'should-not-appear',
        safeField: 'visible',
      });
    });

    expect(out).not.toContain('should-not-appear');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('visible');
  });

  it('redacts nested sensitive keys', async () => {
    const logger = loadLoggerWith('production');

    const out = await captureConsoleOutput(logger, () => {
      logger.info('nested', {
        outer: { inner: { secret: 'should-not-appear', keep: 'visible' } },
        list: [{ token: 'should-not-appear' }],
      });
    });

    expect(out).not.toContain('should-not-appear');
    expect(out).toContain('visible');
  });

  it('does NOT redact ordinary keys that merely contain a sensitive substring', async () => {
    const logger = loadLoggerWith('production');

    const out = await captureConsoleOutput(logger, () => {
      logger.info('article', { author: 'ada', authorId: 7 });
    });

    expect(out).toContain('ada');
    expect(out).not.toContain('[REDACTED]');
  });

  it('is key-based only — a secret inside the message string is NOT scrubbed', async () => {
    // Documented limitation, asserted so it cannot be mistaken for a guarantee.
    const logger = loadLoggerWith('production');

    const out = await captureConsoleOutput(logger, () => {
      logger.info('connecting with password=hunter2');
    });

    expect(out).toContain('hunter2');
  });
});

describe('development logging path is unchanged', () => {
  it('still registers a Console transport outside production', () => {
    const logger = loadLoggerWith('development');
    const consoleTransports = logger.transports.filter(
      (t) => t.constructor && t.constructor.name === 'Console',
    );
    expect(consoleTransports).toHaveLength(1);
  });
});
