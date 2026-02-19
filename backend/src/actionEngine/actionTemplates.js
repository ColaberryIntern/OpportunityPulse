const { ACTION_TYPES } = require('../config/constants');

/**
 * Deterministic action plan templates per action type.
 * Returns a structured plan with steps, effort, and risk assessment.
 */

const TEMPLATES = {
  [ACTION_TYPES.BUILD]: {
    summary: 'Build a product, tool, or integration based on this opportunity signal',
    steps: [
      { order: 1, action: 'Research the technology/market gap identified', effort: 'medium', timeframe: '1-2 days' },
      { order: 2, action: 'Define MVP scope and technical requirements', effort: 'medium', timeframe: '1-2 days' },
      { order: 3, action: 'Build proof-of-concept or prototype', effort: 'high', timeframe: '1-2 weeks' },
      { order: 4, action: 'Validate with target users or early adopters', effort: 'medium', timeframe: '3-5 days' },
      { order: 5, action: 'Launch MVP and establish feedback loop', effort: 'medium', timeframe: '1 week' },
    ],
    estimatedEffort: '3-5 weeks',
    riskLevel: 'medium',
  },
  [ACTION_TYPES.BID]: {
    summary: 'Prepare and submit a competitive bid or proposal',
    steps: [
      { order: 1, action: 'Review full solicitation requirements and evaluation criteria', effort: 'low', timeframe: '1 day' },
      { order: 2, action: 'Assess team capabilities and identify gaps', effort: 'low', timeframe: '1 day' },
      { order: 3, action: 'Draft technical approach and management plan', effort: 'high', timeframe: '3-5 days' },
      { order: 4, action: 'Develop cost proposal with competitive pricing', effort: 'medium', timeframe: '2-3 days' },
      { order: 5, action: 'Internal review, finalize, and submit before deadline', effort: 'medium', timeframe: '1-2 days' },
    ],
    estimatedEffort: '1-2 weeks',
    riskLevel: 'medium',
  },
  [ACTION_TYPES.APPLY]: {
    summary: 'Prepare and submit an application',
    steps: [
      { order: 1, action: 'Review requirements and eligibility criteria', effort: 'low', timeframe: '1 day' },
      { order: 2, action: 'Tailor resume/proposal to specific requirements', effort: 'medium', timeframe: '1-2 days' },
      { order: 3, action: 'Prepare supporting documents and references', effort: 'medium', timeframe: '1-2 days' },
      { order: 4, action: 'Submit application and track status', effort: 'low', timeframe: '1 day' },
    ],
    estimatedEffort: '3-5 days',
    riskLevel: 'low',
  },
  [ACTION_TYPES.PARTNER]: {
    summary: 'Initiate partnership or collaboration outreach',
    steps: [
      { order: 1, action: 'Research the organization and identify key contacts', effort: 'low', timeframe: '1 day' },
      { order: 2, action: 'Craft personalized outreach with value proposition', effort: 'medium', timeframe: '1-2 days' },
      { order: 3, action: 'Schedule and conduct introductory meeting', effort: 'low', timeframe: '1 week' },
      { order: 4, action: 'Develop partnership proposal or teaming agreement', effort: 'medium', timeframe: '3-5 days' },
    ],
    estimatedEffort: '2-3 weeks',
    riskLevel: 'low',
  },
  [ACTION_TYPES.INVEST]: {
    summary: 'Conduct due diligence and evaluate investment opportunity',
    steps: [
      { order: 1, action: 'Review company fundamentals and market position', effort: 'medium', timeframe: '2-3 days' },
      { order: 2, action: 'Analyze financial statements and projections', effort: 'high', timeframe: '3-5 days' },
      { order: 3, action: 'Assess team, technology, and competitive moat', effort: 'medium', timeframe: '2-3 days' },
      { order: 4, action: 'Make go/no-go decision and execute investment', effort: 'low', timeframe: '1-2 days' },
    ],
    estimatedEffort: '1-2 weeks',
    riskLevel: 'high',
  },
  [ACTION_TYPES.TEACH]: {
    summary: 'Create educational content or training program',
    steps: [
      { order: 1, action: 'Define target audience and learning objectives', effort: 'low', timeframe: '1 day' },
      { order: 2, action: 'Outline curriculum and key topics', effort: 'medium', timeframe: '2-3 days' },
      { order: 3, action: 'Develop content (articles, videos, or course material)', effort: 'high', timeframe: '1-2 weeks' },
      { order: 4, action: 'Publish and promote through relevant channels', effort: 'medium', timeframe: '2-3 days' },
    ],
    estimatedEffort: '2-3 weeks',
    riskLevel: 'low',
  },
};

/**
 * Get a deterministic action template for an opportunity.
 * Interpolates opportunity-specific data into template variables.
 */
function getActionTemplate(actionType, opportunity) {
  const template = TEMPLATES[actionType];
  if (!template) return null;

  const deadline = opportunity.expiresAt
    ? new Date(opportunity.expiresAt).toLocaleDateString()
    : null;
  const value = opportunity.value
    ? `$${Number(opportunity.value).toLocaleString()}`
    : null;

  // Create a copy with opportunity-specific context
  return {
    ...template,
    summary: interpolateSummary(template.summary, opportunity, deadline, value),
    steps: template.steps.map((step) => ({
      ...step,
      action: interpolateStep(step.action, opportunity, deadline, value),
    })),
    context: {
      opportunityTitle: opportunity.title,
      opportunityType: opportunity.type,
      deadline,
      value,
      category: opportunity.category,
    },
  };
}

function interpolateSummary(summary, opp, deadline, value) {
  let result = summary;
  if (deadline) result += ` (deadline: ${deadline})`;
  if (value) result += ` — estimated value: ${value}`;
  return result;
}

function interpolateStep(action, opp, deadline, value) {
  return action
    .replace(/solicitation/g, opp.type === 'grant' ? 'grant application' : 'solicitation')
    .replace(/resume\/proposal/g, opp.type === 'ai_job' ? 'resume and cover letter' : 'proposal');
}

module.exports = { getActionTemplate, TEMPLATES };
