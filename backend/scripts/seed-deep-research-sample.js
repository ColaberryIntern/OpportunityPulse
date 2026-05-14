// Deep Research Intelligence Engine — sample report seeder.
//
// The OpenAI account quota is exhausted, so a live runDeepResearch() can't
// be exercised on prod. This seeds ONE representative report + venture
// ideas directly via the models so the report page, the venture idea
// cards, and the requirements-generation flow can be validated and
// screenshotted end-to-end.
//
// Phase 2: the seeder also builds a synthetic channel context and runs the
// REAL deterministic engines (cross-channel correlation, market timing,
// venture scoring) over it — so the seeded report is a genuine Phase 2
// report and those engines are validated against live prod data.
//
// Idempotent: re-running replaces the prior seeded sample (matched by its
// distinctive search_term) rather than piling up duplicates.
//
//   docker exec op-backend node scripts/seed-deep-research-sample.js

const {
  DeepResearchReport, VentureIdea, SignalCorrelation, MonetizationModel,
} = require('../src/models');
const crossChannelCorrelation = require('../src/deepResearch/crossChannelCorrelation.service');
const marketTiming = require('../src/deepResearch/marketTiming.service');
const ventureScoring = require('../src/deepResearch/ventureScoring.service');

const SEARCH_TERM = 'AI agents for government operations [sample]';

// A synthetic channel context with a clear commercial-acceleration shape:
// research + talent + capital + government all active and accelerating.
const SAMPLE_CONTEXT = {
  searchTerm: SEARCH_TERM,
  totals: {
    sourceCount: 27, channelCount: 5, totalValue: 4250000,
    buildableResearchCount: 6, withDemandSignalCount: 11,
  },
  channels: [
    { key: 'research', label: 'Research', count: 9, totalValue: 0, recentCount: 7, priorCount: 2, items: [] },
    { key: 'government', label: 'Government', count: 8, totalValue: 3100000, recentCount: 6, priorCount: 2, items: [] },
    { key: 'talent', label: 'Talent', count: 5, totalValue: 0, recentCount: 4, priorCount: 1, items: [] },
    { key: 'freelance', label: 'Freelance', count: 3, totalValue: 150000, recentCount: 2, priorCount: 1, items: [] },
    { key: 'capital', label: 'Capital', count: 2, totalValue: 1000000, recentCount: 2, priorCount: 0, items: [] },
  ],
};

