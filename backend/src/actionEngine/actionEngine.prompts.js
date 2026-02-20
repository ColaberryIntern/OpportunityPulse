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
  const systemPrompt = `You are an executive intelligence advisor for the Opportunity Pulse platform. Generate a daily executive brief that summarizes the ENTIRE market landscape — not just one deal.

CRITICAL: The headline and executive summary must reflect the breadth of all opportunities across types, sectors, and quadrants. Do NOT focus the headline on a single opportunity.

Respond with valid JSON:
{
  "headline": "<1-line summary of the overall market landscape, covering breadth across types and sectors>",
  "executiveSummary": "<2-3 sentences summarizing the full market: how many opportunities, which sectors are hottest, what the quadrant distribution tells us, and what's expiring soon>",
  "sectorHighlights": [
    {
      "sector": "<domain/sector name>",
      "summary": "<2 sentences about activity in this sector>",
      "count": <number of opportunities>
    }
  ],
  "recommendedActions": [
    {
      "priority": 1,
      "action": "<specific action>",
      "opportunity": "<opportunity title>",
      "reasoning": "<why this is a priority>",
      "deadline": "<urgency note>"
    }
  ],
  "marketPulse": "<1-2 sentences on overall market conditions and momentum>",
  "riskFlags": ["<risk 1>", "<risk 2>"],
  "trendSignals": ["<trend 1>", "<trend 2>"]
}

Guidelines:
- sectorHighlights should cover the top 3-5 sectors from the domain breakdown
- recommendedActions should include 3-5 top priority actions from different opportunity types
- The brief should help someone understand the FULL picture in 60 seconds`;

  const userPrompt = `Generate today's executive brief based on this data:

## Market Overview
- Total active opportunities: ${marketStats.totalActive}
- Classified & actionable: ${marketStats.classified}
- Average AI score: ${marketStats.averageScore}/100
- Expiring within 7 days: ${marketStats.expiringSoon || 0}

## Opportunity Type Distribution
${JSON.stringify(marketStats.typeCounts || {}, null, 2)}

## Quadrant Distribution
${JSON.stringify(marketStats.quadrantCounts || {}, null, 2)}

## AI Domain Breakdown (top sectors)
${JSON.stringify(marketStats.domainBreakdown || [], null, 2)}

## Top 20 Scored Opportunities
${JSON.stringify(topOpportunities, null, 2)}

## Recent Trends
${JSON.stringify(trendData || {}, null, 2)}

## Tool Momentum (top accelerating AI tools)
${JSON.stringify(marketStats.topMomentumTools || [], null, 2)}

Synthesize the full market landscape. Prioritize "High Demand / Low Competition" opportunities in recommended actions. If tool momentum data is available, mention key accelerating tools in trend signals.`;

  return { systemPrompt, userPrompt };
}

module.exports = {
  buildClassificationPrompt,
  buildActionPlanPrompt,
  buildExecutiveBriefPrompt,
};
