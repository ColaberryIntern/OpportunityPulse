const { ACTION_TYPES } = require('../config/constants');

/**
 * Classify an opportunity into an action type using deterministic rules.
 * Zero API calls — pure logic based on opportunity attributes.
 *
 * @param {Object} opportunity - Sequelize Opportunity instance or plain object
 * @returns {{ actionType: string, confidenceScore: number, reasoning: string }}
 */
function classifyByRules(opportunity) {
  const type = opportunity.type;
  const score = parseFloat(opportunity.aiScore) || 0;
  const value = parseFloat(opportunity.value) || 0;
  const tags = (opportunity.tags || []).map((t) => t.toLowerCase());
  const now = new Date();
  const expiresAt = opportunity.expiresAt ? new Date(opportunity.expiresAt) : null;
  const daysUntilExpiry = expiresAt ? (expiresAt - now) / (1000 * 60 * 60 * 24) : Infinity;

  switch (type) {
    case 'gov_contract':
      return classifyGovContract(score, value, daysUntilExpiry);
    case 'ai_job':
      return classifyAiJob(score);
    case 'grant':
      return classifyGrant(score, daysUntilExpiry);
    case 'investment':
      return classifyInvestment(score, value);
    case 'ai_news':
      return classifyAiNews(score, tags);
    case 'freelance':
      return classifyFreelance(score, value, tags);
    case 'research':
      return classifyResearch(opportunity, score, tags);
    default:
      return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 50, reasoning: `Unknown opportunity type: ${type}` };
  }
}

// Research Intelligence Phase 1 — high-priority research topics from the
// expansion plan's "Intelligent Filtering" section. A research opp that
// touches these is worth a BUILD/PARTNER look; everything else is noise
// the channel still surfaces but classifies as IGNORE so it doesn't crowd
// the action queue.
const RESEARCH_HIGH_PRIORITY = [
  'multi-agent', 'multiagent', 'agent', 'llm orchestration', 'orchestration',
  'ai infrastructure', 'reasoning', 'memory', 'retrieval', 'rag',
  'observability', 'evaluation', 'eval', 'benchmark', 'autonomous',
  'workflow automation', 'ai coding', 'code generation', 'enterprise ai',
  'edge ai', 'ai governance', 'fine-tuning', 'inference',
];

function classifyResearch(opportunity, score, tags) {
  const haystack = [
    opportunity.title || '',
    opportunity.description || '',
    ...(tags || []),
    ...((opportunity.sourceData && opportunity.sourceData.domains) || []),
  ].join(' ').toLowerCase();
  const matchedTopics = RESEARCH_HIGH_PRIORITY.filter((kw) => haystack.includes(kw));
  const sd = opportunity.sourceData || {};
  // Community-traction signal: S2 citations or HF upvotes. Either being
  // high is a strong "people care about this" indicator.
  const traction = Math.max(
    Number(sd.citationCount) || 0,
    Number(sd.upvotes) || 0,
  );
  const hasRepo = !!sd.githubRepo;

  if (matchedTopics.length === 0) {
    return {
      actionType: ACTION_TYPES.IGNORE,
      confidenceScore: 70,
      reasoning: 'Research outside Colaberry\'s high-priority AI topics — surfaced in the channel but not actionable',
    };
  }
  // On-topic + has a GitHub repo or strong traction → buildable signal.
  if (hasRepo || traction >= 40) {
    return {
      actionType: ACTION_TYPES.BUILD,
      confidenceScore: 78,
      reasoning: `On-topic research (${matchedTopics.slice(0, 3).join(', ')})`
        + `${hasRepo ? ' with a public repo' : ''}`
        + `${traction >= 40 ? ` · traction ${traction}` : ''} — evaluate for a build`,
    };
  }
  // On-topic but early (no repo, low traction) → worth watching / partner.
  return {
    actionType: ACTION_TYPES.PARTNER,
    confidenceScore: 60,
    reasoning: `On-topic research (${matchedTopics.slice(0, 3).join(', ')}) — early-stage; watch or reach out to the authors`,
  };
}

function classifyGovContract(score, value, daysUntilExpiry) {
  if (daysUntilExpiry < 7) {
    return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 85, reasoning: 'Expiring within 7 days — insufficient time to prepare bid' };
  }
  if (value >= 25000 && score >= 50) {
    return { actionType: ACTION_TYPES.BID, confidenceScore: 90, reasoning: `High-value contract ($${(value / 1000).toFixed(0)}k) with strong AI score (${score}) — direct bid recommended` };
  }
  if (value < 25000 && score >= 40) {
    return { actionType: ACTION_TYPES.PARTNER, confidenceScore: 70, reasoning: `Lower value contract — consider partnering with prime contractor` };
  }
  if (score < 40) {
    return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 85, reasoning: `Low AI relevance score (${score}) — not aligned with capabilities` };
  }
  return { actionType: ACTION_TYPES.BID, confidenceScore: 60, reasoning: 'Moderate opportunity — evaluate fit before bidding' };
}

