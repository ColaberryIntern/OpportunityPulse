// Colaberry's certification posture — the deterministic policy that decides whether
// a CERT_WALL is a dead no_bid or a 'conditional' WATCHLIST row that unblocks once an
// in-progress certification lands.
//
// Rationale (gov-bid experiment, 2026-06): SOC 2 is the one cert worth buying because
// it gates work that is genuinely in Colaberry's lane (SaaS / platform builds), and
// Colaberry is ACQUIRING it. So a solicitation whose ONLY blocker is SOC 2 is not dead —
// it becomes winnable the day the report is issued. This module turns that posture into
// a verdict transform so those bids surface on a watchlist (amber 'conditional') with
// their close date, instead of being buried with the permanent no-bids.
//
// Operating note: flip a cert to 'held' (or list it in CERT_POSTURE_HELD) the day it
// lands and every bid gated only on it auto-clears to needs_review for a fresh look — no
// code change. Pure logic, no I/O. Unit-tested in tests/govContracts/certPosture.test.js.

// Canonical cert vocabulary. Mirrors certRoi.js CERT_PATTERNS so a cert named in a
// verdict's evidence/label resolves to the same canonical name in both places.
const CERT_VOCAB = [
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

// Default posture. 'acquiring' = in progress (downgrades a sole-blocker no_bid to a
// conditional watchlist). 'held' = we clear it (re-vet the rest). 'not_pursuing' = a
// real wall (stays no_bid). Anything not listed is treated as not_pursuing.
const DEFAULT_POSTURE = {
  'SOC 2': { status: 'acquiring', eta: 'Type I in progress (~6 mo to award)' },
};

// Env override: comma lists, e.g. CERT_POSTURE_HELD="SOC 2", CERT_POSTURE_ACQUIRING="StateRAMP,TX-RAMP".
// 'held' takes precedence over 'acquiring' if a cert is listed in both.
function loadPosture() {
  const posture = {};
  for (const [cert, p] of Object.entries(DEFAULT_POSTURE)) posture[cert] = { ...p };
  const apply = (envVal, status) => String(envVal || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .forEach((c) => { posture[c] = { status, eta: (posture[c] && posture[c].eta) || null }; });
  apply(process.env.CERT_POSTURE_ACQUIRING, 'acquiring');
  apply(process.env.CERT_POSTURE_HELD, 'held'); // held wins
  return posture;
}

function postureOf(cert, posture = loadPosture()) {
  return posture[cert] || { status: 'not_pursuing' };
}

// Canonical cert names mentioned in a blob of verdict text (evidence + label).
function namedCerts(text) {
  const hay = String(text || '');
  const hits = [];
  for (const p of CERT_VOCAB) {
    if (p.re.test(hay) && !hits.includes(p.cert)) hits.push(p.cert);
  }
  return hits;
}

// Transform a verdict in light of cert posture. Only a CONFIRMED no_bid whose gate is
// CERT_WALL is a candidate — everything else is returned untouched (a tentative
// needs_review / auto-flag is deliberately NOT promoted; we only rescue a proven wall).
// If every cert the verdict names is one we hold or are acquiring, the wall is (or will
// be) clearable:
//   - any acquiring -> 'conditional' watchlist row (unblocked_by the in-progress cert)
//   - all held      -> 'needs_review' (cert now held; re-vet the remaining gates)
// If the verdict names a not-pursued cert (e.g. TX-RAMP) or names no cert at all, it is
// left as-is — a genuine wall, or unattributable, in which case we do not soften it.
function applyCertPosture(verdict, posture = loadPosture()) {
  if (!verdict || verdict.status !== 'no_bid' || verdict.disqualifier !== 'CERT_WALL') return verdict;
  const certs = namedCerts(`${verdict.evidence || ''} ${verdict.label || ''}`);
  if (!certs.length) return verdict; // unattributable — leave the wall in place
  const statuses = certs.map((c) => postureOf(c, posture).status);
  if (!statuses.every((s) => s === 'held' || s === 'acquiring')) return verdict; // a real wall remains

  const acquiring = certs.filter((c) => postureOf(c, posture).status === 'acquiring');
  if (acquiring.length) {
    const eta = postureOf(acquiring[0], posture).eta;
    return {
      ...verdict,
      status: 'conditional',
      lane: verdict.lane || 'services',
      unblocked_by: `${acquiring.join(' + ')} — in progress${eta ? ` (${eta})` : ''}`,
      label: `Watchlist: unblocks when ${acquiring.join(' + ')} lands`.slice(0, 120),
      cert_posture: 'acquiring',
    };
  }
  // All named certs already held — this is no longer a wall for us; re-vet the rest.
  return {
    ...verdict,
    status: 'needs_review',
    label: `Cert now held (${certs.join(' + ')}) — re-vet remaining gates`.slice(0, 120),
    cert_posture: 'held',
  };
}

module.exports = { CERT_VOCAB, DEFAULT_POSTURE, loadPosture, postureOf, namedCerts, applyCertPosture };
