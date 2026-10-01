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
const ALL_THREE = ['ingestion', 'freelance', 'research'].map(disabledRecord).join('\n');

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
function runPostRollout({ before, after, logs = ALL_THREE, flags = PAUSED_FLAGS, queryFails = null }) {
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
        BASELINE_BEFORE: '',
      },
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('BASELINE_BEFORE is not set');
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
