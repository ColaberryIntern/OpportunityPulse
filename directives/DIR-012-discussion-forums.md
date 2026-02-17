# DIR-012: Discussion Forums

## Status: Active
## Last Updated: 2026-02-17
## Sprint: 11

---

## Goal
Provide a community discussion space where users can create posts organized by category and engage through comments.

## Inputs
- Authenticated user actions:
  - Posts:
    - `title` — string, max 255 characters (required)
    - `body` — string, non-empty (required)
    - `category` — enum: `general` | `gov_contracts` | `ai_jobs` | `investments` | `platform` (required)
  - Comments:
    - `body` — string, non-empty (required)
    - `postId` — derived from route parameter `:id`

## Outputs
- `ForumPost` records written to `forum_posts` table
  - Fields include: `id`, `userId`, `title`, `body`, `category`, `status`, `viewCount`, `createdAt`, `updatedAt`
- `Comment` records written to `comments` table
  - Fields include: `id`, `postId`, `userId`, `body`, `createdAt`, `updatedAt`

## API Endpoints
- `POST /api/v1/forums` — Create a new forum post (authenticated)
  - Body: `{ title, body, category }`
  - Returns: created post record (201)
- `GET /api/v1/forums` — List posts (authenticated, paginated, filterable by `category` and `status`)
  - Query params: `category`, `status`, `page`, `limit`
  - Returns: paginated post array with `commentCount` included per post
- `GET /api/v1/forums/:id` — Get a single post with all comments (authenticated)
  - Side effect: increments `viewCount` on the post
  - Returns: post object with nested `comments` array (404 if not found)
- `PUT /api/v1/forums/:id` — Update a post (authenticated)
  - Owner may update: `title`, `body`, `category`
  - Admin may update: `status` (`open` → `closed` | `pinned`)
  - Returns: updated post record
- `DELETE /api/v1/forums/:id` — Delete a post and cascade-delete all child comments (owner or admin)
  - Returns: 204 No Content
- `POST /api/v1/forums/:id/comments` — Add a comment to a post (authenticated)
  - Post must have status `open`; closed or pinned posts do not accept new comments
  - Body: `{ body }`
  - Returns: created comment record (201)
- `PUT /api/v1/forums/:id/comments/:commentId` — Update a comment (owner or admin)
  - Body: `{ body }`
  - Returns: updated comment record
- `DELETE /api/v1/forums/:id/comments/:commentId` — Delete a comment (owner or admin)
  - Returns: 204 No Content

## Post Statuses
- `open` — default on creation; accepts new comments
- `closed` — admin-managed; no new comments accepted
- `pinned` — admin-managed; visually elevated in list; comment behavior follows `open` rules unless otherwise specified

## Edge Cases
1. Comment submitted on a closed post — reject with 403 and descriptive error message
2. Comment submitted on a pinned post — allowed (pinned posts remain open for discussion unless explicitly closed)
3. Deleting a post cascades deletion of all child comments — no orphaned comment records left in `comments` table
4. Pinning a post — only admin may set `status` to `pinned`; owner PUT requests cannot modify status
5. Post with no comments — GET /:id returns `comments: []`, not a 404 or null
6. List endpoint with no matching posts — returns empty array with pagination metadata, not 404
7. `viewCount` increment — only occurs on GET /:id, not on list endpoint
8. Non-owner, non-admin attempting to edit or delete another user's post or comment — reject with 403
9. `title` exceeding 255 characters — reject with 400
10. Empty `body` on post or comment creation — reject with 400
11. Invalid `category` value — reject with 400
12. `commentId` not belonging to the referenced `postId` — reject with 404

## Safety Constraints
- Users may only edit or delete their own posts and comments unless they hold the admin role
- Cascade delete is handled at the application layer and must be confirmed with a transaction to ensure atomicity
- No anonymous posts or comments; all content is tied to an authenticated user ID from the JWT
- Status changes (`closed`, `pinned`) are restricted to admin role only; owners cannot change post status

## Security Requirements
- All endpoints require a valid JWT in the `Authorization: Bearer <token>` header
- All input fields validated using `express-validator` before processing
- `title` enforced to max 255 characters server-side
- `body` enforced as required and non-empty server-side
- Admin role check is enforced server-side; client-supplied role claims are not trusted
- `userId` on created posts and comments is derived from the decoded JWT, never from the request body
- `postId` on comments is derived from the route parameter, never from the request body

## Verification Expectations
- 15 unit tests in `forum.service.test.js`:
  - createPost: valid input, invalid category, missing title, missing body, title too long
  - getPost: by id with comments, not found, view count increments
  - listPosts: paginated, filtered by category, filtered by status, empty result
  - updatePost: owner field update, admin status update, non-owner rejection, invalid status value
  - deletePost: owner delete with cascade, admin delete, non-owner rejection
  - createComment: success on open post, rejected on closed post, missing body
  - updateComment: owner update, non-owner rejection
  - deleteComment: owner delete, commentId mismatch returns 404
- 12 integration tests in `forum.integration.test.js`:
  - POST /api/v1/forums: success, validation failure (category), validation failure (title length), unauthenticated
  - GET /api/v1/forums: paginated list, filtered by category, filtered by status, empty list
  - GET /api/v1/forums/:id: found with comments, not found, view count increments
  - PUT /api/v1/forums/:id: owner update, admin status update, forbidden
  - DELETE /api/v1/forums/:id: owner delete cascades comments, forbidden
  - POST /api/v1/forums/:id/comments: success on open post, rejected on closed post, unauthenticated
  - PUT /api/v1/forums/:id/comments/:commentId: owner update, forbidden
  - DELETE /api/v1/forums/:id/comments/:commentId: owner delete, forbidden
- E2E Journey 9: full user flow — create post, add comments, view post with comments, update post, close post (admin), attempt comment on closed post (rejected), delete post (cascade verified)

## Dependencies
- DIR-001: User Registration & Authentication (JWT issuance and verification required)

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High
- Blast radius: Isolated
