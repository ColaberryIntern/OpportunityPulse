// Deep Research Phase 3 — deployment readiness engine.
//
// Deterministic. Classifies how far a venture could realistically be
// deployed: prototype → mvp → production → enterprise. It reads five
// signals and rolls them into a classification with a traceable rationale.
//
// Four of the five are "readiness" sub-scores (0-100, higher = better):
// requirements_completeness, architecture_quality, ai_dependency_risk
// (here: AI-dependency *safety*), infrastructure_readiness. The fifth,
// compliance_exposure, is an *exposure* score (0-100, higher = MORE
// regulatory exposure to clear) — it gates the top levels rather than
// averaging in.

const LEVELS = ['prototype', 'mvp', 'production', 'enterprise'];

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

function field(obj, snake, camel) {
  if (obj[snake] !== undefined && obj[snake] !== null) return obj[snake];
  if (obj[camel] !== undefined && obj[camel] !== null) return obj[camel];
  return undefined;
}

// Assess deployment readiness for a venture idea.
//   ventureIdea           — for scores + metadata (architecture)
//   executionReadiness    — Phase 3 execution readiness (sub-scores)
//   hasCompletedRequirements — boolean: a project generation job finished
//   hasMvpPlan            — boolean: an MVP plan exists
function assessDeploymentReadiness({
  ventureIdea = {}, executionReadiness = {}, hasCompletedRequirements = false, hasMvpPlan = false,
} = {}) {
  const scores = ventureIdea.scores || {};
  const meta = ventureIdea.metadata || {};
  const exTechnical = Number(field(executionReadiness, 'technical_complexity', 'technicalComplexity')) || 50;
  const exAiSafety = Number(field(executionReadiness, 'ai_dependency_risk', 'aiDependencyRisk')) || 50;
  const exOperational = Number(field(executionReadiness, 'operational_readiness', 'operationalReadiness')) || 50;

  // --- requirements_completeness ---
  // A finished requirements job is the strongest signal; an MVP plan is a
  // weaker one; nothing yet is a prototype-grade gap.
  const requirementsCompleteness = clamp100(
    (hasCompletedRequirements ? 80 : 0) + (hasMvpPlan ? 18 : 0) + 15,
  );

  // --- architecture_quality ---
  // A concrete suggested architecture + a technically-tractable build.
  const hasArchitecture = !!String(meta.suggested_architecture || '').trim();
  const architectureQuality = clamp100(
    (hasArchitecture ? 35 : 0) + exTechnical * 0.5 + (scores.technical_feasibility || 50) * 0.2,
  );

  // --- ai_dependency_risk (safety) ---
  const aiDependencyRisk = clamp100(exAiSafety);

  // --- infrastructure_readiness ---
  const infrastructureReadiness = clamp100(exOperational * 0.6 + exTechnical * 0.4);

  // --- compliance_exposure (higher = MORE exposure to clear) ---
  // Government-aligned ventures carry the most regulatory exposure.
  const complianceExposure = clamp100((scores.gov_alignment || 30) * 0.85 + 10);

  // The four readiness sub-scores average into a base; compliance exposure
  // is a gate, not an average term.
  const readinessAvg = (requirementsCompleteness + architectureQuality
    + aiDependencyRisk + infrastructureReadiness) / 4;

  // Classify. Higher levels have gates: enterprise needs requirements
  // genuinely complete AND compliance exposure not left unaddressed.
  let level;
  if (readinessAvg >= 78 && requirementsCompleteness >= 75 && complianceExposure <= 80) {
    level = 'enterprise';
  } else if (readinessAvg >= 62 && requirementsCompleteness >= 55) {
    level = 'production';
  } else if (readinessAvg >= 42) {
    level = 'mvp';
  } else {
    level = 'prototype';
  }

  const levelNote = {
    prototype: 'Prototype-grade only — core requirements + architecture are still thin.',
    mvp: 'MVP-ready — enough to ship a real first version, not yet hardened for scale.',
    production: 'Production-ready — requirements, architecture and infrastructure readiness all hold up.',
    enterprise: 'Enterprise-ready — strong across the board with compliance exposure accounted for.',
  };
  const rationale = `${levelNote[level]} Requirements completeness ${requirementsCompleteness}, `
    + `architecture quality ${architectureQuality}, AI-dependency safety ${aiDependencyRisk}, `
    + `infrastructure readiness ${infrastructureReadiness}; regulatory exposure to clear `
    + `${complianceExposure}.`;

  return {
    readiness_level: level,
    requirements_completeness: requirementsCompleteness,
    architecture_quality: architectureQuality,
    ai_dependency_risk: aiDependencyRisk,
    infrastructure_readiness: infrastructureReadiness,
    compliance_exposure: complianceExposure,
    breakdown: {
      requirements_completeness: requirementsCompleteness,
      architecture_quality: architectureQuality,
      ai_dependency_risk: aiDependencyRisk,
      infrastructure_readiness: infrastructureReadiness,
      compliance_exposure: complianceExposure,
      readiness_average: Number(readinessAvg.toFixed(2)),
    },
    rationale,
  };
}

module.exports = {
  LEVELS,
  assessDeploymentReadiness,
};
