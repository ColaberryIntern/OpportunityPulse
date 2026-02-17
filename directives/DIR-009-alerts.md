# DIR-009: Alert & Notification System

## Status: Active
## Last Updated: 2026-02-16
## Sprint: 8

---

## Goal
Provide an in-app alert/notification system that surfaces high-value opportunities, AI analysis results, and system events to users.

## Inputs
- AI scoring results (high-score opportunities >= 80)
- Trend detection changes
- System events (ingestion completions, errors)

## Outputs
- Alert records in the `alerts` table
- Unread count endpoint for UI badge
- CRUD operations for alert management

## Alert Types
- `new_opportunity` — High-score opportunity discovered
- `score_change` — Significant score change on existing opportunity
- `trend_alert` — New trend detected
- `system` — System notifications (ingestion complete, errors)

## Severity Levels
- `info` — Informational (ingestion complete, low-priority opportunities)
- `warning` — Attention needed (declining trends, partial ingestion failures)
- `important` — Action recommended (high-score opportunities, critical trends)

## API Endpoints
- `GET /api/v1/alerts` — Authenticated: list user's alerts (paginated)
- `GET /api/v1/alerts/unread` — Authenticated: get unread count
- `PUT /api/v1/alerts/:id/read` — Authenticated: mark single alert as read
- `PUT /api/v1/alerts/read-all` — Authenticated: mark all alerts as read
- `DELETE /api/v1/alerts/:id` — Authenticated: delete an alert

## Edge Cases
- High-volume alert creation: batch insert where possible
- User with no alerts: return empty array (200), not 404
- Mark-all-read with no unread: succeed silently (idempotent)
- Alert for deleted opportunity: alert still visible, opportunityId may be null

## Safety Constraints
- Users can only access their own alerts
- Alert creation is system-only (no user-facing create endpoint)
- Alerts are soft-deletable but not editable by users

## Verification
- Unit tests for alert CRUD operations
- Integration tests for all endpoints with auth
- Verify user isolation (user A cannot see user B's alerts)
