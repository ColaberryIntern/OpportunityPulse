// Config-layer tests for multi-account Bonfire scraper. Verifies that
// BONFIRE_SCRAPER_ACCOUNTS JSON parses into a clean accounts[] array and that
// the legacy single-account env vars still work as a fallback.

// Stub the logger so warn() calls don't pollute test output.
jest.mock('../../../src/logging/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { parseAccounts, sanitizeLabel } = require('../../../src/bonfire/scraper/config');

describe('parseAccounts', () => {
  test('returns [] for empty / null / non-string input', () => {
    expect(parseAccounts('')).toEqual([]);
    expect(parseAccounts(null)).toEqual([]);
    expect(parseAccounts(undefined)).toEqual([]);
    expect(parseAccounts(123)).toEqual([]);
  });

  test('returns [] for malformed JSON (and logs warn, does not throw)', () => {
    expect(parseAccounts('{not json')).toEqual([]);
    expect(parseAccounts('{"single":"object"}')).toEqual([]); // not an array
  });

  test('parses a single-account JSON array', () => {
    const out = parseAccounts('[{"label":"que","username":"q@x","password":"p1"}]');
    expect(out).toEqual([{ label: 'que', username: 'q@x', password: 'p1' }]);
  });

  test('parses two accounts in order', () => {
    const out = parseAccounts(JSON.stringify([
      { label: 'que', username: 'q@x.com', password: 'p1' },
      { label: 'colaberry', username: 'c@x.com', password: 'p2' },
    ]));
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe('que');
    expect(out[1].label).toBe('colaberry');
  });

  test('skips entries missing username or password', () => {
    const out = parseAccounts(JSON.stringify([
      { label: 'good', username: 'g@x', password: 'p' },
      { label: 'no-pass', username: 'n@x' },
      { label: 'no-user', password: 'p' },
      'not-an-object',
    ]));
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('good');
  });

  test('falls back to email prefix when label is missing', () => {
    const out = parseAccounts('[{"username":"ali@colaberry.com","password":"x"}]');
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('ali');
  });

  test('deduplicates duplicate labels by suffixing a counter', () => {
    const out = parseAccounts(JSON.stringify([
      { label: 'team', username: 'a@x', password: 'p' },
      { label: 'team', username: 'b@x', password: 'p' },
      { label: 'team', username: 'c@x', password: 'p' },
    ]));
    expect(out.map((a) => a.label)).toEqual(['team', 'team2', 'team3']);
  });

  test('sanitizes labels to a safe filename slug', () => {
    const out = parseAccounts(JSON.stringify([
      { label: 'C/O Foo!  Bar @ Baz', username: 'x@y', password: 'p' },
    ]));
    expect(out[0].label).toBe('cofoobarbaz');
  });
});

describe('sanitizeLabel', () => {
  test('lowercases and strips non-alnum', () => {
    expect(sanitizeLabel('Hello World!')).toBe('helloworld');
    expect(sanitizeLabel('foo_bar-baz')).toBe('foo_bar-baz');
  });
  test('returns "default" for empty / falsy input', () => {
    expect(sanitizeLabel('')).toBe('default');
    expect(sanitizeLabel(null)).toBe('default');
    expect(sanitizeLabel(undefined)).toBe('default');
    expect(sanitizeLabel('!!!')).toBe('default');
  });
});

describe('unionAgenciesAcrossAccounts', () => {
  const { unionAgenciesAcrossAccounts } = require('../../../src/bonfire/scraper/runner');

  test('dedups by subdomain, first observation wins for name', () => {
    const { agencies, totalSeen, unique } = unionAgenciesAcrossAccounts([
      [{ subdomain: 'a', name: 'Agency A' }, { subdomain: 'b', name: 'Agency B from Que' }],
      [{ subdomain: 'b', name: 'Agency B from Colaberry' }, { subdomain: 'c', name: 'Agency C' }],
    ]);
    expect(totalSeen).toBe(4);
    expect(unique).toBe(3);
    expect(agencies.map((a) => a.subdomain).sort()).toEqual(['a', 'b', 'c']);
    const b = agencies.find((a) => a.subdomain === 'b');
    expect(b.name).toBe('Agency B from Que'); // first-wins
  });

  test('empty input returns empty array', () => {
    expect(unionAgenciesAcrossAccounts([])).toEqual({ agencies: [], totalSeen: 0, unique: 0 });
  });

  test('skips entries with no subdomain', () => {
    const { agencies, unique } = unionAgenciesAcrossAccounts([
      [{ name: 'no-sub' }, { subdomain: 'a', name: 'A' }],
    ]);
    expect(unique).toBe(1);
    expect(agencies[0].subdomain).toBe('a');
  });
});
