// Pure logic for the cert-ROI report (Strategic Expansion Plan §4, P0).
//
// Question it answers: of the winnable pipeline OP has already deep-vetted as
// dead, HOW MANY DOLLARS are blocked by a CREDENTIAL we could actually acquire
// (a security certification or a small-business set-aside) — broken down per
// credential, so cert acquisition becomes an ROI decision ("getting TX-RAMP
// unblocks $X") instead of a guess.
//
// No I/O here — the report script feeds it normalized rows so this stays
// unit-testable. See backend/tests/scripts/certRoi.test.js.

// Security certifications a vendor can acquire to clear a CERT_WALL. Ordered
// most-specific first; matched (case-insensitive) against the verdict text
// (label + evidence + disqualifier). Mirrors the cert vocabulary used by the
// deep-vet gate-check in bonfire/documentDeepVet.service.js.
const CERT_PATTERNS = [
  { cert: 'TX-RAMP', re: /tx-?ramp/i },
  { cert: 'StateRAMP', re: /stateramp|govramp/i },
  { cert: 'FedRAMP', re: /fedramp/i },
  { cert: 'SOC 2', re: /soc ?2/i },
  { cert: 'CJIS', re: /\bcjis\b|criminal justice/i },
  { cert: 'FIPS 140', re: /\bfips\b/i },
  { cert: 'HECVAT', re: /hecvat/i },
  { cert: 'ISO 27001', re: /iso ?27001/i },
  { cert: 'USRA (Harris County)', re: /\busra\b/i },
];

// Small-business set-asides a firm can register/certify for to clear a
// SET_ASIDE_INELIGIBLE gate.
const SET_ASIDE_PATTERNS = [
  { cert: '8(a)', re: /8\s*\(\s*a\s*\)|\b8a\b/i },
  { cert: 'WOSB / EDWOSB', re: /\bwosb\b|edwosb/i },
  { cert: 'HUBZone', re: /hubzone/i },
  { cert: 'SDVOSB', re: /sdvosb/i },
];

// Only these disqualifiers are clearable by acquiring a credential. Everything
// else (DOMAIN_MISMATCH, PHYSICAL_INSTALL, SCALE_WALL, LICENSE_GATE, ...) is
// reported for context but a cert cannot fix it. LICENSE_GATE in particular is a
// professional license (PE / appraiser) reachable only by teaming, never by spend —
// it must NOT inflate the "credential-addressable" number.
const CREDENTIAL_DISQUALIFIERS = new Set(['CERT_WALL', 'SET_ASIDE_INELIGIBLE']);

// A verdict is "verified" when it came from reading the actual documents (the
// document deep-vet, scorer 'document_deep_vet') or a human/known result —
// both stamp auto:false. auto:true verdicts are cheap pre-download heuristics
// that guess the gate from the title/agency name (e.g. "criminal justice" in a
// TDCJ correctional-HVAC title), and are NOT trustworthy for cert attribution.
function isVerified(v) {
  return !!v && v.auto === false;
}

// The only trustworthy place a specific credential is named is the verbatim
// EVIDENCE quote, or — for a verified verdict — its specific label. The generic
// auto-flag label lists ALL FOUR certs ("TX-RAMP / SOC 2 / CJIS / FedRAMP"), so
// matching cert names from a heuristic label would wrongly credit a single
// agency-name guess to every cert at once. Heuristic verdicts with no quote get
// no specific credential.
function credentialTextSource(v) {
  if (!v) return '';
  if (v.evidence) return v.evidence;
  if (isVerified(v)) return [v.label, v.disqualifier].filter(Boolean).join(' ');
  return '';
}

function verdictText(v) {
  if (!v) return '';
  return [v.label, v.evidence, v.disqualifier].filter(Boolean).join(' ');
}

// A verdict counts as "blocked pipeline" if it is anything other than a clean
// bid. needs_review is included because the deep-vet downgrades a probable but
// unproven cert wall to needs_review (see validateVerdictEvidence) — those are
// still cert-suspect dollars worth surfacing.
function isBlocked(v) {
  return !!v && ['no_bid', 'conditional', 'needs_review'].includes(v.status);
}

