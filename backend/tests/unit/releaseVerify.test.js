// Behavioural tests for scripts/release/verify-release.sh.
//
// WHY THESE EXIST
// The release verification logic previously lived inline in release.yml, where
// the only checks were "YAML parses" and "bash -n passes". Both were satisfied
// by five separate assertions that could never be true, every one of which
// reached production. These tests run the REAL script with a mocked `docker` on
// PATH and assert its exit status, which is the only thing that distinguishes a
// gate that works from a gate that merely lints.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../../scripts/release/verify-release.sh');

/** winston's real output shape: one JSON object per line. */
function disabledRecord(scheduler) {
  return JSON.stringify({
    event: 'ingestion_scheduler_disabled',
    level: 'warn',
    message: `${scheduler} scheduler DISABLED by INGESTION_SCHEDULER_ENABLED=false`,
    scheduler,
    service: 'opportunity-pulse',
    timestamp: '2026-10-01T04:54:50.828Z',
  });
}

const ALL_THREE = ['ingestion', 'freelance', 'research', 'source_health_agent'].map(disabledRecord).join('\n');

const PAUSED_FLAGS = {
  INGESTION_SCHEDULER_ENABLED: 'false',
  BONFIRE_SCRAPER_CRON_ENABLED: 'false',
  BONFIRE_STRATEGIST_CRON_ENABLED: 'false',
  BONFIRE_ENGINE_ENABLED: 'true',
  BONFIRE_SCRAPER_ENABLED: 'true',
};

const STARTED_AT = '2026-10-01T04:54:47.780796825Z';

// Supplied unless a case is specifically about the measurement section, because
// the verifier now REFUSES to pass when no measurements were supplied.
const STABLE_PAIRS = 'ingestion_logs:7694:7694 gov_source_snapshots:0:0';

function sanitize(value) {
  return String(value).replace(/[^A-Za-z0-9]/g, '_');
}

/**
 * Build a throwaway PATH containing a `docker` that answers from fixtures.
 * Pure shell, no node spawns — the mock is called many times per case.
 */
function makeEnv({
  flags = PAUSED_FLAGS,
  startedAt = STARTED_AT,
  logsBySince = {},
  logs = null,
  inspectFails = false,
  logsFails = false,
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relverify-'));

  const flagDir = path.join(dir, 'flags');
  fs.mkdirSync(flagDir);
  for (const [name, value] of Object.entries(flags)) {
    fs.writeFileSync(path.join(flagDir, name), String(value));
  }

  fs.writeFileSync(path.join(dir, 'started_at'), startedAt);
  fs.writeFileSync(path.join(dir, 'inspect_fails'), inspectFails ? '1' : '0');
  fs.writeFileSync(path.join(dir, 'logs_fails'), logsFails ? '1' : '0');

  const logDir = path.join(dir, 'logs');
  fs.mkdirSync(logDir);
  const map = logs === null ? logsBySince : { [startedAt]: logs };
  for (const [since, body] of Object.entries(map)) {
    fs.writeFileSync(path.join(logDir, sanitize(since) || '_empty'), body);
  }

  const fixtures = dir.split(path.sep).join('/');
  const mock = `#!/usr/bin/env bash
FIX="${fixtures}"
case "$1" in
  exec)
    name="\${4:-}"
    if [ -f "$FIX/flags/$name" ]; then cat "$FIX/flags/$name"; else exit 1; fi
    ;;
  inspect)
    if [ "$(cat "$FIX/inspect_fails")" = "1" ]; then exit 1; fi
    fmt="\${3:-}"
    case "$fmt" in
      *StartedAt*) cat "$FIX/started_at" ;;
      *Id*)        printf '%s' 'abcdef0123456789' ;;
      *)           printf '' ;;
    esac
    ;;
  logs)
    if [ "$(cat "$FIX/logs_fails")" = "1" ]; then exit 1; fi
    since=""; prev=""
    for a in "$@"; do
      if [ "$prev" = "--since" ]; then since="$a"; fi
      prev="$a"
    done
    key=$(printf '%s' "$since" | tr -c 'A-Za-z0-9' '_')
    if [ -f "$FIX/logs/$key" ]; then cat "$FIX/logs/$key"; fi
    ;;
esac
exit 0
`;
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const dockerPath = path.join(bin, 'docker');
  fs.writeFileSync(dockerPath, mock, { mode: 0o755 });
  try {
    fs.chmodSync(dockerPath, 0o755);
  } catch {
    /* best effort */
  }
  return { dir, bin };
}

function runVerify(opts = {}) {
  const { bin } = makeEnv(opts);
  const res = spawnSync('bash', [SCRIPT], {
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      CONTAINER: 'op-backend',
      BASELINE_PAIRS: STABLE_PAIRS,
      ...(opts.env || {}),
    },
    encoding: 'utf8',
  });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    all: `${res.stdout || ''}\n${res.stderr || ''}`,
  };
}

