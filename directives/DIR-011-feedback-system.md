# DIR-011: Feedback System

## Status: Active
## Last Updated: 2026-02-17
## Sprint: 11

---

## Goal
Allow users to submit feedback with ratings for the platform, individual opportunities, and content items.

## Inputs
- Authenticated user actions:
  - `score` — integer, 1–5 (required)
  - `comments` — text string (optional)
  - `type` — enum: `platform` | `opportunity` | `content` (required)
  - `targetId` — string/UUID (optional, references opportunity or content ID when type is not `platform`)

## Outputs
- Feedback records written to `feedback` table
- Aggregated statistics:
  - Average score by type
  - Count by type
  - Count by status (pending, reviewed, resolved)

## API Endpoints
- `POST /api/v1/feedback` — Create feedback (authenticated)
  - Body: `{ score, comments?, type, targetId? }`
  - Returns: created feedback record (201)
- `GET /api/v1/feedback` — List feedback (authenticated, paginated, filterable by `type` and `status`)
  - Query params: `type`, `status`, `page`, `limit`
  - Returns: paginated feedback array with metadata
- `GET /api/v1/feedback/stats` — Aggregate statistics (authenticated)
  - Returns: avg score, count grouped by type and status
- `GET /api/v1/feedback/:id` — Get single feedback record (authenticated)
  - Returns: single feedback object (404 if not found)
- `PUT /api/v1/feedback/:id` — Update feedback (authenticated)
  - Owner may update: `score`, `comments`
  - Admin may update: `status` (pending → reviewed → resolved)
  - Returns: updated feedback record
- `DELETE /api/v1/feedback/:id` — Delete feedback (owner or admin)
  - Returns: 204 No Content

## Edge Cases
1. Score out of range (< 1 or > 5) — reject with 400, validation error message
2. Score is non-integer (e.g., 3.5) — reject with 400
3. `type` is not a valid enum value — reject with 400
4. `targetId` provided but does not reference a valid opportunity or content record — reject with 404
5. `targetId` omitted when `type` is `opportunity` or `content` — reject with 400 (targetId required for non-platform feedback)
6. `targetId` provided when `type` is `platform` — ignore or reject with 400 (targetId not applicable)
7. Deleting feedback with `reviewed` or `resolved` status — allowed for owner and admin; no additional restriction
8. Non-owner, non-admin attempting to edit or delete another user's feedback — reject with 403
9. Requesting stats when no feedback exists — return zeros, not 404
10. `page` or `limit` params with invalid values — default to page 1, limit 20

## Safety Constraints
- Users may only edit or delete their own feedback unless they hold the admin role
- No bulk delete or bulk update operations are exposed via API
- All write endpoints are rate limited to prevent abuse
- Status transitions are admin-only; owners cannot change their own feedback status

## Security Requirements
- All endpoints require a valid JWT in the `Authorization: Bearer <token>` header
- All input fields validated using `express-validator` before processing
- `targetId` is validated against actual database records to prevent referencing phantom IDs
- Admin role check is enforced server-side; client-supplied role claims are not trusted
- Feedback records include `userId` from the decoded JWT, never from the request body

## Verification Expectations
- 12 unit tests in `feedback.service.test.js`:
  - createFeedback: valid input, invalid score, invalid type, missing targetId when required
  - getFeedback: by id, not found, permission check
  - updateFeedback: owner update, admin status update, non-owner rejection
  - deleteFeedback: owner delete, admin delete, non-owner rejection
  - getFeedbackStats: returns aggregated results, empty state returns zeros
- 11 integration tests in `feedback.integration.test.js`:
  - POST /api/v1/feedback: success, validation failure (score), validation failure (type), unauthenticated
  - GET /api/v1/feedback: paginated list, filtered by type, filtered by status
  - GET /api/v1/feedback/stats: returns correct aggregates
  - GET /api/v1/feedback/:id: found, not found
  - PUT /api/v1/feedback/:id: owner update, admin status update, forbidden
  - DELETE /api/v1/feedback/:id: owner delete, forbidden
- E2E Journey 8: full user flow — submit feedback, view list, view stats, update, delete

## Dependencies
- DIR-001: User Registration & Authentication (JWT issuance and verification required)

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High
- Blast radius: Isolated
