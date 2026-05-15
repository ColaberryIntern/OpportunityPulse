// Deep Research Phase 4 — venture dependency mapping.
//
// Deterministic. For every venture pair, maps three flavors of dependency:
//   shared_architecture — both ventures need the same components/services
//   shared_staffing     — both ventures need the same roles
//   shared_ai_provider  — both ventures rely on the same AI provider
//
// Each edge carries a risk_score reflecting cascading-failure risk if the
// shared resource goes down, plus enough metadata to be auditable. The
// service also derives sequencing_constraints — pairs of ventures that
// should not run in parallel because they'd contend for the same scarce
// resource.

const { Op } = require('sequelize');
const {
  VentureIdea, ExecutionReadiness, MvpPlan, VentureDependency,
} = require('../models');
const sharedInfrastructure = require('./sharedInfrastructure.service');

// Overlap below this is too thin to call a dependency.
const ARCH_DEPENDENCY_THRESHOLD = 0.3;
// Roles in this set are scarce enough that sharing them is a real conflict.
const SCARCE_ROLES = new Set([
  'tech lead', 'ai/ml engineer', 'solution architect (advisory)', 'product owner (part-time)',
]);

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Build the staffing fingerprint for one venture: a set of role names.
function staffingFingerprint(executionReadiness) {
  const set = new Set();
  if (!executionReadiness || !executionReadiness.staffing) return set;
  const roles = Array.isArray(executionReadiness.staffing.roles)
    ? executionReadiness.staffing.roles : [];
  for (const r of roles) set.add(String(r || '').toLowerCase().trim());
  return set;
}

// Build the AI-provider fingerprint. Since AI components are described in
// text (Phase 3 mvpPlan.recommendedAiComponents), we look for known provider
// signatures. Anything that doesn't match an explicit provider falls into
// the implicit 'default' bucket so ventures using the same default still
// register as sharing a provider.
function aiProviderFingerprint(mvpPlan) {
  const providers = new Set();
  const ais = (mvpPlan && (mvpPlan.recommendedAiComponents || mvpPlan.recommended_ai_components)) || [];
  const blob = ais.join(' ').toLowerCase();
  if (blob.includes('openai') || blob.includes('gpt-') || blob.includes('gpt ')) providers.add('openai');
  if (blob.includes('anthropic') || blob.includes('claude')) providers.add('anthropic');
  if (blob.includes('gemini') || blob.includes('google ai') || blob.includes('vertex')) providers.add('gemini');
  if (blob.includes('llama') || blob.includes('local')) providers.add('local');
  // Implicit fallback so ventures relying on the platform's default still
  // count as sharing a provider — that IS a real cascade risk.
  if (providers.size === 0 && ais.length > 0) providers.add('default');
  return providers;
}

// Intersect two sets.
function intersect(a, b) {
  const out = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out;
}

// Map a shared-architecture pair to an edge.
function archEdge(pair) {
  const overlap = Number(pair.overlap_score);
  // Higher coupling → higher cascade risk + scaled with the absolute count
  // of shared components.
  const sharedCount = (pair.shared_components || []).length;
  const risk = clamp100(overlap * 70 + Math.min(sharedCount, 8) * 3);
  return {
    venture_idea_id: pair.venture_a_id,
    related_venture_idea_id: pair.venture_b_id,
    dependency_type: 'shared_architecture',
    risk_score: risk,
    metadata: {
      overlap_score: overlap,
      shared_components: pair.shared_components,
      reasoning: `${sharedCount} shared components — failure in any one cascades to both ventures.`,
    },
  };
}

// Map two staffing fingerprints to an edge if there's meaningful overlap.
function staffingEdge(idA, fpA, idB, fpB) {
  const shared = intersect(fpA, fpB);
  if (shared.length === 0) return null;
  const scarce = shared.filter((r) => SCARCE_ROLES.has(r));
  if (shared.length === 1 && scarce.length === 0) return null; // one common role isn't a dependency
  const risk = clamp100(shared.length * 12 + scarce.length * 25);
  return {
    venture_idea_id: idA,
    related_venture_idea_id: idB,
    dependency_type: 'shared_staffing',
    risk_score: risk,
    metadata: {
      shared_roles: shared,
      scarce_roles: scarce,
      reasoning: scarce.length
        ? `Both ventures need scarce roles: ${scarce.join(', ')}. Running in parallel forces a choice.`
        : `Both ventures need overlapping roles: ${shared.join(', ')}.`,
    },
  };
}

// Map two AI-provider fingerprints to an edge if they overlap.
function aiProviderEdge(idA, fpA, idB, fpB) {
  const shared = intersect(fpA, fpB);
  if (shared.length === 0) return null;
  // A shared provider is a real cascade risk — provider outage hits both.
  const risk = clamp100(shared.length * 30 + 35);
  return {
    venture_idea_id: idA,
    related_venture_idea_id: idB,
    dependency_type: 'shared_ai_provider',
    risk_score: risk,
    metadata: {
      shared_providers: shared,
      reasoning: `Both ventures depend on provider(s): ${shared.join(', ')}. A provider outage hits both.`,
    },
  };
}

