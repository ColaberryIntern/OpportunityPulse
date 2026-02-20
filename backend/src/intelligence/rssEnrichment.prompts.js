/**
 * Prompt builders for RSS Intelligence Enrichment LLM fallback.
 * Used when deterministic extractors find no signals but text looks promising.
 * Follows the pattern of actionEngine.prompts.js — requests JSON output.
 */

const RSS_ENRICHMENT_SYSTEM_PROMPT = `You are a structured intelligence extractor for an AI market intelligence platform. Your job is to extract actionable signals from news articles and opportunity descriptions.

Extract ONLY signals that are explicitly stated or strongly implied in the text. Do NOT infer or guess.

For each article, extract up to 4 signal types:

1. **budget** — Government or corporate budget allocation for AI/technology:
   - entityName: The organization allocating the budget (e.g. "DoD", "JPMorgan")
   - allocationAmount: Dollar amount as a number (e.g. 500000000 for $500M)
   - fiscalYear: Fiscal year if mentioned (e.g. "2026" or "FY26")
   - domainGuess: One of: defense_ai, healthcare_ai, finance_ai, energy_ai, education_ai, ai_governance, gov_modernization_ai, or null
   - deltaPercentage: Percentage change if mentioned (positive = increase, negative = decrease), or null
   - confidence: 0-1 confidence score

2. **actor** — A company winning a contract, receiving an award, or being selected as vendor:
   - actorName: Company name (e.g. "Palantir Technologies")
   - awardAmount: Dollar amount as a number, or null
   - awardingEntity: Organization giving the award (e.g. "US Army")
   - role: One of: prime_contractor, subcontractor, grant_recipient, vendor
   - domainGuess: Same domain values as above, or null

3. **enterprise** — A company adopting, deploying, or scaling AI:
   - companyName: Company name
   - activityType: One of: deployment, scaling, launch, integration, rollout, transformation, hiring, adoption
   - estimatedSpendSignal: Dollar amount if mentioned, or null
   - capabilityGuess: One of: nlp, computer_vision, ml_ops, generative_ai, robotics, cybersecurity, or null
   - confidence: 0-1 confidence score

4. **compliance** — Regulatory, compliance, or governance action related to AI:
   - jurisdiction: One of: EU, US-Federal, US-State, UK, China, Unknown
   - regulationType: One of: comprehensive_regulation, audit_requirement, enforcement_action, investigation, mandate, legislation, executive_order, safety_standard, governance_framework, general
   - enforcementSeverity: One of: high, medium, low
   - expectedSpendPressure: One of: high, medium, low

Respond with valid JSON:
{
  "articles": [
    {
      "index": <0-based index of the article>,
      "budget": { ... } or null,
      "actor": { ... } or null,
      "enterprise": { ... } or null,
      "compliance": { ... } or null
    }
  ]
}

Rules:
- Only include a signal type if there is clear evidence in the text
- Set signal to null if no evidence found
- Dollar amounts must be pure numbers (not strings)
- Confidence values must be between 0 and 1
- If an article has no signals at all, still include it with all nulls`;

/**
 * Build the user prompt for a batch of articles.
 * @param {Array<{index: number, title: string, description: string}>} articles
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function buildRssEnrichmentPrompt(articles) {
  const articleList = articles.map((a, i) => {
    const desc = a.description
      ? a.description.length > 800 ? a.description.slice(0, 797) + '...' : a.description
      : '';
    return `[Article ${i}]\nTitle: ${a.title || 'Untitled'}\nDescription: ${desc}`;
  }).join('\n\n');

  const userPrompt = `Extract structured intelligence signals from these ${articles.length} articles:\n\n${articleList}`;

  return { systemPrompt: RSS_ENRICHMENT_SYSTEM_PROMPT, userPrompt };
}

module.exports = {
  RSS_ENRICHMENT_SYSTEM_PROMPT,
  buildRssEnrichmentPrompt,
};