function classifyAiJob(score) {
  if (score >= 60) {
    return { actionType: ACTION_TYPES.APPLY, confidenceScore: 88, reasoning: `Strong profile match (score: ${score}) — apply directly` };
  }
  if (score >= 40) {
    return { actionType: ACTION_TYPES.APPLY, confidenceScore: 65, reasoning: `Moderate match (score: ${score}) — consider applying with tailored cover` };
  }
  return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 75, reasoning: `Low relevance (score: ${score}) — likely not aligned with profile` };
}

function classifyGrant(score, daysUntilExpiry) {
  if (daysUntilExpiry < 14) {
    return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 80, reasoning: 'Grant deadline too close — insufficient preparation time' };
  }
  if (score >= 50) {
    return { actionType: ACTION_TYPES.APPLY, confidenceScore: 85, reasoning: `Good grant match (score: ${score}) with adequate preparation time` };
  }
  return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 70, reasoning: `Low relevance (score: ${score}) for grant application effort` };
}

function classifyInvestment(score, value) {
  if (value >= 100000 && score >= 60) {
    return { actionType: ACTION_TYPES.INVEST, confidenceScore: 80, reasoning: `High-value investment ($${(value / 1000).toFixed(0)}k) with strong alignment (score: ${score})` };
  }
  if (score >= 40 && !value) {
    return { actionType: ACTION_TYPES.PARTNER, confidenceScore: 60, reasoning: 'Investment opportunity without disclosed value — explore partnership' };
  }
  if (score < 40) {
    return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 70, reasoning: `Low relevance (score: ${score}) — not a priority investment target` };
  }
  return { actionType: ACTION_TYPES.PARTNER, confidenceScore: 55, reasoning: 'Moderate investment opportunity — partnership may reduce risk' };
}

function classifyAiNews(score, tags) {
  const toolTags = ['tool', 'api', 'sdk', 'framework', 'library', 'platform', 'open-source', 'launch'];
  const hiringTags = ['hiring', 'partnership', 'acquisition', 'collaboration', 'merger'];
  const teachTags = ['tutorial', 'course', 'training', 'education', 'certification', 'guide'];

  if (tags.some((t) => toolTags.some((tt) => t.includes(tt)))) {
    return { actionType: ACTION_TYPES.BUILD, confidenceScore: 75, reasoning: 'AI tool/platform news — build or integrate opportunity' };
  }
  if (tags.some((t) => hiringTags.some((ht) => t.includes(ht)))) {
    return { actionType: ACTION_TYPES.PARTNER, confidenceScore: 65, reasoning: 'Hiring/partnership activity — outreach opportunity' };
  }
  if (tags.some((t) => teachTags.some((et) => t.includes(et)))) {
    return { actionType: ACTION_TYPES.TEACH, confidenceScore: 70, reasoning: 'Educational content opportunity — create training/content' };
  }
  if (score >= 60) {
    return { actionType: ACTION_TYPES.BUILD, confidenceScore: 55, reasoning: `High-relevance AI news (score: ${score}) — build opportunity` };
  }
  return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 60, reasoning: 'General AI news — no immediate action required' };
}

function classifyFreelance(score, value, tags) {
  const saasKeywords = ['saas', 'product', 'platform', 'mvp', 'startup', 'recurring', 'subscription'];
  const hasSaasPotential = tags.some((t) => saasKeywords.some((k) => t.includes(k)));

  if (value < 1000 && value > 0) {
    return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 80, reasoning: `Low budget ($${value}) — too small for strategic value` };
  }
  if (value >= 5000 && score >= 60) {
    return { actionType: ACTION_TYPES.APPLY, confidenceScore: 88, reasoning: `High-value freelance project ($${(value / 1000).toFixed(0)}k) with strong match (score: ${score}) — submit proposal` };
  }
  if (hasSaasPotential && score >= 50) {
    return { actionType: ACTION_TYPES.BUILD, confidenceScore: 75, reasoning: 'SaaS/product conversion opportunity — build reusable solution' };
  }
  if (score >= 50) {
    return { actionType: ACTION_TYPES.APPLY, confidenceScore: 65, reasoning: `Good match (score: ${score}) — consider submitting a tailored proposal` };
  }
  if (score < 30) {
    return { actionType: ACTION_TYPES.IGNORE, confidenceScore: 75, reasoning: `Low relevance (score: ${score}) — not aligned with skills` };
  }
  return { actionType: ACTION_TYPES.APPLY, confidenceScore: 55, reasoning: 'Moderate freelance opportunity — evaluate scope before proposing' };
}

module.exports = { classifyByRules };
