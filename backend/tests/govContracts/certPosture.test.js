const {
  namedCerts, postureOf, applyCertPosture, DEFAULT_POSTURE,
} = require('../../src/govContracts/certPosture');

// A posture fixture so tests don't depend on process.env. SOC 2 = acquiring (default),
// everything else not listed = not_pursuing.
const ACQUIRING_SOC2 = { 'SOC 2': { status: 'acquiring', eta: 'Type I in progress' } };
const HELD_SOC2 = { 'SOC 2': { status: 'held' } };

const cw = (over = {}) => ({
  status: 'no_bid', disqualifier: 'CERT_WALL', label: 'No-bid', evidence: null,
  lane: null, unblocked_by: null, auto: false, ...over,
});

describe('namedCerts', () => {
  test('extracts canonical cert names from free text', () => {
    expect(namedCerts('vendor must be TX-RAMP and SOC2 certified')).toEqual(
      expect.arrayContaining(['TX-RAMP', 'SOC 2']),
    );
    expect(namedCerts('No-bid: SOC 2 (Salt Lake City)')).toEqual(['SOC 2']);
    expect(namedCerts('Harris USRA + SOC 2 security controls')).toEqual(
      expect.arrayContaining(['SOC 2', 'USRA (Harris County)']),
    );
  });
  test('returns [] when no cert is named', () => {
    expect(namedCerts('install the bleachers on site')).toEqual([]);
    expect(namedCerts('')).toEqual([]);
  });
});

describe('postureOf', () => {
  test('SOC 2 is acquiring by default; unknown certs are not_pursuing', () => {
    expect(DEFAULT_POSTURE['SOC 2'].status).toBe('acquiring');
    expect(postureOf('SOC 2', ACQUIRING_SOC2).status).toBe('acquiring');
    expect(postureOf('TX-RAMP', ACQUIRING_SOC2).status).toBe('not_pursuing');
  });
});

describe('applyCertPosture', () => {
  test('SOC-2-only no_bid becomes a conditional watchlist row', () => {
    const v = applyCertPosture(cw({ label: 'No-bid: SOC 2 (Salt Lake City)' }), ACQUIRING_SOC2);
    expect(v.status).toBe('conditional');
    expect(v.cert_posture).toBe('acquiring');
    expect(v.unblocked_by).toMatch(/SOC 2/);
    expect(v.lane).toBe('services');
    expect(v.disqualifier).toBe('CERT_WALL'); // still a cert gate — kept for the cert-ROI report
  });

  test('a wall naming a not-pursued cert (TX-RAMP) stays no_bid', () => {
    const v = applyCertPosture(cw({ label: 'No-bid: TX-RAMP + SOC 2 (TDHCA)' }), ACQUIRING_SOC2);
    expect(v.status).toBe('no_bid');
    expect(v.cert_posture).toBeUndefined();
  });

  test('SOC 2 + USRA stays no_bid (USRA not pursued)', () => {
    const v = applyCertPosture(cw({ label: 'No-bid: SOC 2 + USRA (Harris)' }), ACQUIRING_SOC2);
    expect(v.status).toBe('no_bid');
  });

  test('uses the verbatim evidence quote when present', () => {
    const v = applyCertPosture(
      cw({ label: 'security cert required', evidence: 'Vendor must hold a current SOC 2 Type II report prior to award.' }),
      ACQUIRING_SOC2,
    );
    expect(v.status).toBe('conditional');
  });

  test('a CERT_WALL naming no specific cert is left untouched (unattributable)', () => {
    const v = applyCertPosture(cw({ label: 'security certification required' }), ACQUIRING_SOC2);
    expect(v.status).toBe('no_bid');
  });

  test('only no_bid is rescued — a tentative needs_review auto-flag is NOT promoted', () => {
    const v = applyCertPosture(
      cw({ status: 'needs_review', auto: true, label: 'Likely no-bid: cert (SOC 2)' }),
      ACQUIRING_SOC2,
    );
    expect(v.status).toBe('needs_review');
  });

  test('a non-CERT_WALL no_bid is untouched', () => {
    const v = applyCertPosture(cw({ disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: SOC 2 mentioned but domain miss' }), ACQUIRING_SOC2);
    expect(v.status).toBe('no_bid');
  });

  test('when the cert is already HELD, the wall clears to needs_review for a re-vet', () => {
    const v = applyCertPosture(cw({ label: 'No-bid: SOC 2 (Salt Lake City)' }), HELD_SOC2);
    expect(v.status).toBe('needs_review');
    expect(v.cert_posture).toBe('held');
  });

  test('null verdict passes through (autoFlag returned nothing)', () => {
    expect(applyCertPosture(null, ACQUIRING_SOC2)).toBeNull();
  });
});
