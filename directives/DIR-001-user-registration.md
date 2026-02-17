# DIR-001: User Registration

## Status
Active

## Last Updated
2026-02-14

## Owner
Development Team

## Goal
Enable new users to create accounts with email-based registration, password hashing, email verification, and JWT token issuance.

## Context
User registration is the foundational feature of the platform. All other features depend on authenticated users. The Build Guide (Chapter 4, lines 607-622) specifies email-based registration with verification. Chapter 8 mandates bcrypt password hashing and JWT authentication.

## Inputs
- `POST /api/v1/auth/register` with `{ email, password }`
  - Email: valid RFC 5322 format, max 255 chars
  - Password: min 8 chars, at least 1 uppercase, 1 number, 1 special character
- `POST /api/v1/auth/login` with `{ email, password }`
- `GET /api/v1/auth/verify/:token` — email verification callback
- `GET /api/v1/auth/me` — requires valid JWT in Authorization header
- `PUT /api/v1/auth/profile` with `{ name?, company?, interests? }` — requires valid JWT

## Outputs
- Register: `201 Created` with `{ status: "success", message: "Registration successful. Please verify your email.", data: { userId } }`
- Login: `200 OK` with `{ status: "success", data: { accessToken, expiresIn, user } }`
- Verify: `200 OK` with `{ status: "success", message: "Email verified successfully." }`
- Me: `200 OK` with `{ status: "success", data: { user } }` (no password_hash in response)
- Profile Update: `200 OK` with `{ status: "success", data: { user } }`

## Edge Cases
1. Duplicate email registration — return `409 Conflict` with generic message (do not reveal if email exists to prevent enumeration)
2. Invalid email format — return `400 Bad Request` with field-level error
3. Weak password (< 8 chars, no uppercase, no number, no special char) — return `400 Bad Request` with specific requirement
4. Extremely long password (> 128 chars) — return `400 Bad Request`
5. SQL injection in email field — sanitized by express-validator, parameterized by Sequelize
6. Registration during DB outage — return `503 Service Unavailable`, log error
7. Bot-driven mass registration — rate limited to 20 auth attempts per 15 min per IP
8. Email delivery failure — user is created with email_verified=false, allow resend
9. Login with unverified email — allowed but with limited access (future enhancement)
10. Expired verification token — return `400 Bad Request`, provide resend option

## Safety Constraints
- Passwords MUST NEVER be stored in plaintext
- Passwords MUST NEVER appear in logs or API responses
- JWT secrets MUST NEVER be in source code (use environment variables)
- Password hashing MUST use bcrypt with minimum 10 rounds (configured to 12)
- User's toSafeJSON() method must strip passwordHash and verificationToken before any response

## Security Requirements
- Authentication: None required for register/login/verify endpoints
- Rate limiting: Auth-specific limiter (20 requests / 15 min / IP)
- Input validation: express-validator on all fields
- OWASP A03 (Injection): Sequelize parameterized queries only
- OWASP A07 (Auth Failures): Account lockout after 5 failed attempts (future sprint)

## Verification Expectations
- Unit tests:
  - auth.service.test.js: registerUser with valid data returns user, duplicate email throws, weak password throws, password is hashed, toSafeJSON excludes sensitive fields
  - auth.middleware.test.js: valid JWT passes, expired JWT returns 401, malformed JWT returns 401, missing header returns 401
- Integration tests:
  - auth.integration.test.js: full register -> verify -> login flow, duplicate registration blocked, invalid credentials rejected
- Acceptance criteria:
  - User receives 201 on successful registration
  - Verification endpoint activates account
  - Login returns JWT token
  - Protected routes reject requests without valid JWT

## Dependencies
- None (this is the first feature to implement)

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High
- Blast radius: Module (auth only)

## Revision History
| Date | Change | Author |
|------|--------|--------|
| 2026-02-14 | Initial creation | Claude |
