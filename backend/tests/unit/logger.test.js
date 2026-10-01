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

/** Capture whatever the logger writes to stdout for one call. */
function captureStdout(fn) {
  const written = [];
  const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    written.push(chunk.toString());
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return written.join('');
}

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

describe('production logging path', () => {
  it('registers a Console transport when NODE_ENV=production', () => {
    const logger = loadLoggerWith('production');
    const consoleTransports = logger.transports.filter(
      (t) => t.constructor && t.constructor.name === 'Console',
    );
    expect(consoleTransports).toHaveLength(1);
  });

  it('writes structured JSON to stdout in production', () => {
    const logger = loadLoggerWith('production');

    const out = captureStdout(() => {
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

  it('emits a line release.yml can match, for each scheduler', () => {
    const logger = loadLoggerWith('production');

    for (const scheduler of ['ingestion', 'freelance', 'research']) {
      const out = captureStdout(() => {
        logger.warn('disabled', { event: 'ingestion_scheduler_disabled', scheduler });
      });
      // This is the exact shape the workflow greps for.
      expect(out).toContain(`"scheduler":"${scheduler}"`);
    }
  });
});

describe('redaction applies before any transport', () => {
  it('redacts sensitive keys in production stdout output', () => {
    const logger = loadLoggerWith('production');

    const out = captureStdout(() => {
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

  it('redacts nested sensitive keys', () => {
    const logger = loadLoggerWith('production');

    const out = captureStdout(() => {
      logger.info('nested', {
        outer: { inner: { secret: 'should-not-appear', keep: 'visible' } },
        list: [{ token: 'should-not-appear' }],
      });
    });

    expect(out).not.toContain('should-not-appear');
    expect(out).toContain('visible');
  });

  it('does NOT redact ordinary keys that merely contain a sensitive substring', () => {
    const logger = loadLoggerWith('production');

    const out = captureStdout(() => {
      logger.info('article', { author: 'ada', authorId: 7 });
    });

    expect(out).toContain('ada');
    expect(out).not.toContain('[REDACTED]');
  });

  it('is key-based only — a secret inside the message string is NOT scrubbed', () => {
    // Documented limitation, asserted so it cannot be mistaken for a guarantee.
    const logger = loadLoggerWith('production');

    const out = captureStdout(() => {
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
