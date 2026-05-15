// Deep Research Phase 4 — venture template intelligence.
//
// Deterministic. Detects repeatable patterns across the portfolio by
// matching keyword signatures against venture title + description, then
// aggregates per-template MVP scaffolds + GTM playbooks from the Phase 3
// MVP plans + launch strategies of every matching venture. Goal: compress
// future execution time — a new venture matching an existing template
// inherits a battle-tested scaffold.

const {
  VentureIdea, MvpPlan, LaunchStrategy, VentureTemplate,
} = require('../models');

// The catalog. Keyword signatures are case-insensitive substring matches —
// no AI, no fuzzy matching, easy to audit + extend.
const TEMPLATES = [
  {
    key: 'ai_assistant',
    label: 'AI Assistant',
    description: 'Conversational / agentic assistant — triages, drafts, escalates, with human review.',
    keywords: ['assistant', 'agent', 'triage', 'chatbot', 'co-pilot', 'copilot', 'helper'],
  },
  {
    key: 'workflow_automation',
    label: 'Workflow Automation',
    description: 'Automation of a structured back-office or operations workflow.',
    keywords: ['workflow', 'automation', 'process', 'orchestrat', 'pipeline', 'rpa'],
  },
  {
    key: 'ai_education',
    label: 'AI Education',
    description: 'Learning, training, or curriculum product powered by AI.',
    keywords: ['education', 'training', 'curriculum', 'learn', 'teach', 'course', 'tutor'],
  },
  {
    key: 'gov_intelligence',
    label: 'Government Intelligence',
    description: 'Public-sector tooling — procurement, compliance, agency operations.',
    keywords: ['government', 'procurement', ' gov ', 'agency', 'federal', 'municipal', 'state ',
      'compliance', 'rfp', 'solicitation'],
  },
  {
    key: 'ai_orchestration',
    label: 'AI Orchestration',
    description: 'Multi-agent / multi-model orchestration platform or framework.',
    keywords: ['orchestrat', 'multi-agent', 'multi agent', 'agent ops', 'tool use', 'tool-use'],
  },
  {
    key: 'ai_observability',
    label: 'AI Observability',
    description: 'Audit, governance, evaluation, observability for AI systems.',
    keywords: ['observ', 'audit', 'governance', 'evaluation', 'eval ', 'monitor', 'control plane'],
  },
];

// Lowercased text we match against.
function ventureText(v) {
  return `${v.title || ''} ${v.description || ''}`.toLowerCase();
}

// Return the templates a venture matches (it can match multiple — a
// "government AI assistant" is both gov_intelligence + ai_assistant).
function matchTemplatesForVenture(ventureIdea) {
  const text = ventureText(ventureIdea);
  return TEMPLATES.filter((t) => t.keywords.some((kw) => text.includes(kw)));
}

