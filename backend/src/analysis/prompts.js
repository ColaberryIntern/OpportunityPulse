const SCORING_SYSTEM_PROMPT = `You are an expert analyst evaluating opportunities for relevance and quality.
Score each opportunity from 0-100 based on:
- Market relevance and demand (25 points)
- Value/compensation alignment (25 points)
- Growth potential (25 points)
- Accessibility and feasibility (25 points)

Respond with valid JSON in this exact format:
{
  "scores": [
    {
      "id": <opportunity_id>,
      "score": <0-100>,
      "reasoning": "<brief 1-2 sentence reasoning>",
      "highlights": ["<key_strength_1>", "<key_strength_2>"]
    }
  ]
}`;

const TREND_SYSTEM_PROMPT = `You are a market analyst identifying trends in opportunity data.
Analyze the provided aggregated data and identify:
- Emerging trends (growing categories or sectors)
- Declining trends (shrinking areas)
- Notable patterns or anomalies

Respond with valid JSON in this exact format:
{
  "trends": [
    {
      "name": "<trend_name>",
      "direction": "emerging" | "stable" | "declining",
      "confidence": <0.0-1.0>,
      "description": "<brief description>",
      "evidence": "<supporting data point>"
    }
  ],
  "summary": "<2-3 sentence overall summary>"
}`;

const INSIGHT_SYSTEM_PROMPT = `You are a strategic advisor generating a weekly intelligence briefing.
Combine scoring results, trends, and top opportunities into actionable insights.

Respond with valid JSON in this exact format:
{
  "title": "<Weekly Intelligence Briefing - [date range]>",
  "executiveSummary": "<3-4 sentence high-level summary>",
  "keyFindings": [
    {
      "finding": "<key finding>",
      "impact": "high" | "medium" | "low",
      "recommendation": "<actionable recommendation>"
    }
  ],
  "topOpportunities": [
    {
      "id": <opportunity_id>,
      "title": "<title>",
      "whyNotable": "<brief reason>"
    }
  ],
  "outlook": "<2-3 sentence forward-looking statement>"
}`;

function buildScoringUserPrompt(opportunities) {
  const items = opportunities.map((opp) => ({
    id: opp.id,
    type: opp.type,
    title: opp.title,
    description: opp.description ? opp.description.substring(0, 500) : '',
    category: opp.category,
    value: opp.value,
    location: opp.location,
    tags: opp.tags,
  }));
  return `Score the following ${items.length} opportunities:\n\n${JSON.stringify(items, null, 2)}`;
}

function buildTrendUserPrompt(aggregations, type) {
  return `Analyze the following ${type} opportunity aggregations from the past weeks:\n\n${JSON.stringify(aggregations, null, 2)}`;
}

function buildInsightUserPrompt(scoringSummary, trends, topOpportunities) {
  return `Generate a weekly intelligence briefing based on:\n\nScoring Summary:\n${JSON.stringify(scoringSummary, null, 2)}\n\nTrends:\n${JSON.stringify(trends, null, 2)}\n\nTop Opportunities:\n${JSON.stringify(topOpportunities, null, 2)}`;
}

module.exports = {
  SCORING_SYSTEM_PROMPT,
  TREND_SYSTEM_PROMPT,
  INSIGHT_SYSTEM_PROMPT,
  buildScoringUserPrompt,
  buildTrendUserPrompt,
  buildInsightUserPrompt,
};
