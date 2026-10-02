// Integration test for the post-rollout release path.
//
// WHY THIS IS SEPARATE FROM THE UNIT TESTS
// The unit tests hand verify-release.sh a BASELINE_PAIRS string directly. That
// proves the comparison logic works, and proves nothing about whether a release
// ever performs it. It did not: release.yml invoked verify-release.sh with
// BASELINE_PAIRS unset, so every data comparison the unit tests exercised was
// skipped during an actual release. The tests were green and the release
// verified nothing about the data.
//
// This drives post-rollout-verify.sh — the entry point release.yml actually
// calls — with a mocked `docker` that answers both the backend inspections and
// the postgres queries. Collection, pairing and verification all run, so gov_*
// drift has to travel the same route production uses before it fails.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPTS = path.resolve(__dirname, '../../scripts/release');
const ENTRY = path.join(SCRIPTS, 'post-rollout-verify.sh');

const STARTED_AT = '2026-10-01T04:54:47.780796825Z';

const PAUSED_FLAGS = {
  INGESTION_SCHEDULER_ENABLED: 'false',
  BONFIRE_SCRAPER_CRON_ENABLED: 'false',
  BONFIRE_STRATEGIST_CRON_ENABLED: 'false',
  BONFIRE_ENGINE_ENABLED: 'true',
  BONFIRE_SCRAPER_ENABLED: 'true',
};

/** The measurement set collect-baselines.sh produces, in its order. */
const BASE_MEASUREMENTS = {
  ingestion_logs: '7694',
  bonfire_opportunities: '5302',
  close_date_non_null: '5192',
  deadline_checksum: '8dd31f83bfa5420f8f245e701c9f6896',
  gov_canonical_opportunities: '0',
  gov_source_aliases: '0',
  gov_source_snapshots: '0',
  gov_solicitation_families: '0',
  gov_family_members: '0',
};

function disabledRecord(scheduler) {
  return JSON.stringify({
    event: 'ingestion_scheduler_disabled',
    level: 'warn',
    message: 'disabled',
    scheduler,
    service: 'opportunity-pulse',
  });
}
const ALL_THREE = ['ingestion', 'freelance', 'research', 'source_health_agent'].map(disabledRecord).join('\n');

/**
 * What a release declares it expects. Derived from the flags the mocked
 * container reports so the declaration cannot silently drift away from the
 * observed configuration -- which is exactly how release 36868977258 failed: a
 * hardcoded expectation of BONFIRE_SCRAPER_ENABLED=false outlived the scraper
 * capability it described.
 */
const EXPECTED_CONFIG = [
  `BONFIRE_ENGINE_ENABLED=${PAUSED_FLAGS.BONFIRE_ENGINE_ENABLED}`,
  `BONFIRE_SCRAPER_ENABLED=${PAUSED_FLAGS.BONFIRE_SCRAPER_ENABLED}`,
].join(' ');

/**
 * Mock `docker` covering every call the real path makes:
 *   docker exec op-backend  printenv <FLAG>
 *   docker exec op-postgres printenv POSTGRES_USER|POSTGRES_DB
 *   docker exec op-postgres psql ... -c <SQL>
 *   docker inspect -f ... op-backend
 *   docker logs --since ... op-backend
 *
 * Queries are matched on a distinctive fragment of their SQL, so the mock does
 * not need to parse it.
 */
