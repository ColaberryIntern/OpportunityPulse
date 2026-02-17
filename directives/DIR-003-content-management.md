# DIR-003: Content Management

## Status
Active

## Last Updated
2026-02-14

## Owner
Development Team

## Goal
Provide full CRUD operations for content items (articles, insights, reports) with ownership enforcement — users can only modify their own content, admins can manage all content.

## Context
Content is the core value unit of Opportunity Pulse. Users create content about government contract opportunities, AI job trends, and investment insights. Content has a lifecycle: draft → published → archived. Soft delete (paranoid mode) preserves data integrity. Pagination is required for list endpoints.

## Inputs
- `POST /api/v1/content` — `{ title, body, category?, tags?, status? }` (authenticated)
- `GET /api/v1/content?page=&limit=&status=&category=` — List content with filters (authenticated)
- `GET /api/v1/content/:id` — Get single content item (authenticated)
- `PUT /api/v1/content/:id` — `{ title?, body?, category?, tags?, status? }` (owner or admin)
- `DELETE /api/v1/content/:id` — Soft delete (owner or admin)

All endpoints require a valid JWT token.

## Outputs
- `POST` → `201 { status: 'success', data: { content: {...} } }`
- `GET list` → `200 { status: 'success', data: { content: [...], pagination: {...} } }`
- `GET :id` → `200 { status: 'success', data: { content: {...} } }`
- `PUT :id` → `200 { status: 'success', data: { content: {...} } }`
- `DELETE :id` → `200 { status: 'success', message: 'Content deleted.' }`

Side effects:
- Create/update/delete operations are auditable via UserActivity

## Edge Cases
1. Create with missing title or body — 400 Validation Error
2. Get non-existent content ID — 404 Not Found
3. Update content owned by another user (non-admin) — 403 Forbidden
4. Delete content owned by another user (non-admin) — 403 Forbidden
5. Admin can update/delete any content — 200 OK
6. Filter by status returns only matching items — 200 with filtered results
7. Filter by category returns only matching items — 200 with filtered results
8. Pagination beyond last page — 200 with empty array
9. Invalid status value in create/update — 400 Validation Error
10. Soft-deleted content not returned in list — filtered by paranoid mode

## Safety Constraints
- Users must NEVER be able to modify another user's content (unless admin)
- Soft delete only — no hard deletes via API
- Content body must be sanitized for XSS (no raw HTML execution)
- Tags array limited to prevent abuse

## Security Requirements
- JWT authentication required on all content endpoints
- Ownership verification on update/delete (or admin role bypass)
- Input validation on all request bodies
- Rate limiting inherited from global limiter

## Verification Expectations
- `tests/unit/backend/content.service.test.js` — unit tests for CRUD + ownership
- `tests/integration/content.integration.test.js` — HTTP lifecycle tests
- All tests must pass before directive is marked Active

## Dependencies
- DIR-001 (User Registration) — users table, JWT auth
- Content model with paranoid (soft delete) mode
- User model (ownership via userId)

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High (soft delete)
- Blast radius: Module (content only)

## Revision History
| Date       | Change           | Author           |
|------------|------------------|------------------|
| 2026-02-14 | Initial creation | Development Team |
