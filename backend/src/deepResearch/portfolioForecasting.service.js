// Deep Research Phase 4 — portfolio ROI forecasting.
//
// Deterministic. Forecasts revenue + costs + break-even + 12-month ROI for
// each venture under three scenarios (optimistic / realistic / conservative).
// Then rolls everything up into a portfolio-level forecast.
//
// MRR is estimated by parsing the venture's monetization model pricing
// strings (heuristic regex — see parsePricingDollars). Costs are computed
// deterministically from the venture's Phase 3 staffing + infrastructure
// + MVP timeline. Scenarios are honest multipliers applied to the same
// realistic baseline, so the optimistic/realistic/conservative spread is
// auditable.

const { v4: uuid } = (() => {
  // crypto.randomUUID is available in Node 20+ — fall back to a date+rand
  // composite if it isn't, so the service is portable.
  try { return { v4: () => require('crypto').randomUUID() }; }
  catch (e) { return { v4: () => `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }; }
})();
const {
  VentureIdea, ExecutionReadiness, MonetizationModel, RoiForecast,
} = require('../models');

// Tunables — env-overridable so different teams can model their own economics.
const AVG_WEEKLY_RATE = Number(process.env.DEEP_RESEARCH_AVG_WEEKLY_RATE) || 4000;
const INFRA_MONTHLY_PER_ITEM = Number(process.env.DEEP_RESEARCH_INFRA_MONTHLY_PER_ITEM) || 200;
// Default monthly customer count if pricing parses but adoption isn't given.
const DEFAULT_MONTHLY_CUSTOMERS = Number(process.env.DEEP_RESEARCH_DEFAULT_CUSTOMERS) || 8;

const SCENARIOS = ['optimistic', 'realistic', 'conservative'];
const SCENARIO_MULT = {
  optimistic: { mrr: 1.5, cost: 0.85 },
  realistic: { mrr: 1.0, cost: 1.0 },
  conservative: { mrr: 0.5, cost: 1.2 },
};

// Parse dollar amounts from a pricing string. Handles "$50/seat/mo",
// "$80-150k pilot", "$2.5M ARR", commas, etc. Returns { amount, unit } where
// unit is one of 'monthly' | 'annual' | 'project' | 'unknown'.
function parsePricingDollars(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  // First $ amount with optional k/m suffix, possibly a hyphenated range.
  const m = t.match(/\$\s*([\d,.]+)\s*(k|m)?(?:\s*[-–]\s*\$?([\d,.]+)\s*(k|m)?)?/);
  if (!m) return null;
  const toAmount = (numStr, suf) => {
    let n = parseFloat(String(numStr).replace(/,/g, ''));
    if (Number.isNaN(n)) return 0;
    if (suf === 'k') n *= 1000;
    else if (suf === 'm') n *= 1000000;
    return n;
  };
  const a = toAmount(m[1], m[2]);
  const b = m[3] ? toAmount(m[3], m[4]) : null;
  const amount = b ? (a + b) / 2 : a;
  // Recurrence unit.
  let unit = 'unknown';
  if (/\/\s*mo|\bmonth|\/month\b|monthly/.test(t)) unit = 'monthly';
  else if (/\/\s*yr|\byear|\/year\b|annual|arr/.test(t)) unit = 'annual';
  else if (/pilot|contract|project|fixed[- ]fee|one[- ]time/.test(t)) unit = 'project';
  return { amount, unit };
}

// Convert a parsed pricing point to a monthly per-customer figure.
function toMonthlyPerCustomer(parsed) {
  if (!parsed) return 0;
  if (parsed.unit === 'monthly') return parsed.amount;
  if (parsed.unit === 'annual') return parsed.amount / 12;
  // Project / unknown: amortize a project fee over 12 months as a rough
  // monthly contribution.
  return parsed.amount / 12;
}

// Estimate the realistic monthly MRR for a venture from its monetization
// models. Picks the highest-fit model's pricing as the base; multiplies by
// an adoption ramp (default customers).
function estimateRealisticMrr(monetizationModels) {
  if (!monetizationModels || monetizationModels.length === 0) return 0;
  const sorted = monetizationModels.slice().sort(
    (a, b) => Number(b.fitScore || b.fit_score || 0) - Number(a.fitScore || a.fit_score || 0),
  );
  for (const m of sorted) {
    const parsed = parsePricingDollars(m.pricingSuggestion || m.pricing_suggestion);
    if (!parsed) continue;
    const perCustomer = toMonthlyPerCustomer(parsed);
    if (perCustomer > 0) return perCustomer * DEFAULT_MONTHLY_CUSTOMERS;
  }
  return 0;
}

// Compute the cost baseline (realistic). Pure.
function estimateRealisticCosts(executionReadiness) {
  if (!executionReadiness) return { staffing_cost: 0, infra_cost: 0, implementation_cost: 0 };
  const staffing = executionReadiness.staffing || {};
  const headcount = Number(staffing.headcount) || (Array.isArray(staffing.roles) ? staffing.roles.length : 0);
  const weeks = Number(executionReadiness.mvpTimelineWeeks || executionReadiness.mvp_timeline_weeks) || 12;
  const staffingCost = Math.round(headcount * AVG_WEEKLY_RATE * weeks);
  const infraItems = (executionReadiness.infrastructure && Array.isArray(executionReadiness.infrastructure.items))
    ? executionReadiness.infrastructure.items.length : 0;
  // Infra cost for the first 12 months.
  const infraCost = Math.round(infraItems * INFRA_MONTHLY_PER_ITEM * 12);
  return {
    staffing_cost: staffingCost,
    infra_cost: infraCost,
    implementation_cost: staffingCost + infraCost,
  };
}

// Apply the scenario multipliers to a realistic baseline.
function applyScenario(baseline, scenario) {
  const m = SCENARIO_MULT[scenario] || SCENARIO_MULT.realistic;
  const mrr = Math.round((baseline.mrr || 0) * m.mrr);
  const staffing = Math.round((baseline.staffing_cost || 0) * m.cost);
  const infra = Math.round((baseline.infra_cost || 0) * m.cost);
  const implementation = staffing + infra;
  const annualRevenue = mrr * 12;
  let breakeven = null;
  if (mrr > 0) {
    breakeven = Number((implementation / mrr).toFixed(2));
    if (breakeven > 60 || breakeven < 0) breakeven = null;
  }
  const roi = implementation > 0
    ? Number(((annualRevenue - implementation) / implementation).toFixed(3))
    : null;
  return {
    scenario,
    projected_mrr: mrr,
    staffing_cost: staffing,
    infra_cost: infra,
    implementation_cost: implementation,
    breakeven_months: breakeven,
    projected_roi_12mo: roi,
  };
}

// Forecast all three scenarios for one venture.
function forecastVenture(ventureIdea, executionReadiness, monetizationModels) {
  const baseline = {
    mrr: estimateRealisticMrr(monetizationModels),
    ...estimateRealisticCosts(executionReadiness),
  };
  const scenarios = {};
  for (const s of SCENARIOS) scenarios[s] = applyScenario(baseline, s);
  return { baseline, scenarios };
}

// Run the full portfolio forecast: per-venture + rolled-up portfolio totals.
// Persists rows under a single run_id. Returns the analysis.
async function forecastPortfolio() {
  const runId = uuid();
  const ventureIdeas = await VentureIdea.findAll();
  const readinessRows = await ExecutionReadiness.findAll();
  const monetizationRows = await MonetizationModel.findAll();
  const readinessByVenture = new Map(readinessRows.map((r) => [r.ventureIdeaId, r]));
  const monetizationByReport = new Map();
  for (const m of monetizationRows) {
    if (!monetizationByReport.has(m.reportId)) monetizationByReport.set(m.reportId, []);
    monetizationByReport.get(m.reportId).push(m);
  }

  const perVenture = [];
  // Portfolio totals per scenario.
  const portfolioTotals = {};
  for (const s of SCENARIOS) {
    portfolioTotals[s] = { mrr: 0, staffing: 0, infra: 0, implementation: 0 };
  }

  for (const v of ventureIdeas) {
    const er = readinessByVenture.get(v.id);
    const models = monetizationByReport.get(v.reportId) || [];
    const f = forecastVenture(v, er, models);
    perVenture.push({ venture_idea_id: v.id, title: v.title, ...f });
    for (const s of SCENARIOS) {
      portfolioTotals[s].mrr += f.scenarios[s].projected_mrr || 0;
      portfolioTotals[s].staffing += f.scenarios[s].staffing_cost || 0;
      portfolioTotals[s].infra += f.scenarios[s].infra_cost || 0;
      portfolioTotals[s].implementation += f.scenarios[s].implementation_cost || 0;
      // eslint-disable-next-line no-await-in-loop
      await RoiForecast.create({
        ventureIdeaId: v.id,
        scope: 'venture',
        scenario: s,
        projectedMrr: f.scenarios[s].projected_mrr,
        implementationCost: f.scenarios[s].implementation_cost,
        staffingCost: f.scenarios[s].staffing_cost,
        infraCost: f.scenarios[s].infra_cost,
        breakevenMonths: f.scenarios[s].breakeven_months,
        projectedRoi12mo: f.scenarios[s].projected_roi_12mo,
        metadata: { baseline: f.baseline },
        runId,
      });
    }
  }

  // Portfolio rollup rows.
  const portfolio = {};
  for (const s of SCENARIOS) {
    const t = portfolioTotals[s];
    const annual = t.mrr * 12;
    const breakeven = t.mrr > 0
      ? Math.min(60, Number((t.implementation / t.mrr).toFixed(2))) : null;
    const roi = t.implementation > 0
      ? Number(((annual - t.implementation) / t.implementation).toFixed(3)) : null;
    portfolio[s] = {
      scenario: s,
      projected_mrr: t.mrr,
      staffing_cost: t.staffing,
      infra_cost: t.infra,
      implementation_cost: t.implementation,
      breakeven_months: breakeven,
      projected_roi_12mo: roi,
    };
    // eslint-disable-next-line no-await-in-loop
    await RoiForecast.create({
      ventureIdeaId: null,
      scope: 'portfolio',
      scenario: s,
      projectedMrr: t.mrr,
      implementationCost: t.implementation,
      staffingCost: t.staffing,
      infraCost: t.infra,
      breakevenMonths: breakeven,
      projectedRoi12mo: roi,
      metadata: { venture_count: ventureIdeas.length },
      runId,
    });
  }

  return { run_id: runId, per_venture: perVenture, portfolio };
}

// Read the most recent forecast run.
async function getLatestForecast() {
  const latest = await RoiForecast.findOne({ order: [['created_at', 'DESC']], attributes: ['runId'] });
  if (!latest) return null;
  const runId = latest.runId;
  const rows = await RoiForecast.findAll({ where: { runId }, order: [['scope', 'ASC'], ['scenario', 'ASC']] });
  const perVenture = {};
  const portfolio = {};
  for (const r of rows) {
    if (r.scope === 'portfolio') portfolio[r.scenario] = r.toJSON();
    else {
      if (!perVenture[r.ventureIdeaId]) perVenture[r.ventureIdeaId] = {};
      perVenture[r.ventureIdeaId][r.scenario] = r.toJSON();
    }
  }
  return { run_id: runId, per_venture: perVenture, portfolio };
}

module.exports = {
  SCENARIOS,
  SCENARIO_MULT,
  parsePricingDollars,
  toMonthlyPerCustomer,
  estimateRealisticMrr,
  estimateRealisticCosts,
  applyScenario,
  forecastVenture,
  forecastPortfolio,
  getLatestForecast,
};
