# DIR-006: Opportunity Data Model

## Status
Active

## Last Updated
2026-02-16

## Owner
Platform Team

## Goal
Define a unified Opportunity model that stores government contracts, AI job postings, and startup investment records in a single polymorphic table.

## Context
The platform aggregates three distinct data domains (gov contracts, AI jobs, investments) from multiple sources. A unified model with a `type` discriminator and JSONB `sourceData` simplifies querying, filtering, and pagination across domains without schema proliferation.

## Inputs
- Ingestion adapters provide normalized records with required fields (title, type, source, sourceId)
- Each record carries domain-specific attributes in the JSONB `sourceData` field
- Records are upserted by the composite key (source + sourceId) to prevent duplicates

## Outputs
- `GET /api/v1/opportunities` — Paginated, filtered list of opportunities
- `GET /api/v1/opportunities/:id` — Single opportunity with full sourceData
- `GET /api/v1/opportunities/stats` — Aggregated counts by type/status, average score, total value
- Response shape: `{ status, message, data, pagination, code }`

## Edge Cases
1. Duplicate sourceId from same source — Upsert (update existing record)
2. Missing optional fields (value, location, expiresAt) — Store as null, display "N/A"
3. Invalid type value — Reject at validation layer, only allow enum values
4. Very long descriptions (>50KB) — Truncate at ingestion, store full in sourceData

## Safety Constraints
- Opportunities are write-only from ingestion service, never directly by users
- Soft status changes (active→closed→archived) only, no hard deletes
- sourceData must not contain PII; adapters must strip it during transform

## Security Requirements
- All read endpoints require JWT authentication
- No write endpoints exposed (ingestion is admin-triggered)
- sourceData is not exposed in public API responses

## Verification Expectations
- Unit tests for opportunity.service: list with filters (type, category, status, keyword, date range, minScore), pagination, getById, getStats
- Integration tests for all three GET endpoints
- Model validation tests for enum constraints

## Dependencies
- DIR-007 (Data Ingestion) for write path
- DataSource model for foreign key relationship

## Confidence Assessment
- Directive clarity: 0.95
- Test coverage: 0.90
- Reversibility: High
- Blast radius: Module

## Revision History
| Date | Change | Author |
|------|--------|--------|
| 2026-02-16 | Initial creation | Claude |
