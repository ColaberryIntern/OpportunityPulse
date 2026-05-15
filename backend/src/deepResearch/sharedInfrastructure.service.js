// Deep Research Phase 4 — shared infrastructure intelligence.
//
// Deterministic. For every pair of venture ideas, computes how much of the
// build is genuinely shared by comparing their component fingerprints — the
// infrastructure items (Phase 3 executionReadiness), the suggested stack +
// AI components (Phase 3 mvpPlan), plus signature words from the suggested
// architecture description.
//
// Output: per-pair overlap rows + a portfolio-level "shared build
// opportunities" list (components shared across 3+ ventures — candidates
// for a shared service that reduces duplicate execution effort).

const { Op } = require('sequelize');
const {
  VentureIdea, ExecutionReadiness, MvpPlan, InfrastructureOverlap,
} = require('../models');

// Pair overlaps below this score are not worth persisting (noise).
const MIN_PAIR_OVERLAP = 0.2;
// A component is a "shared build opportunity" once 3+ ventures use it.
const MIN_SHARED_VENTURES = 3;

// Component-y phrases that survive normalization. Everything else is dropped
// during fingerprinting so spurious words don't fake overlap.
const ARCH_TOKENS = [
  'vector', 'embedding', 'rag', 'agent', 'orchestrat', 'pipeline', 'workflow',
  'review queue', 'audit log', 'pdf', 'document', 'search', 'classification',
  'event log', 'rbac', 'compliance', 'matrix', 'evaluation', 'benchmark',
  'memory', 'tool', 'observ',
];

function normalizeComponent(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Pull signature tokens out of a free-form architecture description.
function archSignatureTokens(text) {
  const t = String(text || '').toLowerCase();
  const tokens = new Set();
  for (const k of ARCH_TOKENS) if (t.includes(k)) tokens.add(`arch:${k}`);
  return tokens;
}

// Build the component fingerprint for one venture. Set of normalized
// component strings; the union across (infra, stack, ai, arch) is what we
// compare across ventures.
function buildFingerprint(ventureIdea, executionReadiness, mvpPlan) {
  const set = new Set();
  const meta = ventureIdea.metadata || {};
  // Architecture signature tokens.
  for (const t of archSignatureTokens(meta.suggested_architecture)) set.add(t);
  // Infrastructure items from execution readiness.
  if (executionReadiness && executionReadiness.infrastructure
      && Array.isArray(executionReadiness.infrastructure.items)) {
    for (const item of executionReadiness.infrastructure.items) {
      const n = normalizeComponent(item);
      if (n) set.add(`infra:${n}`);
    }
  }
  // MVP plan stack + AI components.
  if (mvpPlan) {
    for (const s of (mvpPlan.suggestedStack || mvpPlan.suggested_stack || [])) {
      const n = normalizeComponent(s);
      if (n) set.add(`stack:${n}`);
    }
    for (const a of (mvpPlan.recommendedAiComponents || mvpPlan.recommended_ai_components || [])) {
      const n = normalizeComponent(a);
      if (n) set.add(`ai:${n}`);
    }
  }
  return set;
}

// Jaccard similarity between two fingerprint sets.
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : Number((inter / union).toFixed(3));
}

// The intersection list — used as "shared components" on the pair row.
function intersection(a, b) {
  const out = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out;
}

// Compute the full overlap analysis: per-pair scores + portfolio-level
// shared opportunities. Pure — given inputs, returns the analysis.
function analyzeOverlaps(ventureIdeas, readinessByVenture, mvpByVenture) {
  const fingerprints = new Map();
  for (const v of ventureIdeas) {
    fingerprints.set(v.id, buildFingerprint(
      v, readinessByVenture.get(v.id), mvpByVenture.get(v.id),
    ));
  }

  // Pairs.
  const pairs = [];
  const ids = ventureIdeas.map((v) => v.id);
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      const fa = fingerprints.get(a);
      const fb = fingerprints.get(b);
      const score = jaccard(fa, fb);
      if (score >= MIN_PAIR_OVERLAP) {
        pairs.push({
          venture_a_id: a,
          venture_b_id: b,
          overlap_score: score,
          shared_components: intersection(fa, fb),
        });
      }
    }
  }

  // Shared build opportunities: components used by 3+ ventures.
  const componentVentures = new Map(); // component → Set<venture_id>
  for (const [vid, fp] of fingerprints) {
    for (const c of fp) {
      if (!componentVentures.has(c)) componentVentures.set(c, new Set());
      componentVentures.get(c).add(vid);
    }
  }
  const sharedOpportunities = [];
  for (const [component, ventureSet] of componentVentures) {
    if (ventureSet.size >= MIN_SHARED_VENTURES) {
      sharedOpportunities.push({
        component,
        venture_ids: Array.from(ventureSet).sort((a, b) => a - b),
        venture_count: ventureSet.size,
      });
    }
  }
  sharedOpportunities.sort((a, b) => b.venture_count - a.venture_count);

  return { pairs, shared_opportunities: sharedOpportunities };
}

// Run the analysis + persist the per-pair overlap rows. Idempotent: clears
// the prior overlap state for the venture set so stale pairs don't linger.
async function detectOverlaps() {
  const ventureIdeas = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const mvpRows = await MvpPlan.findAll();
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));
  const mvpByVenture = new Map(mvpRows.map((r) => [r.ventureIdeaId, r]));

  const analysis = analyzeOverlaps(ventureIdeas, readinessByVenture, mvpByVenture);

  const ventureIds = ventureIdeas.map((v) => v.id);
  if (ventureIds.length > 0) {
    await InfrastructureOverlap.destroy({
      where: { ventureAId: { [Op.in]: ventureIds } },
    });
  }
  for (const p of analysis.pairs) {
    // eslint-disable-next-line no-await-in-loop
    await InfrastructureOverlap.create({
      ventureAId: p.venture_a_id,
      ventureBId: p.venture_b_id,
      overlapScore: p.overlap_score,
      sharedComponents: p.shared_components,
    });
  }
  return analysis;
}

async function listOverlaps() {
  const overlaps = await InfrastructureOverlap.findAll({
    order: [['overlap_score', 'DESC']],
  });
  return overlaps.map((o) => o.toJSON());
}

module.exports = {
  MIN_PAIR_OVERLAP,
  MIN_SHARED_VENTURES,
  ARCH_TOKENS,
  buildFingerprint,
  jaccard,
  analyzeOverlaps,
  detectOverlaps,
  listOverlaps,
};
