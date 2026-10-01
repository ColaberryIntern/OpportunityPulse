// Behavioural tests for scripts/release/verify-release.sh.
//
// WHY THESE EXIST
// The release verification logic previously lived inline in release.yml, where
// the only checks were "YAML parses" and "bash -n passes". Both were satisfied
// by five separate assertions that could never be true, every one of which
// reached production. These tests run the REAL script with a mocked `docker` on
// PATH and assert its exit status, which is the only thing that distinguishes a
// gate that works from a gate that merely lints.
//
// The mock is a small shell script that answers `docker exec ... printenv NAME`,
// `docker inspect -f ... CONTAINER` and `docker logs --since ... CONTAINER` from
// a fixture directory, so each case controls exactly what the container appears
// to report.

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

const ALL_THREE = ['ingestion', 'freelance', 'research'].map(disabledRecord).join('\n');

const PAUSED_FLAGS = {
  INGESTION_SCHEDULER_ENABLED: 'false',
  BONFIRE_SCRAPER_CRON_ENABLED: 'false',
  BONFIRE_STRATEGIST_CRON_ENABLED: 'false',
  BONFIRE_ENGINE_ENABLED: 'true',
  BONFIRE_SCRAPER_ENABLED: 'true',
};

const STARTED_AT = '2026-10-01T04:54:47.780796825Z';

function sanitize(value) {
  return String(value).replace(/[^A-Za-z0-9]/g, '_');
}

/**
 * Build a throwaway PATH containing a `docker` that answers from fixtures.
 * Pure shell, no node spawns — the mock is called ~20 times per case.
 *
 * `logsBySince` keys the log output by the --since value, so a test can prove
 * that evidence from a PREVIOUS boot does not satisfy the current-boot check.
 */
