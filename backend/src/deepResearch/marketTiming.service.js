// Deep Research Phase 2 — market timing engine.
//
// Deterministic classification of where a market sits in its lifecycle:
//   emerging → acceleration → breakout → mainstream → saturated → declining
//
// It consumes the cross-channel correlation output (per-channel signal
// breakdown + acceleration) and reads it along two axes:
//   - momentum  — how fast the signal is moving (recent vs prior windows)
//   - maturity  — how broad + deep the signal already is
//
// Stage is the (momentum × maturity) quadrant; timing_score is a single
// 0-1 "market heat" number for chips/sorting; confidence reflects how much
// corroborating data the classification actually had to work with.

const STAGES = ['emerging', 'acceleration', 'breakout', 'mainstream', 'saturated', 'declining'];

// Pull the five lifecycle-relevant velocities out of the correlation
// signal breakdown. Each is { volume, recent, accel } for one channel.
function extractVelocities(signalBreakdown) {
  const byChannel = {};
  for (const s of signalBreakdown || []) byChannel[s.channel] = s;
  const pick = (key) => {
    const s = byChannel[key];
    return s
      ? { volume: s.volume || 0, recent: s.recent_count || 0, accel: s.acceleration || 1 }
      : { volume: 0, recent: 0, accel: 1 };
  };
  return {
    funding: pick('capital'),
    hiring: pick('talent'),
    publication: pick('research'),
    procurement: pick('government'),
    media: pick('private-sector'),
  };
}

// Maturity 0-1 — how established the market already is. Total volume across
// channels (soft-capped) blended with breadth (how many channels carry signal).
function computeMaturity(signalBreakdown) {
  const totalVolume = (signalBreakdown || []).reduce((s, x) => s + (x.volume || 0), 0);
  const channelsWithSignal = (signalBreakdown || []).filter((x) => (x.volume || 0) >= 2).length;
  const volumeScore = Math.min(1, totalVolume / 60); // 60+ opps = mature volume
  const breadthScore = Math.min(1, channelsWithSignal / 5); // 5+ channels = broad
  return Number(((volumeScore * 0.6) + (breadthScore * 0.4)).toFixed(3));
}

// Momentum 0-1+ — the correlation acceleration ratio re-centered. accel of
// 1.0 (steady) → 0.5; 2.0+ (doubling) → ~1.0; <0.75 → low.
function computeMomentum(acceleration) {
  const a = Number(acceleration) || 1;
  return Math.max(0, Math.min(1, (a - 0.5) / 1.5));
}

// The (momentum × maturity) → stage quadrant map.
function classifyStage({ momentum, maturity, acceleration }) {
  // Declining is acceleration-driven and overrides the quadrant — a market
  // whose recent window is well below its prior window is cooling regardless
  // of how mature it looks.
  if (acceleration < 0.75) return 'declining';

  const hot = momentum >= 0.6;
  const warm = momentum >= 0.4;
  const mature = maturity >= 0.55;
  const developing = maturity >= 0.3;

  if (!developing) {
    // Thin market — emerging unless it's moving fast, then acceleration.
    return hot ? 'acceleration' : 'emerging';
  }
  if (!mature) {
    if (hot) return 'breakout';
    if (warm) return 'acceleration';
    return 'emerging';
  }
  // Mature market.
  if (hot) return 'breakout';
  if (warm) return 'mainstream';
  return 'saturated';
}

// Confidence 0-1 — how much data backed the classification. Thin data =
// low confidence regardless of how clean the quadrant looks.
function computeConfidence(signalBreakdown, sourceCount) {
  const channelsWithSignal = (signalBreakdown || []).filter((x) => (x.volume || 0) >= 2).length;
  const volumeConfidence = Math.min(1, (sourceCount || 0) / 40);
  const breadthConfidence = Math.min(1, channelsWithSignal / 4);
  return Number(((volumeConfidence * 0.5) + (breadthConfidence * 0.5)).toFixed(3));
}

function buildRationale(stage, velocities, momentum, maturity) {
  const moving = [];
  if (velocities.funding.volume > 0) moving.push(`${velocities.funding.volume} funding signals`);
  if (velocities.hiring.volume > 0) moving.push(`${velocities.hiring.volume} hiring signals`);
  if (velocities.publication.volume > 0) moving.push(`${velocities.publication.volume} research papers`);
  if (velocities.procurement.volume > 0) moving.push(`${velocities.procurement.volume} procurement signals`);
  const evidence = moving.length ? moving.join(', ') : 'sparse cross-channel data';
  const map = {
    emerging: `Early — ${evidence}. Capability or interest exists but breadth and momentum are both still low.`,
    acceleration: `Heating up — ${evidence}. Momentum is rising faster than the market is broadening.`,
    breakout: `Breakout — ${evidence}. Strong momentum on top of an already-broad signal base.`,
    mainstream: `Mainstream — ${evidence}. Broad, established presence with steady (not surging) momentum.`,
    saturated: `Saturated — ${evidence}. The market is broad and established but momentum has flattened.`,
    declining: `Declining — ${evidence}. The recent signal window is materially below the prior window.`,
  };
  return map[stage] || `Stage ${stage} — momentum ${momentum}, maturity ${maturity}.`;
}

// Classify market timing from a correlation result + the report context.
// Returns the persisted shape — pure, deterministic.
function classifyTiming(correlation, context) {
  const signalBreakdown = (correlation && correlation.signal_breakdown) || [];
  const acceleration = (correlation && Number(correlation.acceleration)) || 1;
  const sourceCount = (context && context.totals && context.totals.sourceCount) || 0;

  const velocities = extractVelocities(signalBreakdown);
  const maturity = computeMaturity(signalBreakdown);
  const momentum = computeMomentum(acceleration);
  const stage = classifyStage({ momentum, maturity, acceleration });
  const confidence = computeConfidence(signalBreakdown, sourceCount);

  // timing_score 0-1 — a single "market heat" number. Momentum-weighted so
  // a fast-moving emerging market scores above a flat mainstream one.
  const timingScore = Number(((momentum * 0.6) + (maturity * 0.4)).toFixed(3));

  return {
    stage,
    timing_score: timingScore,
    momentum: Number(momentum.toFixed(3)),
    maturity,
    confidence,
    signal_velocities: velocities,
    rationale: buildRationale(stage, velocities, momentum, maturity),
  };
}

module.exports = {
  STAGES,
  extractVelocities,
  computeMaturity,
  computeMomentum,
  classifyStage,
  computeConfidence,
  classifyTiming,
};