function makeDockerMock({ flags, measurements, logs, queryFails = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relpost-'));

  const flagDir = path.join(dir, 'flags');
  fs.mkdirSync(flagDir);
  for (const [k, v] of Object.entries(flags)) fs.writeFileSync(path.join(flagDir, k), String(v));

  const qDir = path.join(dir, 'queries');
  fs.mkdirSync(qDir);
  // Key each measurement by the table/expression that identifies its query.
  const keyFor = {
    ingestion_logs: 'ingestion_logs',
    bonfire_opportunities: 'count(*) from bonfire_opportunities',
    close_date_non_null: 'count(close_date)',
    deadline_checksum: 'md5',
    gov_canonical_opportunities: 'gov_canonical_opportunities',
    gov_source_aliases: 'gov_source_aliases',
    gov_source_snapshots: 'gov_source_snapshots',
    gov_solicitation_families: 'gov_solicitation_families',
    gov_family_members: 'gov_family_members',
  };
  for (const [label, value] of Object.entries(measurements)) {
    fs.writeFileSync(path.join(qDir, label), String(value));
  }
  fs.writeFileSync(path.join(dir, 'keymap'), JSON.stringify(keyFor));
  fs.writeFileSync(path.join(dir, 'query_fails'), queryFails || '');
  fs.writeFileSync(path.join(dir, 'started_at'), STARTED_AT);
  fs.writeFileSync(path.join(dir, 'boot_logs'), logs);

  const fixtures = dir.split(path.sep).join('/');
  // Ordered longest-first so 'count(*) from bonfire_opportunities' is tested
  // before the bare 'ingestion_logs' style fragments.
  const matchOrder = [
    'close_date_non_null',
    'deadline_checksum',
    'gov_canonical_opportunities',
    'gov_solicitation_families',
    'gov_source_snapshots',
    'gov_source_aliases',
    'gov_family_members',
    'bonfire_opportunities',
    'ingestion_logs',
  ];

  const cases = matchOrder
    .map((label) => {
      const frag = keyFor[label];
      return `      *"${frag}"*)
        if [ "$(cat "$FIX/query_fails")" = "${label}" ]; then exit 1; fi
        if [ -f "$FIX/queries/${label}" ]; then cat "$FIX/queries/${label}"; else printf ''; fi
        ;;`;
    })
    .join('\n');

  const mock = `#!/usr/bin/env bash
FIX="${fixtures}"
case "$1" in
  exec)
    container="\${2:-}"
    if [ "\${3:-}" = "printenv" ]; then
      name="\${4:-}"
      case "$name" in
        POSTGRES_USER) printf 'opportunity_pulse'; exit 0 ;;
        POSTGRES_DB)   printf 'opportunity_pulse'; exit 0 ;;
      esac
      if [ -f "$FIX/flags/$name" ]; then cat "$FIX/flags/$name"; exit 0; else exit 1; fi
    fi
    # psql invocation: the SQL is the final argument.
    sql="\${!#}"
    case "$sql" in
${cases}
      *) printf '' ;;
    esac
    ;;
  inspect)
    fmt="\${3:-}"
    case "$fmt" in
      *StartedAt*) cat "$FIX/started_at" ;;
      *Id*)        printf '%s' 'abcdef0123456789' ;;
      *)           printf '' ;;
    esac
    ;;
  logs)
    cat "$FIX/boot_logs"
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

/**
 * Run the REAL production path: collect before, roll out, collect after,
 * pair, verify. `before` and `after` are measurement maps.
 */
function runPostRollout({
  before,
  after,
  logs = ALL_THREE,
  flags = PAUSED_FLAGS,
  queryFails = null,
  expectedConfig = EXPECTED_CONFIG,
}) {
  // Pre-rollout collection, through the same script release.yml runs.
  const pre = makeDockerMock({ flags, measurements: before, logs, queryFails: null });
  const beforeFile = path.join(pre.dir, 'before.txt');
  const collect = spawnSync('bash', [path.join(SCRIPTS, 'collect-baselines.sh')], {
    env: { ...process.env, PATH: `${pre.bin}${path.delimiter}${process.env.PATH}` },
    encoding: 'utf8',
  });
  if (collect.status === 0) fs.writeFileSync(beforeFile, collect.stdout);

  // Post-rollout: a fresh mock standing in for the state after the release.
  const post = makeDockerMock({ flags, measurements: after, logs, queryFails });
  const res = spawnSync('bash', [ENTRY], {
    env: {
      ...process.env,
      PATH: `${post.bin}${path.delimiter}${process.env.PATH}`,
      CONTAINER: 'op-backend',
      // Required, with no default: a release states its expectation.
      EXPECTED_CONFIG: expectedConfig,
      BASELINE_BEFORE: beforeFile,
      BASELINE_AFTER: path.join(post.dir, 'after.txt'),
    },
    encoding: 'utf8',
  });

  return {
    collectCode: collect.status,
    collectOut: collect.stdout || '',
    collectErr: collect.stderr || '',
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    all: `${res.stdout || ''}\n${res.stderr || ''}`,
  };
}

describe('collect-baselines.sh', () => {
  it('measures all nine labels including every gov_* table', () => {
    const r = runPostRollout({ before: BASE_MEASUREMENTS, after: BASE_MEASUREMENTS });
    expect(r.collectCode).toBe(0);
    for (const label of Object.keys(BASE_MEASUREMENTS)) {
      expect(r.collectOut).toContain(`${label}=`);
    }
    expect(r.collectOut).toContain('gov_canonical_opportunities=');
    expect(r.collectOut).toContain('gov_source_aliases=');
    expect(r.collectOut).toContain('gov_source_snapshots=');
    expect(r.collectOut).toContain('gov_solicitation_families=');
    expect(r.collectOut).toContain('gov_family_members=');
  });

  it('fails when a measurement comes back empty', () => {
    const missing = { ...BASE_MEASUREMENTS, gov_source_snapshots: '' };
    const r = runPostRollout({ before: missing, after: missing });
    expect(r.collectCode).toBe(1);
    expect(r.collectErr).toContain('empty measurement for gov_source_snapshots');
  });
});

describe('the production path performs the data comparisons', () => {
  it('passes end to end when nothing changed', () => {
    const r = runPostRollout({ before: BASE_MEASUREMENTS, after: BASE_MEASUREMENTS });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('RELEASE VERIFICATION PASSED');
    // Proof the comparisons ran rather than being skipped.
    expect(r.stdout).toContain('measured data stability');
    expect(r.stdout).toContain('gov_source_snapshots=0 unchanged');
  });

  it.each([
    ['gov_canonical_opportunities'],
    ['gov_source_aliases'],
    ['gov_source_snapshots'],
    ['gov_solicitation_families'],
    ['gov_family_members'],
  ])('FAILS through the production path when %s drifts', (label) => {
    const after = { ...BASE_MEASUREMENTS, [label]: '1' };
    const r = runPostRollout({ before: BASE_MEASUREMENTS, after });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`data drift: ${label} was 0, now 1`);
  });

  it('fails when ingestion_logs grows across the rollout', () => {
    const after = { ...BASE_MEASUREMENTS, ingestion_logs: '7695' };
    const r = runPostRollout({ before: BASE_MEASUREMENTS, after });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('data drift: ingestion_logs was 7694, now 7695');
  });

  it('fails when a close_date value changes', () => {
    const after = { ...BASE_MEASUREMENTS, deadline_checksum: 'ffffffffffffffffffffffffffffffff' };
    const r = runPostRollout({ before: BASE_MEASUREMENTS, after });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('data drift: deadline_checksum');
  });

  it('compares actual values rather than assuming gov tables are zero', () => {
    // Stable non-zero counts must pass; a hardcoded zero check would fail here
    // the moment Phase 2 is activated.
    const activated = { ...BASE_MEASUREMENTS, gov_canonical_opportunities: '12', gov_source_snapshots: '48' };
    const r = runPostRollout({ before: activated, after: activated });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('gov_canonical_opportunities=12 unchanged');
  });

  it('fails when a post-rollout query errors, rather than comparing nothing', () => {
    const r = runPostRollout({
      before: BASE_MEASUREMENTS,
      after: BASE_MEASUREMENTS,
      queryFails: 'gov_source_snapshots',
    });
    expect(r.code).toBe(1);
    expect(r.all).toMatch(/BASELINE COLLECTION FAILED|could not measure state after rollout/);
  });

  it('refuses to run without pre-rollout measurements', () => {
    const post = makeDockerMock({ flags: PAUSED_FLAGS, measurements: BASE_MEASUREMENTS, logs: ALL_THREE });
    const res = spawnSync('bash', [ENTRY], {
      env: {
        ...process.env,
        PATH: `${post.bin}${path.delimiter}${process.env.PATH}`,
        CONTAINER: 'op-backend',
        // Required, with no default: a release states its expectation.
        EXPECTED_CONFIG,
        BASELINE_BEFORE: '',
      },
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('BASELINE_BEFORE is not set');
  });

  it.each([['before'], ['after']])(
    'fails when the %s measurements contain a duplicate label',
    (side) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reldup-'));
      const clean = Object.entries(BASE_MEASUREMENTS)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      // A duplicate on the AFTER side used to be dropped by a first-match
      // lookup, so a second differing value was never compared and the release
      // passed. A duplicate on the BEFORE side produced two pairs for one
      // label, so the outcome depended on which copy was read.
      const dup = `${clean}\ningestion_logs=9999`;

      const beforeFile = path.join(dir, 'before.txt');
      const afterFile = path.join(dir, 'after.txt');
      fs.writeFileSync(beforeFile, side === 'before' ? dup : clean);
      fs.writeFileSync(afterFile, side === 'after' ? dup : clean);

      const pair = spawnSync(
        'bash',
        [path.join(SCRIPTS, 'pair-baselines.sh'), beforeFile, afterFile],
        { encoding: 'utf8' },
      );
      expect(pair.status).toBe(1);
      expect(pair.stderr).toContain('duplicate label(s)');
      expect(pair.stderr).toContain('ingestion_logs');
    },
  );

  it('fails with an interpreter-specific message when python3 is absent', () => {
    // Without the explicit guard, a missing interpreter made the pipeline exit
    // non-zero and the failure read as "scheduler evidence incomplete" — a check
    // describing something other than what actually went wrong.
    //
    // PYTHON_BIN is overridden rather than stripping PATH: removing directories
    // from PATH also removes bash and coreutils, so the script could not run at
    // all and the test proved nothing.
    const { bin } = makeDockerMock({
      flags: PAUSED_FLAGS,
      measurements: BASE_MEASUREMENTS,
      logs: ALL_THREE,
    });

    const res = spawnSync('bash', [path.join(SCRIPTS, 'verify-release.sh')], {
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        CONTAINER: 'op-backend',
        // Required, with no default: a release states its expectation.
        EXPECTED_CONFIG,
        BASELINE_PAIRS: 'ingestion_logs:1:1',
        PYTHON_BIN: 'python3-does-not-exist-here',
      },
      encoding: 'utf8',
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('python3 not found on this host');
    expect(res.stderr).toContain('python3-does-not-exist-here');
    // The misleading message must NOT be what surfaces.
    expect(res.stderr).not.toContain('scheduler evidence incomplete');
  });

  it('uses the real interpreter when PYTHON_BIN is not overridden', () => {
    const { bin } = makeDockerMock({
      flags: PAUSED_FLAGS,
      measurements: BASE_MEASUREMENTS,
      logs: ALL_THREE,
    });
    const res = spawnSync('bash', [path.join(SCRIPTS, 'verify-release.sh')], {
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        CONTAINER: 'op-backend',
        // Required, with no default: a release states its expectation.
        EXPECTED_CONFIG,
        BASELINE_PAIRS: 'ingestion_logs:1:1',
      },
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('scheduler=ingestion reported disabled');
  });

  it('fails when a label is measured before but missing after', () => {
    const { bin: preBin, dir: preDir } = makeDockerMock({
      flags: PAUSED_FLAGS,
      measurements: BASE_MEASUREMENTS,
      logs: ALL_THREE,
    });
    const beforeFile = path.join(preDir, 'before.txt');
    const collect = spawnSync('bash', [path.join(SCRIPTS, 'collect-baselines.sh')], {
      env: { ...process.env, PATH: `${preBin}${path.delimiter}${process.env.PATH}` },
      encoding: 'utf8',
    });
    fs.writeFileSync(beforeFile, collect.stdout);

    // An after-file that lost a label entirely.
    const afterFile = path.join(preDir, 'after.txt');
    fs.writeFileSync(
      afterFile,
      collect.stdout
        .split('\n')
        .filter((l) => !l.startsWith('gov_family_members='))
        .join('\n'),
    );

    const pair = spawnSync('bash', [path.join(SCRIPTS, 'pair-baselines.sh'), beforeFile, afterFile], {
      encoding: 'utf8',
    });
    expect(pair.status).toBe(1);
    expect(pair.stderr).toContain("label 'gov_family_members' measured before rollout but missing after");
  });
});

describe('the production path validates the DECLARED expected configuration', () => {
  // Release 36868977258 failed here. verify-release.sh carried a hardcoded
  // expectation of BONFIRE_SCRAPER_ENABLED=false; the scraper capability was
  // true, so a correct configuration was reported as drift and the release
  // stopped. The fix is an expectation the release states and the script
  // validates. These tests drive post-rollout-verify.sh — the entry point
  // release.yml calls — because an expectation checked only in the unit tests
  // is the same mistake this file was written about.

  it('reports drift when the declared expectation does not match the container', () => {
    const r = runPostRollout({
      before: BASE_MEASUREMENTS,
      after: BASE_MEASUREMENTS,
      // Exactly the stale declaration that stopped release 36868977258.
      expectedConfig: 'BONFIRE_ENGINE_ENABLED=true BONFIRE_SCRAPER_ENABLED=false',
    });
    expect(r.code).toBe(1);
    expect(r.all).toContain('configuration drift: BONFIRE_SCRAPER_ENABLED=true, declared expectation is false');
    // Stable data must not mask a drifted declaration.
    expect(r.all).toContain('BONFIRE_ENGINE_ENABLED=true matches the declared expectation');
  });

  it('refuses to verify when the release declares no expectation at all', () => {
    const r = runPostRollout({
      before: BASE_MEASUREMENTS,
      after: BASE_MEASUREMENTS,
      expectedConfig: '',
    });
    expect(r.code).toBe(1);
    expect(r.all).toContain('no expected configuration declared');
    // No silent fallback: nothing may be reported as matching an expectation
    // that was never stated.
    expect(r.all).not.toContain('matches the declared expectation');
  });

  it('rejects a malformed declaration instead of matching nothing and passing', () => {
    const r = runPostRollout({
      before: BASE_MEASUREMENTS,
      after: BASE_MEASUREMENTS,
      expectedConfig: 'BONFIRE_ENGINE_ENABLED',
    });
    expect(r.code).toBe(1);
    expect(r.all).toContain("malformed expected configuration entry 'BONFIRE_ENGINE_ENABLED'");
  });

  it('rejects a declared value that is neither true nor false', () => {
    const r = runPostRollout({
      before: BASE_MEASUREMENTS,
      after: BASE_MEASUREMENTS,
      expectedConfig: 'BONFIRE_ENGINE_ENABLED=enabled',
    });
    expect(r.code).toBe(1);
    expect(r.all).toContain('value must be exactly true or false');
  });

  it('passes when the declaration matches what the container reports', () => {
    const r = runPostRollout({ before: BASE_MEASUREMENTS, after: BASE_MEASUREMENTS });
    expect(r.code).toBe(0);
    expect(r.all).toContain('BONFIRE_SCRAPER_ENABLED=true matches the declared expectation');
  });
});