function makeEnv({ flags = PAUSED_FLAGS, startedAt = STARTED_AT, logsBySince = {}, logs = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relverify-'));

  // One file per flag; an absent file means the variable is unset.
  const flagDir = path.join(dir, 'flags');
  fs.mkdirSync(flagDir);
  for (const [name, value] of Object.entries(flags)) {
    fs.writeFileSync(path.join(flagDir, name), String(value));
  }

  fs.writeFileSync(path.join(dir, 'started_at'), startedAt);

  const logDir = path.join(dir, 'logs');
  fs.mkdirSync(logDir);
  const map = logs === null ? logsBySince : { [startedAt]: logs };
  for (const [since, body] of Object.entries(map)) {
    // An empty --since sanitizes to an empty name, which would resolve to the
    // directory itself. The script never reaches `docker logs` in that case
    // (it fails on StartedAt first), but the fixture must still be writable.
    fs.writeFileSync(path.join(logDir, sanitize(since) || '_empty'), body);
  }

  const fixtures = dir.split(path.sep).join('/');
  const mock = `#!/usr/bin/env bash
FIX="${fixtures}"
case "$1" in
  exec)
    # docker exec <container> printenv <NAME>
    name="\${4:-}"
    if [ -f "$FIX/flags/$name" ]; then cat "$FIX/flags/$name"; else exit 1; fi
    ;;
  inspect)
    # docker inspect -f '<fmt>' <container>
    fmt="\${3:-}"
    case "$fmt" in
      *StartedAt*) cat "$FIX/started_at" ;;
      *Id*)        printf '%s' 'abcdef0123456789' ;;
      *)           printf '' ;;
    esac
    ;;
  logs)
    # docker logs --since <ts> <container>
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
    /* best effort on platforms without POSIX modes */
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
  it('passes with existing v1 service enabled and all three pause controls false', () => {
    const r = runVerify({ logs: ALL_THREE });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RELEASE VERIFICATION PASSED');
    // The service flags are verified, not forced off.
    expect(r.stdout).toContain('BONFIRE_ENGINE_ENABLED=true matches approved baseline');
    expect(r.stdout).toContain('BONFIRE_SCRAPER_ENABLED=true matches approved baseline');
  });
});

describe('release verification: pause controls', () => {
  it.each([
    ['true', 'true'],
    ['TRUE', 'TRUE'],
    ['', 'empty'],
    ['flase', 'a typo'],
    ['0', 'zero'],
  ])('fails when a pause control is %p (%s)', (value) => {
    const r = runVerify({
      flags: { ...PAUSED_FLAGS, INGESTION_SCHEDULER_ENABLED: value },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('pause control INGESTION_SCHEDULER_ENABLED');
    expect(r.stderr).toContain('must be exactly false');
  });

  it('fails when a pause control is missing entirely', () => {
    const flags = { ...PAUSED_FLAGS };
    delete flags.BONFIRE_SCRAPER_CRON_ENABLED;
    const r = runVerify({ flags, logs: ALL_THREE });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('BONFIRE_SCRAPER_CRON_ENABLED=unset');
  });

  it('fails when the strategist pause control is true', () => {
    const r = runVerify({
      flags: { ...PAUSED_FLAGS, BONFIRE_STRATEGIST_CRON_ENABLED: 'true' },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('pause control BONFIRE_STRATEGIST_CRON_ENABLED');
  });

  it('reports every failing pause control, not only the first', () => {
    const r = runVerify({
      flags: {
        ...PAUSED_FLAGS,
        INGESTION_SCHEDULER_ENABLED: 'true',
        BONFIRE_SCRAPER_CRON_ENABLED: 'true',
      },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('INGESTION_SCHEDULER_ENABLED');
    expect(r.stderr).toContain('BONFIRE_SCRAPER_CRON_ENABLED');
  });
});

describe('release verification: existing service flags are baselined, not forced off', () => {
  it('does NOT require BONFIRE_ENGINE_ENABLED to be false', () => {
    // Turning this off 404s the whole v1 Bonfire surface a live consumer reads.
    const r = runVerify({ logs: ALL_THREE });
    expect(r.code).toBe(0);
    expect(r.all).not.toMatch(/BONFIRE_ENGINE_ENABLED.*must be exactly false/);
  });

  it('fails on drift when a service flag no longer matches the baseline', () => {
    const r = runVerify({
      flags: { ...PAUSED_FLAGS, BONFIRE_ENGINE_ENABLED: 'false' },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('service flag BONFIRE_ENGINE_ENABLED=false');
    expect(r.stderr).toContain('approved baseline is true');
  });

  it('treats scraper capability as independent of v1 service availability', () => {
    // BONFIRE_SCRAPER_ENABLED only mounts /scrape/*; it does not affect v1 reads.
    const r = runVerify({
      flags: { ...PAUSED_FLAGS, BONFIRE_SCRAPER_ENABLED: 'false' },
      env: { SERVICE_BASELINE: 'BONFIRE_ENGINE_ENABLED=true BONFIRE_SCRAPER_ENABLED=false' },
      logs: ALL_THREE,
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('BONFIRE_SCRAPER_ENABLED=false matches approved baseline');
  });
});

describe('release verification: scheduler evidence', () => {
  it('fails when one scheduler is missing from the boot', () => {
    const logs = [disabledRecord('ingestion'), disabledRecord('research')].join('\n');
    const r = runVerify({ logs });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('scheduler=freelance');
  });

  it('fails when no evidence exists at all', () => {
    const r = runVerify({ logs: '' });
    expect(r.code).toBe(1);
    for (const s of ['ingestion', 'freelance', 'research']) {
      expect(r.stderr).toContain(`scheduler=${s}`);
    }
  });

  it('rejects a scheduler name without the disabled event — the name alone must not pass', () => {
    const decoys = ['ingestion', 'freelance', 'research']
      .map((s) => JSON.stringify({ level: 'info', message: 'started', scheduler: s }))
      .join('\n');
    const r = runVerify({ logs: decoys });
    expect(r.code).toBe(1);
    for (const s of ['ingestion', 'freelance', 'research']) {
      expect(r.stderr).toContain(`scheduler=${s}`);
    }
  });

  it('rejects the wrong event name even with the right scheduler', () => {
    const wrong = ['ingestion', 'freelance', 'research']
      .map((s) => JSON.stringify({ event: 'scheduler_started', scheduler: s }))
      .join('\n');
    const r = runVerify({ logs: wrong });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('scheduler=ingestion');
  });

  it('rejects the event and the scheduler split across SEPARATE records', () => {
    // The old check grepped for the event anywhere, so one scheduler's record
    // could satisfy all three. Both markers must share a record.
    const split = [
      JSON.stringify({ event: 'ingestion_scheduler_disabled', scheduler: 'ingestion' }),
      JSON.stringify({ level: 'info', scheduler: 'freelance' }),
      JSON.stringify({ level: 'info', scheduler: 'research' }),
    ].join('\n');
    const r = runVerify({ logs: split });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('scheduler=freelance');
    expect(r.stderr).toContain('scheduler=research');
  });

  it('does NOT accept evidence from a previous container boot', () => {
    // Evidence exists, but only under an older --since window.
    const r = runVerify({
      startedAt: STARTED_AT,
      logsBySince: { '2026-10-01T02:58:05.889237933Z': ALL_THREE },
    });
    expect(r.code).toBe(1);
    for (const s of ['ingestion', 'freelance', 'research']) {
      expect(r.stderr).toContain(`scheduler=${s}`);
    }
  });

  it('fails when StartedAt cannot be read, rather than silently skipping', () => {
    const r = runVerify({ startedAt: '', logs: ALL_THREE });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('cannot read StartedAt');
  });
});

describe('release verification: data baselines', () => {
  it('passes when every baseline is unchanged', () => {
    const r = runVerify({
      logs: ALL_THREE,
      env: { BASELINE_PAIRS: 'ingestion_logs:7694:7694 checksum:8dd31f83:8dd31f83 gov_rows:0:0' },
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('ingestion_logs=7694 unchanged');
  });

  it('fails on ingestion count drift', () => {
    const r = runVerify({
      logs: ALL_THREE,
      env: { BASELINE_PAIRS: 'ingestion_logs:7694:7695' },
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('baseline drift: ingestion_logs expected 7694, got 7695');
  });

  it('fails on deadline checksum drift', () => {
    const r = runVerify({
      logs: ALL_THREE,
      env: { BASELINE_PAIRS: 'deadline_checksum:8dd31f83:deadbeef' },
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('baseline drift: deadline_checksum');
  });

  it('fails on gov table row appearing before activation', () => {
    const r = runVerify({
      logs: ALL_THREE,
      env: { BASELINE_PAIRS: 'gov_rows:0:1' },
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('baseline drift: gov_rows expected 0, got 1');
  });
});
