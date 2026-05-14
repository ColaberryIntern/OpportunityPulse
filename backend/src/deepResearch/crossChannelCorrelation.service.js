// Deep Research Phase 2 — cross-channel signal correlation engine.
//
// THE most important Phase 2 capability. Phase 1 listed opportunities per
// channel; this engine reads ACROSS the channels to find where they
// reinforce each other:
//
//   research spike  +  hiring spike  +  funding spike  =  commercial
//                                                          acceleration signal
//
// Fully deterministic — no AI. It computes a per-channel signal (volume,
// recency, value, acceleration), classifies the convergence pattern, and
// derives a correlation strength + an acceleration ratio. The output is
// auditable: every number traces back to the channel data it came from.

// Commercial weight per channel — the defined model, not a tuned magic
// number. Demand-proof channels (capital, government) weigh heaviest;
// research is supply-side; news is the weakest signal on its own.
const CHANNEL_WEIGHTS = {
  capital: 1.0,
  government: 0.95,
  talent: 0.8,
  freelance: 0.65,
  research: 0.7,
  strategic: 0.6,
  'private-sector': 0.4, // news
  unknown: 0.3,
};

// A channel counts as "active" once its signal score clears this floor and
// it has at least a couple of opportunities — one stray row is not a signal.
const ACTIVE_SIGNAL_FLOOR = 0.15;
const ACTIVE_MIN_VOLUME = 2;

// Normalize a raw volume (count) onto 0-1 with a soft ceiling — 20+
// opportunities in a channel is already a saturated signal.
function normalizeVolume(count) {
  return Math.max(0, Math.min(1, count / 20));
}

// Per-channel signal: volume + recency + value rolled into one 0-1 score,
// plus an acceleration ratio (recent vs prior window).
function channelSignal(channel) {
  const count = channel.count || 0;
  const recentCount = channel.recentCount || 0;
  const priorCount = channel.priorCount || 0;
  const weight = CHANNEL_WEIGHTS[channel.key] != null ? CHANNEL_WEIGHTS[channel.key] : 0.3;

  const volumeScore = normalizeVolume(count);
  // recency: fraction of this channel's opportunities that are recent.
  const recency = count > 0 ? Math.max(0, Math.min(1, recentCount / count)) : 0;
  // acceleration: recent window vs prior window. 1.0 = steady, >1 = accelerating.
  const acceleration = priorCount > 0
    ? Math.min(3, recentCount / priorCount)
    : (recentCount > 0 ? 2 : 1);
  // hasValue nudges the score — disclosed dollar value is harder evidence.
  const valueBoost = (channel.totalValue || 0) > 0 ? 0.1 : 0;

  // Blended signal score, then scaled by the channel's commercial weight.
  const raw = (volumeScore * 0.5) + (recency * 0.4) + valueBoost;
  const signalScore = Math.max(0, Math.min(1, raw * weight));

  return {
    channel: channel.key,
    label: channel.label,
    volume: count,
    recent_count: recentCount,
    prior_count: priorCount,
    value: channel.totalValue || 0,
    recency: Number(recency.toFixed(3)),
    acceleration: Number(acceleration.toFixed(3)),
    signal_score: Number(signalScore.toFixed(3)),
    weight,
  };
}

// Classify the convergence pattern from the set of active channels.
function classifyConvergence(activeKeys) {
  const has = (k) => activeKeys.includes(k);
  if (has('research') && has('talent') && (has('capital') || has('government'))) {
    return 'commercial_acceleration';
  }
  if (has('research') && has('government')) return 'procurement_pull';
  if (has('capital') && (has('talent') || has('research'))) return 'capital_convergence';
  if (has('talent') && activeKeys.length >= 2) return 'talent_convergence';
  if (activeKeys.length === 1 && has('research')) return 'research_only';
  if (activeKeys.length >= 3) return 'diffuse';
  if (activeKeys.length >= 1) return 'emerging_single';
  return 'none';
}

// Human-readable evidence strings for the active channels.
function buildEvidence(signals, activeKeys, convergenceType) {
  const evidence = [];
  for (const sig of signals) {
    if (!activeKeys.includes(sig.channel)) continue;
    const accel = sig.acceleration > 1.3
      ? ` accelerating (${sig.acceleration}× prior window)`
      : (sig.acceleration < 0.8 ? ' cooling vs prior window' : ' steady');
    const value = sig.value > 0 ? `, $${Number(sig.value).toLocaleString()} disclosed` : '';
    evidence.push(`${sig.label}: ${sig.volume} opportunities${value} —${accel}.`);
  }
  if (convergenceType === 'commercial_acceleration') {
    evidence.unshift('Research, hiring and capital/procurement signals are all active at once — '
      + 'the classic commercial-acceleration pattern.');
  } else if (convergenceType === 'procurement_pull') {
    evidence.unshift('Research capability is matched by active government procurement — '
      + 'a public-sector-led pull.');
  } else if (convergenceType === 'research_only') {
    evidence.unshift('Only the research channel is active — capability exists but demand has not '
      + 'yet shown up in the other channels (early / speculative).');
  }
  return evidence;
}

// Analyze cross-channel correlation for an aggregated research context.
// Returns the persisted shape — pure, deterministic, no I/O.
function analyzeCorrelations(context) {
  const channels = (context && context.channels) || [];
  if (channels.length === 0) {
    return {
      correlation_strength: 0,
      acceleration: 1,
      convergence_type: 'none',
      signal_breakdown: [],
      supporting_evidence: ['No channel data — nothing to correlate.'],
    };
  }

  const signals = channels.map(channelSignal).sort((a, b) => b.signal_score - a.signal_score);
  const activeSignals = signals.filter(
    (s) => s.signal_score >= ACTIVE_SIGNAL_FLOOR && s.volume >= ACTIVE_MIN_VOLUME,
  );
  const activeKeys = activeSignals.map((s) => s.channel);
  const convergenceType = classifyConvergence(activeKeys);

  // correlation_strength: how broadly + strongly the channels reinforce.
  // Breadth = active channels / total channels seen; depth = mean active
  // signal score. A 60/40 blend so a single very strong channel can't fake
  // a "correlation".
  const breadth = signals.length > 0 ? activeSignals.length / signals.length : 0;
  const depth = activeSignals.length > 0
    ? activeSignals.reduce((s, x) => s + x.signal_score, 0) / activeSignals.length
    : 0;
  const correlationStrength = Number(((breadth * 0.6) + (depth * 0.4)).toFixed(3));

  // acceleration: volume-weighted mean of the per-channel acceleration ratios.
  const totalVolume = signals.reduce((s, x) => s + x.volume, 0);
  const acceleration = totalVolume > 0
    ? Number((signals.reduce((s, x) => s + (x.acceleration * x.volume), 0) / totalVolume).toFixed(3))
    : 1;

  return {
    correlation_strength: correlationStrength,
    acceleration,
    convergence_type: convergenceType,
    signal_breakdown: signals,
    supporting_evidence: buildEvidence(signals, activeKeys, convergenceType),
  };
}

module.exports = {
  CHANNEL_WEIGHTS,
  normalizeVolume,
  channelSignal,
  classifyConvergence,
  analyzeCorrelations,
};
