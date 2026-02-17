# DIR-002: Dashboard

## Status
Active

## Last Updated
2026-02-14

## Owner
Development Team

## Goal
Provide authenticated users with aggregated platform statistics and a paginated feed of their recent activity.

## Context
The dashboard is the primary landing page after login. It displays summary metrics (total users, total content, user's content count, recent activity count) and a chronological feed of the user's actions on the platform. Admins see system-wide stats; regular users see their own stats.

## Inputs
- `GET /api/v1/dashboard/stats` — Aggregated platform metrics (authenticated)
- `GET /api/v1/dashboard/activity?page=&limit=` — Paginated recent activity for the current user (authenticated)

Both endpoints require a valid JWT token.

## Outputs
- `GET /api/v1/dashboard/stats` →
  ```json
  {
    "status": "success",
    "data": {
      "stats": {
        "totalUsers": 42,
        "totalContent": 156,
        "myContentCount": 12,
        "recentActivityCount": 25
      }
    }
  }
  ```

- `GET /api/v1/dashboard/activity` →
  ```json
  {
    "status": "success",
    "data": {
      "activities": [...],
      "pagination": { "total": 25, "page": 1, "limit": 20, "pages": 2 }
    }
  }
  ```

Side effects:
- No data mutations — read-only endpoints

## Edge Cases
1. New user with no activity — returns empty activity array with `total: 0`
2. No content exists yet — `totalContent: 0`, `myContentCount: 0`
3. Pagination beyond last page — returns empty array (not 404)
4. Invalid page/limit params — defaults applied (page=1, limit=20)
5. Admin vs non-admin — both see same stats structure; admin sees system-wide totals, non-admin sees the same (platform-level stats are not sensitive)

## Safety Constraints
- Dashboard endpoints are read-only — no mutations
- Users can only see their own activity feed
- Stats are aggregated — no user-specific data leaked to others

## Security Requirements
- JWT authentication required on all dashboard endpoints
- No RBAC restriction (all authenticated roles can access)
- Rate limiting inherited from global limiter
- No sensitive data exposed in activity feed (no passwords, tokens)

## Verification Expectations
- `tests/unit/backend/dashboard.service.test.js` — unit tests for getStats, getActivity
- `tests/integration/dashboard.integration.test.js` — HTTP lifecycle tests
- All tests must pass before directive is marked Active

## Dependencies
- DIR-001 (User Registration) — users table
- JWT auth middleware (`auth.middleware.js`)
- User, Content, UserActivity, Dashboard models

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High
- Blast radius: Isolated (read-only)

## Revision History
| Date       | Change           | Author           |
|------------|------------------|------------------|
| 2026-02-14 | Initial creation | Development Team |