// Which acquirable credentials does this verdict implicate? May return more
// than one (e.g. "TX-RAMP + SOC 2"). Names come only from a trustworthy source
// (see credentialTextSource). Credential-shaped gates with no named credential
// fall back to an "(unnamed)" bucket (verified) or "(heuristic, unverified)"
// (a pre-download agency-name guess we should discount).
function credentialsFromVerdict(v) {
  if (!v) return [];
  const text = credentialTextSource(v);
  const hits = [];
  if (text) {
    for (const p of [...CERT_PATTERNS, ...SET_ASIDE_PATTERNS]) {
      if (p.re.test(text)) hits.push(p.cert);
    }
  }
  if (hits.length) return hits;
  const trusted = isVerified(v) || !!(v && v.evidence);
  if (v.disqualifier === 'CERT_WALL') return [trusted ? 'CERT_WALL (unnamed)' : 'CERT_WALL (heuristic, unverified)'];
  if (v.disqualifier === 'SET_ASIDE_INELIGIBLE') return [trusted ? 'Set-aside (unspecified)' : 'Set-aside (heuristic, unverified)'];
  return [];
}

// rows: [{ id, title, valueUsd (number|null), source, verdict }]
// Returns ranked credential buckets + a full disqualifier breakdown + totals.
// Every dollar figure is split verified (document-/human-confirmed) vs total
// (incl. cheap heuristic flags) so the ROI decision rests on the honest number.
function aggregateCertRoi(rows = []) {
  const byCredential = new Map();
  const byDisqualifier = new Map();
  let totalBlockedValueUsd = 0;
  let totalBlockedCount = 0;
  let credentialAddressableValueUsd = 0; // unique opp dollars, no double-count
  let credentialAddressableCount = 0;
  let credentialAddressableVerifiedValueUsd = 0;
  let credentialAddressableVerifiedCount = 0;

  for (const r of rows) {
    const v = r.verdict;
    if (!isBlocked(v)) continue;
    const value = Number(r.valueUsd) || 0;
    const verified = isVerified(v);
    totalBlockedCount += 1;
    totalBlockedValueUsd += value;

    const code = (v && v.disqualifier) || 'UNSPECIFIED';
    const dq = byDisqualifier.get(code) || { disqualifier: code, count: 0, blockedValueUsd: 0, verifiedValueUsd: 0 };
    dq.count += 1;
    dq.blockedValueUsd += value;
    if (verified) dq.verifiedValueUsd += value;
    byDisqualifier.set(code, dq);

    if (!CREDENTIAL_DISQUALIFIERS.has(code)) continue;
    credentialAddressableValueUsd += value; // each opp once
    credentialAddressableCount += 1;
    if (verified) {
      credentialAddressableVerifiedValueUsd += value;
      credentialAddressableVerifiedCount += 1;
    }

    // A single opp can map to several credentials; its value is added to each
    // credential bucket so each bucket reads as "dollars this credential would
    // help unblock" (buckets intentionally overlap; the unique total above does not).
    for (const cert of credentialsFromVerdict(v)) {
      const e = byCredential.get(cert)
        || { cert, blockedValueUsd: 0, verifiedValueUsd: 0, count: 0, verifiedCount: 0, knownValueCount: 0, opps: [] };
      e.count += 1;
      e.blockedValueUsd += value;
      if (verified) { e.verifiedValueUsd += value; e.verifiedCount += 1; }
      if (value > 0) e.knownValueCount += 1;
      e.opps.push({
        id: r.id,
        title: r.title,
        valueUsd: value,
        source: r.source,
        status: v.status,
        verified,
        confidence: v.confidence != null ? v.confidence : null,
        evidence: (v.evidence || '').slice(0, 240) || null,
      });
      byCredential.set(cert, e);
    }
  }

  // Rank by the trustworthy (verified) dollars first; total is the tiebreak.
  const byVal = (a, b) => b.verifiedValueUsd - a.verifiedValueUsd
    || b.blockedValueUsd - a.blockedValueUsd || b.count - a.count;
  const credentials = [...byCredential.values()].sort(byVal);
  for (const c of credentials) {
    c.opps.sort((a, b) => (b.verified - a.verified) || (b.valueUsd - a.valueUsd));
  }
  const disqualifiers = [...byDisqualifier.values()]
    .sort((a, b) => b.blockedValueUsd - a.blockedValueUsd || b.count - a.count);

  return {
    credentials,
    disqualifiers,
    totals: {
      totalBlockedValueUsd,
      totalBlockedCount,
      credentialAddressableValueUsd,
      credentialAddressableCount,
      credentialAddressableVerifiedValueUsd,
      credentialAddressableVerifiedCount,
    },
  };
}

module.exports = {
  CERT_PATTERNS,
  SET_ASIDE_PATTERNS,
  CREDENTIAL_DISQUALIFIERS,
  verdictText,
  isBlocked,
  isVerified,
  credentialTextSource,
  credentialsFromVerdict,
  aggregateCertRoi,
};
