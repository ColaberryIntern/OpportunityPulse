const {
  credentialsFromVerdict,
  aggregateCertRoi,
  isBlocked,
  isVerified,
  verdictText,
} = require('../../src/scripts/lib/certRoi');

describe('certRoi pure logic', () => {
  describe('isBlocked', () => {
    test('bid / null / missing are not blocked', () => {
      expect(isBlocked({ status: 'bid' })).toBe(false);
      expect(isBlocked(null)).toBe(false);
      expect(isBlocked(undefined)).toBe(false);
    });
    test('no_bid, conditional, needs_review are blocked', () => {
      expect(isBlocked({ status: 'no_bid' })).toBe(true);
      expect(isBlocked({ status: 'conditional' })).toBe(true);
      expect(isBlocked({ status: 'needs_review' })).toBe(true);
    });
  });

  describe('isVerified', () => {
    test('auto:false is verified; auto:true / missing is not', () => {
      expect(isVerified({ auto: false })).toBe(true);
      expect(isVerified({ auto: true })).toBe(false);
      expect(isVerified({})).toBe(false);
      expect(isVerified(null)).toBe(false);
    });
  });

  describe('credentialsFromVerdict', () => {
    test('extracts a single named cert from evidence', () => {
      const v = { disqualifier: 'CERT_WALL', label: 'No-bid: TX-RAMP required', evidence: 'Vendor must hold TX-RAMP certification at submission.', auto: false };
      expect(credentialsFromVerdict(v)).toEqual(['TX-RAMP']);
    });
    test('extracts multiple certs when both are named in evidence', () => {
      const v = { disqualifier: 'CERT_WALL', label: 'No-bid: TX-RAMP + SOC 2 (TDHCA)', evidence: 'Requires SOC 2 Type II and TX-RAMP.', auto: false };
      const out = credentialsFromVerdict(v);
      expect(out).toContain('TX-RAMP');
      expect(out).toContain('SOC 2');
    });
    test('a verified verdict with no evidence reads certs from its specific label', () => {
      const v = { disqualifier: 'CERT_WALL', label: 'No-bid: TX-RAMP + SOC 2 (TDHCA)', evidence: null, auto: false };
      const out = credentialsFromVerdict(v);
      expect(out).toContain('TX-RAMP');
      expect(out).toContain('SOC 2');
    });
    test('CRITICAL: a heuristic flag does NOT credit certs from the generic multi-cert label', () => {
      // This is the real bug the prod run exposed: the auto-flag label literally
      // lists all four certs, so a single agency-name guess must not count as
      // TX-RAMP AND SOC 2 AND CJIS AND FedRAMP.
      const v = { disqualifier: 'CERT_WALL', label: 'Likely no-bid: Security cert required at submission (TX-RAMP / SOC 2 / CJIS / FedRAMP)', evidence: null, auto: true };
      expect(credentialsFromVerdict(v)).toEqual(['CERT_WALL (heuristic, unverified)']);
    });
    test('verified CERT_WALL with no named cert falls back to unnamed bucket', () => {
      const v = { disqualifier: 'CERT_WALL', label: 'No-bid: security cert required', evidence: null, auto: false };
      expect(credentialsFromVerdict(v)).toEqual(['CERT_WALL (unnamed)']);
    });
    test('set-aside disqualifier maps to the set-aside credential from evidence', () => {
      const v = { disqualifier: 'SET_ASIDE_INELIGIBLE', label: 'No-bid: reserved 8(a)', evidence: 'This procurement is set aside for 8(a) firms.', auto: false };
      expect(credentialsFromVerdict(v)).toEqual(['8(a)']);
    });
    test('non-credential disqualifier yields no credential', () => {
      const v = { disqualifier: 'DOMAIN_MISMATCH', label: 'No-bid: HVAC', evidence: 'Furnish and install HVAC.', auto: false };
      expect(credentialsFromVerdict(v)).toEqual([]);
    });
  });

  describe('aggregateCertRoi', () => {
    const rows = [
      { id: 'a', title: 'Housing software', valueUsd: 1000000, source: 'bonfire', verdict: { status: 'no_bid', disqualifier: 'CERT_WALL', label: 'TX-RAMP required', evidence: 'must hold TX-RAMP', confidence: 1, auto: false } },
      { id: 'b', title: 'Reporting system', valueUsd: 500000, source: 'bonfire', verdict: { status: 'no_bid', disqualifier: 'CERT_WALL', label: 'SOC 2 + TX-RAMP', evidence: 'SOC 2 and TX-RAMP', confidence: 0.9, auto: false } },
      { id: 'c', title: 'Building automation', valueUsd: 2000000, source: 'bonfire', verdict: { status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH', label: 'HVAC', evidence: 'HVAC', auto: false } },
      { id: 'd', title: 'A clean bid', valueUsd: 300000, source: 'sam_gov', verdict: { status: 'bid', disqualifier: null, label: 'cleared', auto: false } },
      { id: 'e', title: 'Set-aside job', valueUsd: null, source: 'sam_gov', verdict: { status: 'no_bid', disqualifier: 'SET_ASIDE_INELIGIBLE', label: 'WOSB only', evidence: 'set aside for WOSB', auto: false } },
      // A cheap pre-download heuristic flag (agency name guess) — must NOT be
      // credited to four certs, and must NOT count toward verified dollars.
      { id: 'f', title: 'TDCJ HVAC heuristic', valueUsd: 9000000, source: 'bonfire', verdict: { status: 'needs_review', disqualifier: 'CERT_WALL', label: 'Likely no-bid: Security cert required at submission (TX-RAMP / SOC 2 / CJIS / FedRAMP)', evidence: null, auto: true } },
    ];

    test('ranks credentials by VERIFIED dollars and overlaps multi-cert opps', () => {
      const { credentials } = aggregateCertRoi(rows);
      const txramp = credentials.find((c) => c.cert === 'TX-RAMP');
      const soc2 = credentials.find((c) => c.cert === 'SOC 2');
      // TX-RAMP touches opp a ($1M) + opp b ($500k) = $1.5M verified; SOC 2 only opp b.
      expect(txramp.verifiedValueUsd).toBe(1500000);
      expect(txramp.verifiedCount).toBe(2);
      expect(soc2.verifiedValueUsd).toBe(500000);
      // TX-RAMP outranks SOC 2 on verified dollars.
      expect(credentials[0].cert).toBe('TX-RAMP');
    });

    test('CRITICAL: heuristic flag lands in its own bucket, not the four named certs', () => {
      const { credentials } = aggregateCertRoi(rows);
      const heur = credentials.find((c) => c.cert === 'CERT_WALL (heuristic, unverified)');
      expect(heur.blockedValueUsd).toBe(9000000);
      expect(heur.verifiedValueUsd).toBe(0);
      // the $9M heuristic opp did NOT inflate any real cert bucket.
      expect(credentials.find((c) => c.cert === 'TX-RAMP').blockedValueUsd).toBe(1500000);
      expect(credentials.find((c) => c.cert === 'CJIS')).toBeUndefined();
      expect(credentials.find((c) => c.cert === 'FedRAMP')).toBeUndefined();
    });

    test('excludes clean bids and excludes non-credential disqualifiers from credential buckets', () => {
      const { credentials, disqualifiers } = aggregateCertRoi(rows);
      expect(credentials.find((c) => c.cert === 'HVAC')).toBeUndefined();
      expect(disqualifiers.find((d) => d.disqualifier === 'DOMAIN_MISMATCH').blockedValueUsd).toBe(2000000);
      expect(disqualifiers.find((d) => d.disqualifier === null)).toBeUndefined();
    });

    test('totals: verified dollars exclude heuristic flags; unique total includes them', () => {
      const { totals } = aggregateCertRoi(rows);
      // blocked = a+b+c+e+f (d is a clean bid). e null -> 0.
      expect(totals.totalBlockedCount).toBe(5);
      expect(totals.totalBlockedValueUsd).toBe(12500000);
      // credential-addressable (all) = a+b+e+f counted once each = 1.5M + 0 + 9M = 10.5M.
      expect(totals.credentialAddressableCount).toBe(4);
      expect(totals.credentialAddressableValueUsd).toBe(10500000);
      // VERIFIED credential-addressable = a+b+e only (f is heuristic) = 1.5M.
      expect(totals.credentialAddressableVerifiedCount).toBe(3);
      expect(totals.credentialAddressableVerifiedValueUsd).toBe(1500000);
    });

    test('handles null/undefined value as zero and empty input', () => {
      expect(aggregateCertRoi([]).totals.totalBlockedValueUsd).toBe(0);
      const { credentials } = aggregateCertRoi([{ id: 'x', title: 't', valueUsd: null, source: 's', verdict: { status: 'no_bid', disqualifier: 'CERT_WALL', evidence: 'CJIS required', auto: false } }]);
      expect(credentials[0].cert).toBe('CJIS');
      expect(credentials[0].blockedValueUsd).toBe(0);
      expect(credentials[0].knownValueCount).toBe(0);
    });
  });

  describe('verdictText', () => {
    test('joins label, evidence, disqualifier and tolerates missing fields', () => {
      expect(verdictText({ label: 'L', evidence: 'E', disqualifier: 'CERT_WALL' })).toBe('L E CERT_WALL');
      expect(verdictText({ evidence: 'only evidence' })).toBe('only evidence');
      expect(verdictText(null)).toBe('');
    });
  });

  // Change C — a LICENSE_GATE (professional license, teaming-only) is blocked pipeline but
  // is NOT credential-addressable: no cert purchase clears it, so it must not inflate the
  // cert-ROI "addressable" number.
  describe('LICENSE_GATE is reported but never credential-addressable', () => {
    test('a PE/appraiser license gate counts as blocked but not addressable', () => {
      const rows = [
        { id: 'pe', title: 'Frisco SS4A', valueUsd: 2000000, source: 'sam_gov', verdict: { status: 'no_bid', disqualifier: 'LICENSE_GATE', label: 'Texas PE required', evidence: 'sealed by a licensed Professional Engineer', auto: false } },
        { id: 'soc', title: 'Agenda', valueUsd: 1000000, source: 'bonfire', verdict: { status: 'no_bid', disqualifier: 'CERT_WALL', label: 'SOC 2', evidence: 'must hold SOC 2', auto: false } },
      ];
      const { totals, disqualifiers, credentials } = aggregateCertRoi(rows);
      expect(totals.totalBlockedValueUsd).toBe(3000000); // both blocked
      expect(totals.credentialAddressableValueUsd).toBe(1000000); // ONLY the SOC 2 row
      expect(disqualifiers.some((d) => d.disqualifier === 'LICENSE_GATE')).toBe(true); // shown for context
      expect(credentials.some((c) => /PE|engineer|license/i.test(c.cert))).toBe(false); // no license bucket
    });
  });
});