// Aggregate an MVP scaffold from every matching venture's MVP plan.
function aggregateMvpScaffold(mvpPlans) {
  const collect = (rows, getter) => {
    const counts = new Map();
    for (const row of rows) {
      const arr = getter(row) || [];
      for (const item of arr) {
        const k = String(item || '').trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([item, count]) => ({ item, frequency: count }));
  };
  return {
    common_phase1_features: collect(mvpPlans, (r) => r.phase1Features || r.phase_1_features),
    common_stack: collect(mvpPlans, (r) => r.suggestedStack || r.suggested_stack),
    common_ai_components: collect(mvpPlans, (r) => r.recommendedAiComponents || r.recommended_ai_components),
    typical_staffing: aggregateStaffing(mvpPlans),
    typical_timeline_weeks: medianTimeline(mvpPlans),
  };
}

function aggregateStaffing(mvpPlans) {
  const roleCounts = new Map();
  let totalHeadcount = 0;
  let n = 0;
  for (const r of mvpPlans) {
    const s = r.staffing || {};
    if (s.headcount != null) { totalHeadcount += Number(s.headcount); n += 1; }
    for (const role of (s.roles || [])) {
      const k = String(role).toLowerCase().trim();
      if (k) roleCounts.set(k, (roleCounts.get(k) || 0) + 1);
    }
  }
  return {
    typical_headcount: n > 0 ? Math.round(totalHeadcount / n) : null,
    common_roles: Array.from(roleCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([role, count]) => ({ role, frequency: count })),
  };
}

function medianTimeline(mvpPlans) {
  const weeks = mvpPlans.map((r) => Number(r.estimatedTimelineWeeks || r.estimated_timeline_weeks))
    .filter((n) => Number.isFinite(n));
  if (weeks.length === 0) return null;
  weeks.sort((a, b) => a - b);
  return weeks[Math.floor(weeks.length / 2)];
}

// Aggregate a GTM playbook from matching launch strategies.
function aggregateGtmPlaybook(launchStrategies) {
  const collect = (rows, getter) => {
    const counts = new Map();
    for (const row of rows) {
      const arr = getter(row) || [];
      for (const item of arr) {
        const k = String(item || '').trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([item, count]) => ({ item, frequency: count }));
  };
  // First non-empty pricing/icp text from a strategy — a useful exemplar
  // without claiming to summarize across strategies.
  const sample = (rows, getter) => {
    for (const r of rows) {
      const v = getter(r);
      if (v && String(v).trim()) return String(v);
    }
    return null;
  };
  return {
    common_channels: collect(launchStrategies, (r) => r.channels),
    sample_icp: sample(launchStrategies, (r) => r.icp),
    sample_gtm: sample(launchStrategies, (r) => r.gtm),
    sample_pricing: sample(launchStrategies, (r) => r.pricingStrategy || r.pricing_strategy),
    sample_pilot: sample(launchStrategies, (r) => r.pilotStrategy || r.pilot_strategy),
  };
}

// Run detection across the portfolio + upsert one row per matched template.
async function detectTemplates() {
  const ventureIdeas = await VentureIdea.findAll();
  const mvpRows = await MvpPlan.findAll();
  const launchRows = await LaunchStrategy.findAll();
  const mvpByVenture = new Map(mvpRows.map((r) => [r.ventureIdeaId, r]));
  const launchByVenture = new Map(launchRows.map((r) => [r.ventureIdeaId, r]));

  const buckets = new Map(); // template_key → { template, ventureIds, mvpPlans, launchStrategies }
  for (const t of TEMPLATES) {
    buckets.set(t.key, { template: t, ventureIds: [], mvpPlans: [], launchStrategies: [] });
  }
  for (const v of ventureIdeas) {
    const matches = matchTemplatesForVenture(v);
    for (const t of matches) {
      const b = buckets.get(t.key);
      b.ventureIds.push(v.id);
      const mvp = mvpByVenture.get(v.id);
      if (mvp) b.mvpPlans.push(mvp);
      const launch = launchByVenture.get(v.id);
      if (launch) b.launchStrategies.push(launch);
    }
  }

  const persisted = [];
  for (const b of buckets.values()) {
    if (b.ventureIds.length === 0) continue;
    const scaffold = aggregateMvpScaffold(b.mvpPlans);
    const playbook = aggregateGtmPlaybook(b.launchStrategies);
    const [row] = await VentureTemplate.findOrCreate({
      where: { templateKey: b.template.key },
      defaults: {
        templateKey: b.template.key, label: b.template.label, description: b.template.description,
      },
    });
    await row.update({
      label: b.template.label,
      description: b.template.description,
      mvpScaffold: scaffold,
      gtmPlaybook: playbook,
      applicableTo: b.ventureIds.sort((a, b2) => a - b2),
    });
    persisted.push(row.toJSON());
  }
  return persisted;
}

async function listTemplates() {
  const rows = await VentureTemplate.findAll({ order: [['template_key', 'ASC']] });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  TEMPLATES,
  ventureText,
  matchTemplatesForVenture,
  aggregateMvpScaffold,
  aggregateGtmPlaybook,
  detectTemplates,
  listTemplates,
};
