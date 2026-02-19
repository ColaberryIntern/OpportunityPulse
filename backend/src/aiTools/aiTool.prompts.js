// === TOOL MENTION EXTRACTION ===
const TOOL_EXTRACTION_SYSTEM_PROMPT = `You are an AI tools analyst. Given a batch of news articles and posts about AI technology, identify which specific AI tools, platforms, or products are mentioned.

For each tool mentioned, classify:
- The tool name (use canonical form, e.g., "ChatGPT" not "chat gpt", "GitHub Copilot" not "copilot")
- Whether this is a major update announcement, a review, a comparison, or a passing mention
- The sentiment toward the tool (positive/neutral/negative)
- A 1-sentence snippet summarizing the mention

Only include well-known AI tools and platforms. Ignore generic terms like "AI" or "machine learning" without a specific tool reference.

Respond with valid JSON:
{
  "mentions": [
    {
      "articleId": <id_from_input>,
      "toolName": "<canonical_tool_name>",
      "significance": "major_update" | "review" | "comparison" | "mention",
      "sentiment": "positive" | "neutral" | "negative",
      "snippet": "<1-sentence summary of the mention>"
    }
  ]
}

If no AI tools are mentioned in any articles, return {"mentions": []}.`;

/**
 * Build the user prompt for tool mention extraction.
 * @param {Array<{id: number, title: string, description: string, source: string, publishedAt: Date}>} articles
 * @returns {string}
 */
function buildToolExtractionUserPrompt(articles) {
  const formatted = articles.map(a =>
    `[ID: ${a.id}] "${a.title}"\n${(a.description || '').substring(0, 200)}`
  ).join('\n\n');

  return `Analyze these ${articles.length} AI news articles for specific AI tool mentions:\n\n${formatted}`;
}

// === TOOL TREND SCORING ===
const TOOL_TREND_SYSTEM_PROMPT = `You are an AI market analyst. Given aggregated mention data for AI tools over the past 7 days, compute trending scores and generate insight summaries.

For each tool, consider:
- Number of mentions (volume) — more mentions = higher score
- Sentiment distribution — positive sentiment boosts score
- Significance of mentions — major_update mentions weigh 5x more than passing mentions
- Context of the tool's usual mention rate
- GitHub stars (if provided) — tools with >10k stars are well-established; rapid growth indicates trending
- Product Hunt votes (if provided) — high votes indicate consumer interest

Score from 0-100 where:
- 90-100: Viral/breaking (major launch, critical update)
- 70-89: Hot trending (significant buzz)
- 50-69: Moderately active
- 30-49: Steady/stable
- 0-29: Quiet/declining

Also provide industry-level trends showing which industries are seeing the most AI tool activity.

Respond with valid JSON:
{
  "toolScores": [
    {
      "toolName": "<name>",
      "trendingScore": <0-100>,
      "trendDirection": "rising" | "stable" | "declining",
      "sentimentScore": <-1.0 to 1.0>,
      "whyTrending": "<1-2 sentence explanation of why this tool is trending or notable right now>",
      "majorUpdate": null | "<brief description of major update if detected>"
    }
  ],
  "industryTrends": [
    {
      "industry": "<name>",
      "topTools": ["<tool1>", "<tool2>", "<tool3>"],
      "summary": "<1-sentence industry AI tool trend>"
    }
  ]
}`;

/**
 * Build the user prompt for tool trend scoring.
 * @param {Array<{name: string, mentionCount: number, sentimentBreakdown: Object, significanceBreakdown: Object, industries: string[]}>} toolAggregations
 * @returns {string}
 */
function buildToolTrendUserPrompt(toolAggregations) {
  const formatted = toolAggregations.map(t => {
    let line = `${t.name}: ${t.mentionCount} mentions (${t.sentimentBreakdown.positive} positive, ${t.sentimentBreakdown.neutral} neutral, ${t.sentimentBreakdown.negative} negative) | Significance: ${t.significanceBreakdown.major_update} major updates, ${t.significanceBreakdown.review} reviews, ${t.significanceBreakdown.comparison} comparisons, ${t.significanceBreakdown.mention} mentions | Industries: ${t.industries.join(', ')}`;
    if (t.githubStars) line += ` | GitHub: ${t.githubStars.toLocaleString()} stars`;
    if (t.productHuntVotes) line += ` | Product Hunt: ${t.productHuntVotes} votes`;
    return line;
  }).join('\n');

  return `Analyze the following AI tool mention data from the past 7 days and compute trending scores:\n\n${formatted}`;
}

// === NEW TOOL CATEGORIZATION ===
const TOOL_CATEGORIZATION_SYSTEM_PROMPT = `You are an AI industry analyst. Given information about an AI tool or platform, categorize it and assess its industry relevance.

Available categories: LLM, Image Generation, Code Assistant, Audio/Speech, Video, Analytics, Automation, Search, Writing, Design, Data Science, Other

Available industries: Technology, Education, Finance, Healthcare, Marketing, Research, Media, Design, E-commerce, Entertainment, Legal, Government, Advertising, Gaming, Corporate, Consulting, Sales, Publishing, Small Business, Startups, SaaS, Social Media, Retail, Manufacturing, Real Estate, Human Resources, Customer Service

Respond with valid JSON:
{
  "name": "<canonical_tool_name>",
  "category": "<category>",
  "subcategory": "<more_specific_classification>",
  "industries": ["<industry1>", "<industry2>"],
  "description": "<2-3 sentence description of what the tool does>",
  "vendor": "<company_name>",
  "pricingTier": "free" | "freemium" | "paid" | "enterprise",
  "tags": ["<tag1>", "<tag2>"]
}`;

/**
 * Build the user prompt for tool categorization.
 * @param {{name: string, context?: string, source?: string}} toolInfo
 * @returns {string}
 */
function buildToolCategorizationUserPrompt(toolInfo) {
  return `Categorize this AI tool:\nName: ${toolInfo.name}\nContext: ${toolInfo.context || 'No additional context'}\nSource: ${toolInfo.source || 'Unknown'}`;
}

module.exports = {
  TOOL_EXTRACTION_SYSTEM_PROMPT,
  TOOL_TREND_SYSTEM_PROMPT,
  TOOL_CATEGORIZATION_SYSTEM_PROMPT,
  buildToolExtractionUserPrompt,
  buildToolTrendUserPrompt,
  buildToolCategorizationUserPrompt,
};