// Build the full dependency graph: nodes (ventures) + edges (dependencies)
// + sequencing constraints (pairs that should not run in parallel).
function buildGraph(ventureIdeas, readinessByVenture, mvpByVenture, archPairs) {
  // Architecture edges from the shared-infrastructure analysis.
  const edges = [];
  for (const p of archPairs) {
    if (Number(p.overlap_score) < ARCH_DEPENDENCY_THRESHOLD) continue;
    edges.push(archEdge(p));
  }
  // Staffing + AI-provider edges across every pair.
  const ids = ventureIdeas.map((v) => v.id);
  const staffingFp = new Map(ventureIdeas.map((v) => [v.id, staffingFingerprint(readinessByVenture.get(v.id))]));
  const aiFp = new Map(ventureIdeas.map((v) => [v.id, aiProviderFingerprint(mvpByVenture.get(v.id))]));
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      const se = staffingEdge(a, staffingFp.get(a), b, staffingFp.get(b));
      if (se) edges.push(se);
      const ae = aiProviderEdge(a, aiFp.get(a), b, aiFp.get(b));
      if (ae) edges.push(ae);
    }
  }

  // Per-venture aggregate risk: max edge risk touching the venture.
  const ventureRisk = new Map();
  for (const v of ventureIdeas) ventureRisk.set(v.id, 0);
  for (const e of edges) {
    ventureRisk.set(e.venture_idea_id, Math.max(ventureRisk.get(e.venture_idea_id) || 0, e.risk_score));
    ventureRisk.set(e.related_venture_idea_id, Math.max(ventureRisk.get(e.related_venture_idea_id) || 0, e.risk_score));
  }

  // Sequencing constraints — pairs with high enough risk that they
  // shouldn't run in parallel. Staffing conflicts on scarce roles are the
  // sharpest sequencing trigger.
  const sequencingConstraints = [];
  for (const e of edges) {
    const isStaffingScarce = e.dependency_type === 'shared_staffing'
      && Array.isArray(e.metadata.scarce_roles) && e.metadata.scarce_roles.length > 0;
    if (isStaffingScarce || e.risk_score >= 65) {
      sequencingConstraints.push({
        venture_a_id: e.venture_idea_id,
        venture_b_id: e.related_venture_idea_id,
        reason: e.metadata.reasoning,
        type: e.dependency_type,
      });
    }
  }

  return {
    nodes: ventureIdeas.map((v) => ({
      venture_idea_id: v.id,
      title: v.title,
      lifecycle_state: v.lifecycleState,
      dependency_risk: ventureRisk.get(v.id) || 0,
    })),
    edges,
    sequencing_constraints: sequencingConstraints,
  };
}

// Run the analysis + persist edges. Idempotent: clears old edges for the
// venture set before persisting fresh ones.
async function buildDependencyGraph() {
  const ventureIdeas = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const mvpRows = await MvpPlan.findAll();
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));
  const mvpByVenture = new Map(mvpRows.map((r) => [r.ventureIdeaId, r]));

  const archAnalysis = sharedInfrastructure.analyzeOverlaps(
    ventureIdeas, readinessByVenture, mvpByVenture,
  );

  const graph = buildGraph(ventureIdeas, readinessByVenture, mvpByVenture, archAnalysis.pairs);

  const ventureIds = ventureIdeas.map((v) => v.id);
  if (ventureIds.length > 0) {
    await VentureDependency.destroy({
      where: { ventureIdeaId: { [Op.in]: ventureIds } },
    });
  }
  for (const e of graph.edges) {
    // eslint-disable-next-line no-await-in-loop
    await VentureDependency.create({
      ventureIdeaId: e.venture_idea_id,
      relatedVentureIdeaId: e.related_venture_idea_id,
      dependencyType: e.dependency_type,
      riskScore: e.risk_score,
      metadata: e.metadata,
    });
  }
  return graph;
}

async function getDependencyGraph() {
  const ventureIdeas = await VentureIdea.findAll();
  const edges = await VentureDependency.findAll({ order: [['risk_score', 'DESC']] });
  const ventureRisk = new Map();
  for (const v of ventureIdeas) ventureRisk.set(v.id, 0);
  for (const e of edges) {
    ventureRisk.set(e.ventureIdeaId,
      Math.max(ventureRisk.get(e.ventureIdeaId) || 0, Number(e.riskScore)));
    ventureRisk.set(e.relatedVentureIdeaId,
      Math.max(ventureRisk.get(e.relatedVentureIdeaId) || 0, Number(e.riskScore)));
  }
  return {
    nodes: ventureIdeas.map((v) => ({
      venture_idea_id: v.id, title: v.title, lifecycle_state: v.lifecycleState,
      dependency_risk: ventureRisk.get(v.id) || 0,
    })),
    edges: edges.map((e) => e.toJSON()),
  };
}

module.exports = {
  ARCH_DEPENDENCY_THRESHOLD,
  SCARCE_ROLES,
  staffingFingerprint,
  aiProviderFingerprint,
  archEdge,
  staffingEdge,
  aiProviderEdge,
  buildGraph,
  buildDependencyGraph,
  getDependencyGraph,
};
