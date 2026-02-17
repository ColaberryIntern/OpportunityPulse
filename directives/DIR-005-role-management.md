# DIR-005: Role Management

## Status
Active

## Last Updated
2026-02-14

## Owner
Development Team

## Goal
Provide admin-only API endpoints to list roles, assign roles to users, and update role metadata, enabling hierarchical access control across the platform.

## Context
The Opportunity Pulse platform uses four predefined roles (admin, consultant, auditor, devops) seeded at initialization. Admins need the ability to view all available roles, reassign a user's role, and update role descriptions. This builds on the User Registration (DIR-001) and JWT auth middleware already in place.

## Inputs
- `GET /api/v1/roles` — List all roles (admin only)
- `POST /api/v1/roles/assign` — `{ userId, roleId }` (admin only)
- `PUT /api/v1/roles/:id` — `{ description }` (admin only)

All endpoints require a valid JWT with `role: 'admin'`.

## Outputs
- `GET /api/v1/roles` → `{ status: 'success', data: { roles: [...] } }`
- `POST /api/v1/roles/assign` → `{ status: 'success', data: { user: {...} }, message: 'Role assigned successfully.' }`
- `PUT /api/v1/roles/:id` → `{ status: 'success', data: { role: {...} }, message: 'Role updated successfully.' }`

Side effects:
- Role assignment writes an audit log entry
- User's `role_id` column updated on assign

## Edge Cases
1. Non-admin tries to access role endpoints — 403 Forbidden
2. Unauthenticated request — 401 Unauthorized
3. Assign role to non-existent user — 404 Not Found
4. Assign non-existent role ID — 404 Not Found
5. Update non-existent role ID — 404 Not Found
6. Assign the same role user already has — 200 OK (idempotent, no error)
7. Missing userId or roleId in assign body — 400 Validation Error
8. Invalid roleId type (string instead of integer) — 400 Validation Error
9. Admin cannot delete roles (no DELETE endpoint) — 404 route not found

## Safety Constraints
- Role assignment must NEVER remove the last admin (prevent lockout)
- Only admin role can access these endpoints
- Role names (admin, consultant, auditor, devops) must not be changed via API — only descriptions can be updated
- No endpoint to create new roles via API (roles are seeded)

## Security Requirements
- JWT authentication required on all role endpoints
- RBAC middleware restricts to admin role only
- Audit logging on role assignment changes
- Input validation on all request bodies
- Rate limiting inherited from global limiter

## Verification Expectations
- `tests/unit/backend/role.service.test.js` — unit tests for listRoles, assignRole, updateRole
- `tests/unit/backend/rbac.middleware.test.js` — already exists from Sprint 1
- `tests/integration/roles.integration.test.js` — full HTTP lifecycle tests with auth
- All tests must pass before directive is marked Active

## Dependencies
- DIR-001 (User Registration) — users and roles tables must exist
- JWT auth middleware (`auth.middleware.js`)
- RBAC middleware (`rbac.middleware.js`)
- UserRole model, User model

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High
- Blast radius: Module (auth + roles only)

## Revision History
| Date       | Change           | Author           |
|------------|------------------|------------------|
| 2026-02-14 | Initial creation | Development Team |
