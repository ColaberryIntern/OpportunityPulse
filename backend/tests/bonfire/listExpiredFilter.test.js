// v0.11 — bonfire.service.listOpportunities expired-filter tests.
//
// Default behavior: hide opps whose close_date is in the past UNLESS the
// user has marked them pursuing/submitted. ?includeExpired=true opts in
// to the full historical list.
//
// Approach: assert the WHERE clause shape rather than spinning up Postgres.
// The integration concern is the SQL; the unit concern is "did we build
// the right Sequelize spec from the inputs?"

const { Op } = require('sequelize');

jest.mock('../../src/models', () => ({
  BonfireOpportunity: {
    findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })),
  },
  BonfireOpportunityTag: {},
}));

const { BonfireOpportunity } = require('../../src/models');
const svc = require('../../src/bonfire/bonfire.service');

beforeEach(() => {
  BonfireOpportunity.findAndCountAll.mockClear();
});

function lastWhere() {
  const call = BonfireOpportunity.findAndCountAll.mock.calls.at(-1);
  return call?.[0]?.where || {};
}

describe('bonfire.service.listOpportunities — expired-bid filter (v0.11)', () => {
  it('default request adds an expired-or-pursued WHERE clause', async () => {
    await svc.listOpportunities({});
    const where = lastWhere();
    expect(where[Op.and]).toBeDefined();
    // The condition should accept: null close_date OR future close_date OR pursuing/submitted.
    const orClause = where[Op.and][0][Op.or];
    expect(Array.isArray(orClause)).toBe(true);
    expect(orClause.length).toBeGreaterThanOrEqual(3);
    const hasNullClause = orClause.some((c) => c.closeDate === null);
    const hasFutureClause = orClause.some((c) => c.closeDate && c.closeDate[Op.gte] instanceof Date);
    const hasPursuingClause = orClause.some((c) => c.pursuitStatus && Array.isArray(c.pursuitStatus[Op.in]));
    expect(hasNullClause).toBe(true);
    expect(hasFutureClause).toBe(true);
    expect(hasPursuingClause).toBe(true);
  });

  it('includeExpired=true skips the filter entirely', async () => {
    await svc.listOpportunities({ includeExpired: 'true' });
    const where = lastWhere();
    expect(where[Op.and]).toBeUndefined();
  });

  it('includeExpired="false" (string) still applies the filter', async () => {
    await svc.listOpportunities({ includeExpired: 'false' });
    expect(lastWhere()[Op.and]).toBeDefined();
  });

  it('preserves existing filters (agency, category) alongside the expiry clause', async () => {
    await svc.listOpportunities({ agency: 'Austin', category: 'IT Services' });
    const where = lastWhere();
    expect(where.agency).toBeDefined();
    expect(where.aiCategory).toBe('IT Services');
    expect(where[Op.and]).toBeDefined();
  });

  it('pursuit_status set in the OR clause covers pursuing and submitted', async () => {
    await svc.listOpportunities({});
    const where = lastWhere();
    const pursuitClause = where[Op.and][0][Op.or].find((c) => c.pursuitStatus);
    expect(pursuitClause.pursuitStatus[Op.in]).toEqual(['pursuing', 'submitted']);
  });
});
