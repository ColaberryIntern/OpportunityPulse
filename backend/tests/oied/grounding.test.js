// v8 Grounding service — pure helpers + lifecycle gate via mocked
// Opportunity + OpportunityEvent.

jest.mock('../../src/models', () => {
  const opps = new Map();
  const events = [];
  return {
    sequelize: {},
    Opportunity: {
      findByPk: jest.fn(async (id) => {
        const o = opps.get(Number(id));
        return o ? { ...o, toJSON: () => o } : null;
      }),
    },
    OpportunityEvent: {
      findOne: jest.fn(async ({ where }) => {
        const oppId = where && where.opportunityId;
        const allowedTypes = where && where.eventType
          && where.eventType[Symbol.for('sequelize.op.in')];
        return events.find((e) => e.opportunityId === oppId
          && (!allowedTypes || allowedTypes.includes(e.eventType))) || null;
      }),
    },
    __mockOpps: opps,
    __mockEvents: events,
  };
});

const grounding = require('../../src/oied/grounding.service');
const models = require('../../src/models');

beforeEach(() => {
  models.__mockOpps.clear();
  models.__mockEvents.length = 0;
});

describe('grounding.deriveAgencyName', () => {
  it('uses sourceData.agency when present', () => {
    expect(grounding.deriveAgencyName({
      sourceData: { agency: 'U3P (utah)' },
      location: 'fallback',
    })).toBe('U3P');
  });
  it('falls back to location when sourceData.agency missing', () => {
    expect(grounding.deriveAgencyName({
      location: 'City of Austin',
    })).toBe('City of Austin');
  });
  it('strips trailing "(slug)" suffix', () => {
    expect(grounding.deriveAgencyName({
      sourceData: { agency: 'Harris County (harriscountytx)' },
    })).toBe('Harris County');
  });
  it('returns null when nothing usable', () => {
    expect(grounding.deriveAgencyName({})).toBeNull();
    expect(grounding.deriveAgencyName({ location: 'unknown' })).toBeNull();
    expect(grounding.deriveAgencyName({ location: 'a' })).toBeNull(); // < 3 chars
  });
});

describe('grounding.deriveSolicitationId', () => {
  it('extracts trailing tail from bonfire external_id', () => {
    expect(grounding.deriveSolicitationId({
      sourceData: { external_id: 'bonfire:agency:utah:2026-016' },
    })).toBe('2026-016');
  });
  it('falls back to RFP regex on title', () => {
    expect(grounding.deriveSolicitationId({
      title: 'Solicitation for the Department: RFP-25-007 due Friday',
    })).toMatch(/25-007/);
  });
  it('returns null when nothing matches', () => {
    expect(grounding.deriveSolicitationId({
      title: 'Generic procurement title with no id',
    })).toBeNull();
  });
});

describe('grounding.deriveScopeSummary', () => {
  it('prefers AI overview when long enough', () => {
    expect(grounding.deriveScopeSummary({
      aiAnalysis: { overview: 'A'.repeat(120) },
      description: 'B'.repeat(120),
    })).toMatch(/^A+/);
  });
  it('falls back to description when no AI overview', () => {
    expect(grounding.deriveScopeSummary({
      description: 'B'.repeat(120),
    })).toMatch(/^B+/);
  });
  it('returns null when both are too short', () => {
    expect(grounding.deriveScopeSummary({ description: 'short' })).toBeNull();
  });
});

describe('grounding.deriveSubmissionRequirements', () => {
  it('detects SOW + pricing + compliance keywords', () => {
    const out = grounding.deriveSubmissionRequirements({
      title: 'X', description: 'statement of work, pricing schedule, compliance review required.',
    });
    expect(out.required_sections).toEqual(expect.arrayContaining(['sow', 'pricing', 'compliance']));
  });
  it('extracts page_limit from "X pages maximum"', () => {
    const out = grounding.deriveSubmissionRequirements({
      title: 'X', description: 'Submit a 25 page maximum proposal.',
    });
    expect(out.page_limit).toBe(25);
  });
  it('detects PDF format', () => {
    const out = grounding.deriveSubmissionRequirements({
      title: 'X', description: 'Submit as PDF only.',
    });
    expect(out.format).toBe('PDF');
  });
});

describe('grounding.getOpportunityGrounding (DB-bound)', () => {
  function seedOpp(id, over = {}) {
    models.__mockOpps.set(id, {
      id, title: 'X', value: 100, category: 'IT Services',
      sourceData: { agency: 'City of Austin', external_id: 'sam:RFP-26-001' },
      description: 'A reasonably long scope summary describing the procurement need with enough detail to ground a proposal.',
      ...over,
    });
  }

  it('returns ok payload for a fresh opp with all fields', async () => {
    seedOpp(1);
    const out = await grounding.getOpportunityGrounding(1);
    expect(out.status).toBe('ok');
    expect(out.agency_name).toBe('City of Austin');
    expect(out.solicitation_id).toBe('RFP-26-001');
    expect(out.scope_summary.length).toBeGreaterThan(50);
  });

  it('SPEC: returns invalid_stage when a submitted event exists', async () => {
    seedOpp(2);
    models.__mockEvents.push({ opportunityId: 2, eventType: 'submitted' });
    const out = await grounding.getOpportunityGrounding(2);
    expect(out.status).toBe('invalid_stage');
    expect(out.event_type).toBe('submitted');
    expect(out.message).toMatch(/not allowed at this lifecycle stage/);
  });

  it('returns invalid_stage for won/lost/responded events too', async () => {
    seedOpp(3); models.__mockEvents.push({ opportunityId: 3, eventType: 'won' });
    expect((await grounding.getOpportunityGrounding(3)).status).toBe('invalid_stage');
    seedOpp(4); models.__mockEvents.push({ opportunityId: 4, eventType: 'lost' });
    expect((await grounding.getOpportunityGrounding(4)).status).toBe('invalid_stage');
    seedOpp(5); models.__mockEvents.push({ opportunityId: 5, eventType: 'response_received' });
    expect((await grounding.getOpportunityGrounding(5)).status).toBe('invalid_stage');
  });

  it('returns not_found for missing opp', async () => {
    const out = await grounding.getOpportunityGrounding(99999);
    expect(out.status).toBe('not_found');
  });
});

describe('grounding.missingGroundingFields', () => {
  it('returns the fields that are missing', () => {
    const out = grounding.missingGroundingFields({
      status: 'ok',
      agency_name: 'X', solicitation_id: null, scope_summary: 'long enough',
    });
    expect(out).toEqual(['solicitation_id']);
  });
  it('returns empty when grounding is complete', () => {
    expect(grounding.missingGroundingFields({
      status: 'ok',
      agency_name: 'X', solicitation_id: 'Y', scope_summary: 'Z',
    })).toEqual([]);
  });
  it('returns empty when payload is invalid_stage (no fields to derive)', () => {
    expect(grounding.missingGroundingFields({ status: 'invalid_stage' })).toEqual([]);
  });
});