async function main() {
  // Idempotency — clear any prior seeded sample (+ its Phase 2 child rows).
  const prior = await DeepResearchReport.findAll({ where: { searchTerm: SEARCH_TERM } });
  for (const p of prior) {
    // eslint-disable-next-line no-await-in-loop
    await VentureIdea.destroy({ where: { reportId: p.id } });
    // eslint-disable-next-line no-await-in-loop
    await SignalCorrelation.destroy({ where: { reportId: p.id } });
    // eslint-disable-next-line no-await-in-loop
    await MonetizationModel.destroy({ where: { reportId: p.id } });
    // eslint-disable-next-line no-await-in-loop
    await p.destroy();
  }

  // Run the REAL deterministic engines over the synthetic context — this
  // both validates the engines on prod and produces genuine Phase 2 data.
  const correlation = crossChannelCorrelation.analyzeCorrelations(SAMPLE_CONTEXT);
  const timing = marketTiming.classifyTiming(correlation, SAMPLE_CONTEXT);

  const report = await DeepResearchReport.create({
    searchTerm: SEARCH_TERM,
    status: 'success',
    origin: 'manual',
    sourceCount: 27,
    executiveSummary: 'AI agents for government operations sit at an inflection point: the research '
      + 'is production-ready, procurement demand is concrete (multiple linked state and federal IT '
      + 'contracts), and the talent market is heating up. The single most important takeaway — this is '
      + 'a near-term services-plus-product play, not a research bet. A small team can win a pilot '
      + 'contract now and productize the delivered work into a repeatable offering.',
    // Phase 2: the deterministic timing engine is authoritative for stage.
    marketStage: timing.stage,
    confidenceScore: timing.confidence,
    timingScore: timing.timing_score,
    correlationStrength: correlation.correlation_strength,
    reportJson: {
      search_term: SEARCH_TERM,
      totals: {
        sourceCount: 27, channelCount: 5, totalValue: 4250000,
        buildableResearchCount: 6, withDemandSignalCount: 11,
      },
      channel_breakdown: [
        { key: 'research', label: 'Research', count: 9, total_value: 0 },
        { key: 'government', label: 'Government', count: 8, total_value: 3100000 },
        { key: 'talent', label: 'Talent', count: 5, total_value: 0 },
        { key: 'freelance', label: 'Freelance', count: 3, total_value: 150000 },
        { key: 'capital', label: 'Capital', count: 2, total_value: 1000000 },
      ],
      market_timing_narrative: 'The research channel shows 6 buildable papers with working repos — '
        + 'the capability is real and shippable, not speculative. Government demand is the leading '
        + 'edge: 8 linked contracts totaling ~$3.1M signal that procurement is actively budgeting '
        + 'for this. That combination — proven capability plus concrete budgeted demand — is the '
        + 'definition of "emerging", not "too early".',
      opportunity_signals: [
        '8 linked government IT contracts (~$3.1M) indicate near-term procurement demand.',
        '6 research papers are flagged buildable and ship with public repos — low technical risk.',
        '5 open talent postings for agent engineers signal competitors are already staffing up.',
        '11 opportunities carry cross-channel demand links — the signal corroborates across channels.',
        'Capital channel shows 2 recent raises in the agent-ops space — investor validation exists.',
      ],
      government_alignment: 'Strong. The majority of disclosed value sits in government contracts, and '
        + 'set-aside-eligible procurement vehicles are present — a public-sector-first GTM is viable.',
      research_highlights: [
        'Memory-augmented agents now sustain multi-step workflows reliably enough for production use.',
        'Tool-orchestration benchmarks show agents reliably completing structured back-office tasks.',
        'Several papers ship evaluation harnesses — useful for the compliance story in a gov bid.',
      ],
      suggested_mvps: [
        'A constituent-services triage agent scoped to one agency workflow, shippable in a quarter.',
        'An internal "agent ops console" — human-in-the-loop review + audit log for agent actions.',
        'A procurement-document compliance checker built on the research eval harnesses.',
      ],
      monetization_strategy: 'Land with a fixed-fee government pilot (services revenue funds the build), '
        + 'then productize the delivered agent into a per-seat or per-workflow SaaS license sold across '
        + 'comparable agencies. The pilot de-risks the product; the product compounds the services margin.',
      build_recommendation: 'Build now. The capability is proven, the demand is budgeted, and the '
        + 'competitive window is open but closing — staffing signals show others moving.',
      trend_summary: 'Accelerating — research volume, procurement demand, and hiring are all rising '
        + 'month-over-month.',
      // Phase 2 — the intelligence engine outputs.
      correlation,
      market_timing: timing,
      generated_at: new Date().toISOString(),
    },
  });

  // Persist the cross-channel correlation row.
  await SignalCorrelation.create({
    reportId: report.id,
    correlationStrength: correlation.correlation_strength,
    acceleration: correlation.acceleration,
    convergenceType: correlation.convergence_type,
    signalBreakdown: correlation.signal_breakdown,
    supportingEvidence: correlation.supporting_evidence,
  });

  // Seed a representative monetization model set (AI-generated in a live
  // run; static here, but each fit_score is computed by the real engine).
  const { computeFitScore } = require('../src/deepResearch/monetizationIntelligence.service');
  const monetizationModels = [
    {
      modelType: 'government',
      pricingSuggestion: 'Fixed-fee pilot contracts $80k-250k, then $40k-90k/agency/yr maintenance.',
      idealIcp: 'State + municipal agencies with high-volume constituent operations.',
      revenueModel: 'Project revenue on the pilot, recurring license + support thereafter.',
      implementationComplexity: 'medium',
    },
    {
      modelType: 'saas',
      pricingSuggestion: 'Per-seat $50-120/user/mo for the Agent Ops Console, platform fee on top.',
      idealIcp: 'Regulated mid-market teams adopting agents who need a governance layer.',
      revenueModel: 'Recurring per-seat SaaS, expands with the customer\'s agent footprint.',
      implementationComplexity: 'medium',
    },
    {
      modelType: 'services',
      pricingSuggestion: 'T&M or fixed-scope delivery engagements, $25k-150k per build.',
      idealIcp: 'Agencies + contractors who want the agent built and integrated for them.',
      revenueModel: 'Project services revenue; funds the productized SaaS roadmap.',
      implementationComplexity: 'low',
    },
  ];
  for (const m of monetizationModels) {
    // eslint-disable-next-line no-await-in-loop
    await MonetizationModel.create({
      ...m,
      reportId: report.id,
      fitScore: computeFitScore(m.modelType, SAMPLE_CONTEXT),
      metadata: {},
    });
  }

  const ideas = [
    {
      title: 'Constituent Services Triage Agent',
      description: 'An AI agent that triages inbound constituent requests for a government agency — '
        + 'classifies, routes, drafts responses, and escalates edge cases to staff. Sold first as a '
        + 'scoped pilot, then licensed across comparable agencies.',
      monetizationStrategy: 'Fixed-fee pilot contract ($80-150k) funds the initial build, then a '
        + 'per-agency annual SaaS license ($40-90k/yr) once the workflow is proven. Services revenue '
        + 'de-risks the product; the license compounds.',
      marketTiming: 'emerging',
      buildabilityScore: 0.78,
      revenuePotential: 'high',
      mvpScope: 'One agency, one request category (e.g. permit inquiries): classify + route + draft, '
        + 'with full human review. Shippable in a quarter.',
      gtmSummary: 'Sell into an agency where Colaberry already has a relationship; use the pilot as '
        + 'the reference case for adjacent agencies.',
      metadata: {
        suggested_architecture: 'Reuse the existing classification + action-generation pipeline; '
          + 'net-new is the agency-specific workflow config and the human-review console.',
        target_customers: 'State and municipal agencies with high-volume constituent inboxes — '
          + 'evidenced by the 8 linked government IT contracts.',
      },
      sortOrder: 0,
    },
    {
      title: 'Agent Ops Console',
      description: 'A human-in-the-loop control plane for AI agents: review queue, audit log, '
        + 'approval gates, and rollback. The governance layer every regulated buyer needs before they '
        + 'will run agents in production.',
      monetizationStrategy: 'Per-seat SaaS for the ops team plus a platform fee. Positioned as the '
        + 'compliance/governance requirement that unlocks agent adoption — sold alongside any agent build.',
      marketTiming: 'emerging',
      buildabilityScore: 0.71,
      revenuePotential: 'high',
      mvpScope: 'Review queue + audit log + approve/reject gates for a single agent type. One quarter.',
      gtmSummary: 'Attach to every agent pilot as the "we can show your auditors exactly what the '
        + 'agent did" story — it is the procurement unlock, not an upsell.',
      metadata: {
        suggested_architecture: 'New service, but reuses the existing event log + RBAC primitives; '
          + 'the audit trail is the core net-new surface.',
        target_customers: 'Any regulated buyer adopting agents — government first, regulated '
          + 'enterprise second.',
      },
      sortOrder: 1,
    },
    {
      title: 'Procurement Compliance Checker',
      description: 'An agent that reads an RFP/solicitation and a vendor document set and produces a '
        + 'compliance matrix — what is required, what is on file, what is missing. Built on the '
        + 'evaluation harnesses from the research channel.',
      monetizationStrategy: 'Usage-based pricing per document set checked, plus a flat tier for '
        + 'frequent bidders. Natural cross-sell to the existing Submission Readiness users.',
      marketTiming: 'active',
      buildabilityScore: 0.83,
      revenuePotential: 'medium',
      mvpScope: 'Ingest one RFP + one vendor doc set, output a structured compliance matrix. '
        + 'Reuses pdf parsing + the AI client; net-new is the matrix logic.',
      gtmSummary: 'Ship into the existing Submission Readiness user base first — they already feel '
        + 'this pain — then sell standalone.',
      metadata: {
        suggested_architecture: 'Almost entirely reuses the Submission Readiness document pipeline; '
          + 'the compliance-matrix synthesis is the only net-new component.',
        target_customers: 'Small/mid government contractors who bid frequently — overlaps directly '
          + 'with the freelance + government channels in this report.',
      },
      sortOrder: 2,
    },
  ];

  // Score each venture idea with the REAL deterministic scoring engine,
  // then persist with its 8-dimension scores + composite + recommendation.
  let compositeSum = 0;
  for (const idea of ideas) {
    const scored = ventureScoring.scoreVenture(idea, {
      context: SAMPLE_CONTEXT, correlation, timing,
    });
    compositeSum += scored.composite_score;
    // eslint-disable-next-line no-await-in-loop
    await VentureIdea.create({
      ...idea,
      reportId: report.id,
      compositeScore: scored.composite_score,
      recommendationLevel: scored.recommendation_level,
      scores: scored.scores,
    });
  }
  // Report-level rollup.
  await report.update({
    commercializationScore: Number((compositeSum / ideas.length).toFixed(2)),
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    seeded: true,
    reportId: report.id,
    ventureIdeas: ideas.length,
    marketStage: timing.stage,
    convergence: correlation.convergence_type,
    correlationStrength: correlation.correlation_strength,
    monetizationModels: monetizationModels.length,
    url: `/admin/deep-research/${report.id}`,
  }));
  process.exit(0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('seed failed:', e.message);
  process.exit(1);
});
