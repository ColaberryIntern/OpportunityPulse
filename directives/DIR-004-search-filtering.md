# DIR-004: Search & Filtering

## Status
Active

## Last Updated
2026-02-16

## Owner
Development Team

## Goal
Provide a unified search endpoint that queries content by keyword, category, tags, date range, and status — with pagination and sorted by relevance or recency.

## Context
Search is essential for users to discover content across the platform. The search endpoint performs case-insensitive matching against content title and body fields. Filters (category, tags, status, date range) can be combined with or without a keyword query. Results are paginated. No results returns 200 with an empty array (not 404).

## Inputs
- `GET /api/v1/search?q=&category=&tags=&status=&dateFrom=&dateTo=&page=&limit=&sort=` (authenticated)
  - `q` — keyword search (partial match on title and body, case-insensitive)
  - `category` — exact match filter
  - `tags` — comma-separated, matches content containing any of the specified tags
  - `status` — exact match filter (draft, published, archived)
  - `dateFrom` / `dateTo` — ISO date strings for created_at range
  - `page` / `limit` — pagination (defaults: page=1, limit=20)
  - `sort` — `newest` (default) or `oldest`

## Outputs
- `GET /api/v1/search` →
  ```json
  {
    "status": "success",
    "data": {
      "results": [...],
      "pagination": { "total": 50, "page": 1, "limit": 20, "pages": 3 },
      "filters": { "q": "AI", "category": "contracts", ... }
    }
  }
  ```

Side effects: None — read-only endpoint.

## Edge Cases
1. No query params — returns all content paginated (no filter)
2. No results match — 200 with empty results array (not 404)
3. Invalid date format in dateFrom/dateTo — ignored (not error)
4. Empty `q` string — treated as no keyword filter
5. Multiple tags — OR matching (content has any of the tags)
6. Pagination beyond last page — 200 with empty array
7. Sort=oldest reverses order

## Safety Constraints
- Search is read-only — no mutations
- Soft-deleted content excluded (paranoid mode handles this)
- Rate limiting inherited from global limiter

## Security Requirements
- JWT authentication required
- No RBAC restriction (all authenticated roles can search)
- Input sanitization on all query params (Sequelize parameterized queries prevent SQL injection)

## Verification Expectations
- `tests/unit/backend/search.service.test.js` — unit tests for search with various filter combinations
- `tests/integration/search.integration.test.js` — HTTP lifecycle tests
- All tests must pass before directive is marked Active

## Dependencies
- DIR-003 (Content Management) — content table must exist
- JWT auth middleware
- Content model

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High (read-only)
- Blast radius: Isolated

## Revision History
| Date       | Change           | Author           |
|------------|------------------|------------------|
| 2026-02-16 | Initial creation | Development Team |