describe('release verification: the passing shape', () => {
  it('passes with existing service enabled and all three pause controls false', () => {
    const r = runVerify({ logs: ALL_THREE });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RELEASE VERIFICATION PASSED');
    expect(r.stdout).toContain('BONFIRE_ENGINE_ENABLED=true matches the observed baseline');
  });

  it('describes the baseline as observed, never as approved', () => {
    const r = runVerify({ logs: ALL_THREE });
    expect(r.stdout).toContain('observed configuration baseline');
    expect(r.all).not.toMatch(/approved baseline/i);
  });
});

describe('release verification: pause controls', () => {
  it.each([['true'], ['TRUE'], [''], ['flase'], ['0']])(
    'fails when a pause control is %p',
    (value) => {
      const r = runVerify({
        flags: { ...PAUSED_FLAGS, INGESTION_SCHEDULER_ENABLED: value },
        logs: ALL_THREE,
      });
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('pause control INGESTION_SCHEDULER_ENABLED');
    },
  );

  it('fails when a pause control is missing entirely', () => {
    const flags = { ...PAUSED_FLAGS };
    delete flags.BONFIRE_SCRAPER_CRON_ENABLED;
    const r = runVerify({ flags, logs: ALL_THREE });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('BONFIRE_SCRAPER_CRON_ENABLED=unset');
  });

  it('reports every failing pause control, not only the first', () => {
    const r = runVerify({
      flags: {
        ...PAUSED_FLAGS,
        INGESTION_SCHEDULER_ENABLED: 'true',
        BONFIRE_STRATEGIST_CRON_ENABLED: 'true',
      },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('INGESTION_SCHEDULER_ENABLED');
    expect(r.stderr).toContain('BONFIRE_STRATEGIST_CRON_ENABLED');
  });
});

describe('release verification: observed baseline is a drift detector', () => {
  it('does NOT require BONFIRE_ENGINE_ENABLED to be false', () => {
    const r = runVerify({ logs: ALL_THREE });
    expect(r.code).toBe(0);
    expect(r.all).not.toMatch(/BONFIRE_ENGINE_ENABLED.*must be exactly false/);
  });

  it('fails on drift in either direction', () => {
    const r = runVerify({
      flags: { ...PAUSED_FLAGS, BONFIRE_ENGINE_ENABLED: 'false' },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('configuration drift: BONFIRE_ENGINE_ENABLED=false');
  });

  it('treats scraper capability as independent of v1 service availability', () => {
    const r = runVerify({
      flags: { ...PAUSED_FLAGS, BONFIRE_SCRAPER_ENABLED: 'false' },
      env: { OBSERVED_BASELINE: 'BONFIRE_ENGINE_ENABLED=true BONFIRE_SCRAPER_ENABLED=false' },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(0);
  });

  it('reports manual write capability separately from the pause', () => {
    const r = runVerify({ logs: ALL_THREE });
    expect(r.stdout).toContain('manual write capability (NOT disabled by the pause controls)');
    expect(r.stdout).toContain('POST /scrape/run is reachable');
  });
});

describe('release verification: phase 2 is reported honestly', () => {
  it('does not claim the pause makes Phase 2 inactive', () => {
    const r = runVerify({ logs: ALL_THREE });
    expect(r.stdout).toContain('AVAILABLE since the migration');
    expect(r.stdout).toContain('do NOT make Phase 2 inactive');
    expect(r.all).not.toMatch(/inactive semantics are enforced by the pause/i);
  });
});

describe('release verification: scheduler evidence is parsed as JSON', () => {
  it('fails when one scheduler is missing from the boot', () => {
    const logs = [disabledRecord('ingestion'), disabledRecord('research')].join('\n');
    const r = runVerify({ logs });
    expect(r.code).toBe(1);
    expect(r.all).toContain('freelance');
  });

  it('rejects a scheduler name without the disabled event', () => {
    const decoys = ['ingestion', 'freelance', 'research', 'source_health_agent']
      .map((s) => JSON.stringify({ level: 'info', message: 'started', scheduler: s }))
      .join('\n');
    const r = runVerify({ logs: decoys });
    expect(r.code).toBe(1);
  });

  it('rejects the wrong event name even with the right scheduler', () => {
    const wrong = ['ingestion', 'freelance', 'research', 'source_health_agent']
      .map((s) => JSON.stringify({ event: 'scheduler_started', scheduler: s }))
      .join('\n');
    const r = runVerify({ logs: wrong });
    expect(r.code).toBe(1);
  });

  it('rejects the event and the scheduler split across SEPARATE records', () => {
    const split = [
      JSON.stringify({ event: 'ingestion_scheduler_disabled', scheduler: 'ingestion' }),
      JSON.stringify({ level: 'info', scheduler: 'freelance' }),
      JSON.stringify({ level: 'info', scheduler: 'research' }),
    ].join('\n');
    const r = runVerify({ logs: split });
    expect(r.code).toBe(1);
    expect(r.all).toContain('freelance');
  });

  it('rejects a NESTED lookalike that substring matching would accept', () => {
    // Every marker is present in the raw text, but not as top-level fields.
    const nested = ['ingestion', 'freelance', 'research', 'source_health_agent']
      .map((s) =>
        JSON.stringify({
          level: 'info',
          meta: { event: 'ingestion_scheduler_disabled', scheduler: s },
        }),
      )
      .join('\n');
    const r = runVerify({ logs: nested });
    expect(r.code).toBe(1);
  });

  it('ignores non-JSON lines rather than failing on them', () => {
    // dotenv tips and entrypoint echoes are legitimately present.
    const mixed = [
      '[dotenv@17.3.1] injecting env (0) from .env',
      '[entrypoint] starting Xvfb',
      ALL_THREE,
    ].join('\n');
    const r = runVerify({ logs: mixed });
    expect(r.code).toBe(0);
  });

  it('does NOT accept evidence from a previous container boot', () => {
    const r = runVerify({
      startedAt: STARTED_AT,
      logsBySince: { '2026-10-01T02:58:05.889237933Z': ALL_THREE },
    });
    expect(r.code).toBe(1);
  });
});

describe('release verification: docker failures are explicit', () => {
  it('fails when docker inspect fails', () => {
    const r = runVerify({ inspectFails: true, logs: ALL_THREE });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('docker inspect failed');
  });

  it('fails when docker logs fails', () => {
    const r = runVerify({ logsFails: true, logs: ALL_THREE });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('docker logs failed');
  });

  it('fails when StartedAt is empty rather than silently skipping', () => {
    const r = runVerify({ startedAt: '', logs: ALL_THREE });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('empty StartedAt');
  });
});

describe('release verification: measurements are mandatory', () => {
  it('FAILS when no measurements are supplied, instead of skipping the section', () => {
    // The previous version skipped silently, which is how a release came to
    // verify nothing about the data while its unit tests passed.
    const r = runVerify({ logs: ALL_THREE, env: { BASELINE_PAIRS: '' } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('data stability was not verified');
  });

  it('fails on a malformed measurement triple', () => {
    const r = runVerify({ logs: ALL_THREE, env: { BASELINE_PAIRS: 'ingestion_logs:7694' } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('malformed measurement');
  });

  it.each([
    ['ingestion_logs:7694:7695', 'ingestion_logs'],
    ['deadline_checksum:8dd31f83:deadbeef', 'deadline_checksum'],
    ['gov_canonical_opportunities:0:1', 'gov_canonical_opportunities'],
    ['gov_source_snapshots:0:4', 'gov_source_snapshots'],
    ['gov_family_members:2:3', 'gov_family_members'],
  ])('fails on drift in %s', (pairs, label) => {
    const r = runVerify({ logs: ALL_THREE, env: { BASELINE_PAIRS: pairs } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`data drift: ${label}`);
  });

  it('compares actual before/after values rather than assuming zero', () => {
    // Non-zero gov counts that are STABLE must pass: hardcoding zero would stop
    // being correct the moment Phase 2 is activated.
    const r = runVerify({
      logs: ALL_THREE,
      env: { BASELINE_PAIRS: 'gov_canonical_opportunities:12:12 gov_source_snapshots:34:34' },
    });
    expect(r.code).toBe(0);
  });
});
