/**
 * Prompt builders for the Action Engine LLM calls.
 * All prompts request JSON output format.
 */

function buildClassificationPrompt(opportunities) {
  const systemPrompt = `You are a strategic opportunity classifier for a business intelligence platform. Review opportunities that have been pre-classified by rules and provide enhanced reasoning or reclassification if the rules got it wrong.

Action types:
- BUILD: Create a product, tool, or integration based on this signal
- BID: Submit a formal bid/proposal for a contract
- APPLY: Apply for a job or grant
- PARTNER: Reach out for partnership, collaboration, or subcontracting
- INVEST: Financial investment or due diligence opportunity
- TEACH: Create educational content, training, or courses
- IGNORE: No actionable opportunity

Respond with valid JSON:
{
  "enrichments": [
    {
      "id": <opportunity_id>,
      "actionType": "<confirmed or corrected action type>",
      "confidence": <0-100>,
      "reasoning": "<2-3 sentence enhanced reasoning>"
    }
  ]
}`;

  const userPrompt = `Review these pre-classified opportunities and enhance the reasoning. Only change the action type if the rule-based classification is clearly wrong.

${JSON.stringify(opportunities, null, 2)}`;

  return { systemPrompt, userPrompt };
}

function buildActionPlanPrompt(opportunities) {
  const systemPrompt = `You are a strategic action advisor. Generate customized action plans for business opportunities. Each plan should be specific to the opportunity details and actionable.

Respond with valid JSON:
{
  "plans": [
    {
      "id": <opportunity_id>,
      "summary": "<1-2 sentence action summary>",
      "steps": [
        { "order": 1, "action": "<specific step>", "effort": "<low/medium/high>", "timeframe": "<e.g. 1-2 days>" }
      ],
      "estimatedEffort": "<total effort estimate>",
      "riskLevel": "<low/medium/high>",
      "keyConsiderations": ["<consideration 1>", "<consideration 2>"]
    }
  ]
}`;

  const userPrompt = `Generate customized action plans for these opportunities:

${JSON.stringify(opportunities, null, 2)}`;

  return { systemPrompt, userPrompt };
}

function buildExecutiveBriefPrompt(topOpportunities, trendData, marketStats) {
  const systemPrompt = `You are an executive intelligence advisor for the Opportunity Pulse platform. Generate a concise daily executive brief that helps decision-makers know exactly what to focus on today.

Respond with valid JSON:
{
  "headline": "<compelling 1-line summary of today's key insight>",
  "executiveSummary": "<2-3 sentences summarizing the market landscape>",
  "recommendedActions": [
    {
      "priority": 1,
      "action": "<specific action>",
      "opportunity": "<opportunity title>",
      "reasoning": "<why this is #1 priority>",
      "deadline": "<urgency note>"
    }
  ],
  "marketPulse": "<1-2 sentences on market conditions>",
  "riskFlags": ["<risk 1>", "<risk 2>"],
  "trendSignals": ["<trend 1>", "<trend 2>"]
}`;

  const userPrompt = `Generate today's executive brief based on this data:

## Top Opportunities (scored and classified)
${JSON.stringify(topOpportunities, null, 2)}

## Recent Trends
${JSON.stringify(trendData || {}, null, 2)}

## Market Statistics
${JSON.stringify(marketStats, null, 2)}

Focus on actionable insights. Prioritize "High Demand / Low Competition" opportunities.`;

  return { systemPrompt, userPrompt };
}

module.exports = {
  buildClassificationPrompt,
  buildActionPlanPrompt,
  buildExecutiveBriefPrompt,
};
