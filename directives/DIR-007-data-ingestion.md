# DIR-007: Data Ingestion

## Status
Active

## Last Updated
2026-02-16

## Owner
Platform Team

## Goal
Build a pluggable data ingestion pipeline that fetches, transforms, and stores opportunity data from multiple sources using an adapter pattern.

## Context
The platform needs to aggregate data from SAM.gov (government contracts), job boards (AI jobs), and funding databases (investments). Each source has a different API/format. The adapter pattern allows adding new sources without changing the core ingestion logic.

## Inputs
- DataSource records define connection config, schedule, and enabled status
- Admin triggers ingestion via `POST /api/v1/ingestion/run/:dataSourceName`
- Each adapter implements `fetch()` (raw data) and `transform()` (normalize to Opportunity schema)

## Outputs
- Opportunities created/updated in the database
- IngestionLog record with run statistics (fetched, created, updated, skipped, errors)
- DataSource.lastRunAt and lastRunStatus updated
- API responses: `POST /run/:name` returns run summary, `GET /logs` returns paginated logs

## Edge Cases
1. API rate limit exceeded — Adapter returns partial results, log status = 'partial'
2. Network timeout — Catch error, log status = 'failed', do not retry automatically
3. Malformed source data — Skip individual records, increment skipped count, log error
4. DataSource disabled — runAllEnabled() skips it, runIngestion() returns 400
5. Duplicate records — Upsert by source+sourceId composite key
6. SAM.gov API key missing — samGov adapter throws clear error, mock adapters still work

## Safety Constraints
- Ingestion is idempotent (upsert, not insert)
- Never delete existing opportunities during ingestion
- Errors in one adapter must not block other adapters in runAllEnabled()
- All ingestion endpoints are admin-only

## Security Requirements
- All endpoints require admin role (verifyToken + checkPermissions('admin'))
- API keys stored in environment variables, never in DataSource.config
- DataSource.config references env var names, not actual secrets

## Verification Expectations
- Unit tests: ingestion.service (runIngestion flow, error handling, runAllEnabled)
- Unit tests: each adapter (fetch, transform, error handling)
- Integration tests: admin-only access, trigger ingestion, view logs
- Mock adapters must produce deterministic output for testability

## Dependencies
- DIR-006 (Opportunity Data Model) for the target schema
- SAM.gov API key (optional, mock adapters work without it)

## Confidence Assessment
- Directive clarity: 0.90
- Test coverage: 0.90
- Reversibility: High
- Blast radius: Isolated

## Revision History
| Date | Change | Author |
|------|--------|--------|
| 2026-02-16 | Initial creation | Claude |
