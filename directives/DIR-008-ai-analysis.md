# DIR-008: AI-Powered Analysis

## Status: Active
## Last Updated: 2026-02-16
## Sprint: 8

---

## Goal
Provide AI-powered scoring, trend detection, and insight generation for ingested opportunities using the OpenAI API. Enable admins to trigger analysis runs and all authenticated users to view results.

## Inputs
- Opportunities from the `opportunities` table (unscored or all, depending on analysis type)
- OpenAI API key from environment (`OPENAI_API_KEY`)

## Outputs
- `aiScore` (0-100) and `aiAnalysis` (JSONB) fields updated on Opportunity records
- `AnalysisRun` records tracking each analysis execution
- Trend detection results stored in AnalysisRun.results
- Weekly insight summaries

## Analysis Types

### 1. Opportunity Scoring (`scoreOpportunities`)
- Batch 10-20 unscored opportunities of a given type
- Send to OpenAI with structured prompt requesting relevance scores (0-100)
- Parse response, update `aiScore` and `aiAnalysis` on each opportunity
- Create Alert for high-score opportunities (score >= 80)

### 2. Trend Detection (`detectTrends`)
- Compute weekly aggregations in Node.js (count by category, avg value, new vs closed)
- Send aggregated data to OpenAI for pattern identification
- Store results in AnalysisRun.results JSONB
- Identify emerging and declining categories/sectors

### 3. Insight Generation (`generateInsights`)
- Combine scoring results + trends + top opportunities
- OpenAI produces a weekly summary report
- Store as AnalysisRun with type='insight_generation'

## API Endpoints
- `POST /api/v1/analysis/score/:type` — Admin: trigger scoring for opportunity type
- `POST /api/v1/analysis/trends/:type` — Admin: trigger trend detection
- `POST /api/v1/analysis/insights` — Admin: generate weekly insights
- `GET /api/v1/analysis/latest-insights` — Authenticated: get latest insights
- `GET /api/v1/analysis/trends/:type` — Authenticated: get latest trends

## Edge Cases
- OpenAI API rate limits: implement retry with exponential backoff
- Malformed AI responses: validate JSON structure before storing
- Empty opportunity set: return gracefully with no-op AnalysisRun
- API key missing: throw clear error, do not proceed

## Safety Constraints
- Never send PII to OpenAI (no user data, only opportunity metadata)
- Log all API calls with token usage for cost monitoring
- Cap batch sizes to control costs (max 20 per scoring run)
- Store raw AI response in AnalysisRun.metadata for auditability

## Verification
- Unit tests with fully mocked OpenAI client
- Integration tests verify endpoints, auth, admin-only access
- Verify aiScore values are within 0-100 range
- Verify AnalysisRun records are created for each run
