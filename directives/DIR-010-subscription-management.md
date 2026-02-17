# DIR-010: Subscription Enforcement & Public Access

## Status: Active
## Last Updated: 2026-02-16
## Sprint: 9

---

## Goal
Enforce free vs premium subscription tiers across the platform, auto-create subscriptions on registration, provide a public (unauthenticated) opportunity browser, and add user alert preferences.

## Inputs
- User registration events (trigger free subscription creation)
- Authenticated requests to premium-gated endpoints
- Public (unauthenticated) requests to `/api/v1/public/opportunities`
- User alert preference updates

## Outputs
- Subscription records auto-created on registration (free plan)
- 403 responses with `upgradeRequired: true` when free users hit premium endpoints
- Admin users bypass all subscription checks
- Public opportunity listings (stripped of aiScore, aiAnalysis, sourceData)
- User-specific alert preference records

## Subscription Tiers

### Free Tier (default on registration)
- Browse opportunities (no score filtering)
- View alerts
- Manage alert preferences
- Access basic dashboard stats and activity

### Premium Tier
- AI trend analysis results (`GET /analysis/trends/:type`)
- AI insight reports (`GET /analysis/latest-insights`)
- Advanced dashboard charts (`GET /dashboard/charts`)
- Score-based filtering (`GET /opportunities?minScore=`)

## Middleware Design
- `checkSubscription(requiredPlan)` — General gate, queries DB for active subscription
- `checkPremiumQuery(...paramNames)` — Blocks specific premium query params for free users
- Admin role bypasses all subscription checks

## Public Opportunity Browser
- No authentication required
- Returns only active opportunities
- Excludes premium fields: aiScore, aiAnalysis, sourceData
- Max 20 results per page
- Supports type and category filters

## Edge Cases
- User with no subscription record → treated as free tier
- Expired subscription (endDate < now) → treated as free tier
- Admin with no subscription → full access (admin bypass)
- Concurrent subscription records → most recent used (ORDER BY created_at DESC)
- Public endpoint returns empty array for no results (200, not 404)

## Safety Constraints
- Subscription checks never block admin users
- Public endpoints never expose sensitive opportunity data
- Alert preferences are user-scoped (no cross-user access)

## Verification
- Unit tests for subscription middleware (admin bypass, free/premium gating, expired handling)
- Integration tests for premium endpoint enforcement
- Integration tests for public opportunity browser
- Verify registration auto-creates free subscription
