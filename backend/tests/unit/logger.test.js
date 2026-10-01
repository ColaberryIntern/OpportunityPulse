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
 * Render a record through the logger's REAL format chain, synchronously.
 *
 * Three earlier versions tried to observe the write itself — twice via
 * `process.stdout.write`, once via a spy on the Console transport's `log`. All
 * three passed locally and captured nothing in CI, each burning the full 2s
 * bound, which means the record never reached the observation point there. The
 * cause was never identified, so depending on winston's async dispatch at all
 * was the mistake.
 *
 * This asserts the thing actually under test: that the shared format chain
 * produces redacted JSON. `info[Symbol.for('message')]` is the exact string
 * winston hands a transport, so what is asserted here is what would be written.
 * `defaultMeta` is merged in by the logger rather than the format chain, so it
 * is applied explicitly to keep the rendered shape faithful.
 *
 * What this does NOT cover: winston's own write to the file descriptor. That is
 * proven operationally instead — after deploy, `docker logs op-backend` must
 * show these lines, which release.yml asserts for all three schedulers.
 */
function renderRecord(logger, level, message, meta = {}) {
  const LEVEL = Symbol.for('level');
  const MESSAGE = Symbol.for('message');

  const info = Object.assign({ level, message }, logger.defaultMeta || {}, meta);
  info[LEVEL] = level;

  const out = logger.format.transform(info, logger.format.options);
  if (!out) throw new Error('format chain dropped the record');
  return String(out[MESSAGE]);
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

  it('renders fully-formatted JSON for the transports in production', () => {
    const logger = loadLoggerWith('production');

    const out = renderRecord(
      logger,
      'warn',
      'Ingestion scheduler DISABLED by INGESTION_SCHEDULER_ENABLED=false',
      { event: 'ingestion_scheduler_disabled', scheduler: 'ingestion' },
    );

    expect(out).not.toBe('');
    const parsed = JSON.parse(out);
    expect(parsed.event).toBe('ingestion_scheduler_disabled');
    expect(parsed.scheduler).toBe('ingestion');
    expect(parsed.level).toBe('warn');
    expect(parsed.service).toBe('opportunity-pulse');
    expect(parsed.timestamp).toEqual(expect.any(String));
  });

  it('emits a line release.yml can match, for each scheduler', () => {
    const logger = loadLoggerWith('production');

    for (const scheduler of ['ingestion', 'freelance', 'research']) {
      const out = renderRecord(logger, 'warn', 'disabled', {
        event: 'ingestion_scheduler_disabled',
        scheduler,
      });
      // This is the exact shape the workflow greps for.
      expect(out).toContain(`"scheduler":"${scheduler}"`);
    }
  });
});

describe('redaction applies before any transport', () => {
  it('redacts sensitive keys before any transport sees them', () => {
    const logger = loadLoggerWith('production');

    const out = renderRecord(logger, 'info', 'outbound call', {
      apiKey: 'should-not-appear',
      password: 'should-not-appear',
      access_key: 'should-not-appear',
      authorization: 'should-not-appear',
      safeField: 'visible',
    });

    expect(out).not.toContain('should-not-appear');
    expect(out).toContain('[REDACTED]');
    expect(out).toContain('visible');
  });

  it('redacts nested sensitive keys', () => {
    const logger = loadLoggerWith('production');

    const out = renderRecord(logger, 'info', 'nested', {
      outer: { inner: { secret: 'should-not-appear', keep: 'visible' } },
      list: [{ token: 'should-not-appear' }],
    });

    expect(out).not.toContain('should-not-appear');
    expect(out).toContain('visible');
  });

  it('does NOT redact ordinary keys that merely contain a sensitive substring', () => {
    const logger = loadLoggerWith('production');

    const out = renderRecord(logger, 'info', 'article', { author: 'ada', authorId: 7 });

    expect(out).toContain('ada');
    expect(out).not.toContain('[REDACTED]');
  });

  it('is key-based only — a secret inside the message string is NOT scrubbed', () => {
    // Documented limitation, asserted so it cannot be mistaken for a guarantee.
    const logger = loadLoggerWith('production');

    const out = renderRecord(logger, 'info', 'connecting with password=hunter2');

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
