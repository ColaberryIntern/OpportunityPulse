// v7.1 lifecycle validation — events.service strict-ordering helpers.

jest.mock('../../src/models', () => {
  const events = []; // append-only mock store
  return {
    sequelize: {},
    OpportunityEvent: {
      create: jest.fn(async (row) => {
        const r = { ...row, id: events.length + 1, createdAt: new Date() };
        events.push(r);
        return { ...r, toJSON: () => r };
      }),
      findOne: jest.fn(async ({ where: { opportunityId, eventType } }) => {
        return events.find((e) => e.opportunityId === opportunityId && e.eventType === eventType) || null;
      }),
      findAll: jest.fn(async () => events.slice()),
    },
    __mockEvents: events,
  };
});

const events = require('../../src/oied/events.service');
const models = require('../../src/models');

beforeEach(() => {
  models.__mockEvents.length = 0;
  models.OpportunityEvent.findOne.mockClear();
});

describe('events.service.hasEventOfType', () => {
  it('returns true when event exists for the given opp', async () => {
    models.__mockEvents.push({ opportunityId: 1, eventType: 'submitted', createdAt: new Date() });
    expect(await events.hasEventOfType({ opportunityId: 1, eventType: 'submitted' })).toBe(true);
  });
  it('returns false when no matching event exists', async () => {
    expect(await events.hasEventOfType({ opportunityId: 1, eventType: 'submitted' })).toBe(false);
  });
  it('returns false when opportunityId is missing', async () => {
    expect(await events.hasEventOfType({ eventType: 'submitted' })).toBe(false);
  });
});

describe('events.service.requireSubmitted (v7.1)', () => {
  it('SPEC: throws LifecycleViolationError when no submitted event', async () => {
    let caught;
    try { await events.requireSubmitted(99); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(events.LifecycleViolationError);
    expect(caught.message).toMatch(/Cannot mark responded before submission/);
    expect(caught.requires).toBe('submitted');
    expect(caught.statusCode).toBe(400);
  });

  it('SPEC: returns silently when submitted event exists', async () => {
    models.__mockEvents.push({ opportunityId: 5, eventType: 'submitted', createdAt: new Date() });
    await expect(events.requireSubmitted(5)).resolves.toBeUndefined();
  });
});

describe('events.service.requireResponded (v7.1)', () => {
  it('SPEC: throws when no response_received event', async () => {
    let caught;
    try { await events.requireResponded(7); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(events.LifecycleViolationError);
    expect(caught.message).toMatch(/Cannot mark won\/lost before responded/);
    expect(caught.requires).toBe('response_received');
  });

  it('SPEC: returns silently when response_received event exists', async () => {
    models.__mockEvents.push({ opportunityId: 8, eventType: 'response_received', createdAt: new Date() });
    await expect(events.requireResponded(8)).resolves.toBeUndefined();
  });

  it('does not accept submitted as a substitute for responded', async () => {
    models.__mockEvents.push({ opportunityId: 9, eventType: 'submitted', createdAt: new Date() });
    let caught;
    try { await events.requireResponded(9); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(events.LifecycleViolationError);
  });
});

describe('events.service.LifecycleViolationError', () => {
  it('exposes statusCode + requires fields the controller maps to 400', () => {
    const e = new events.LifecycleViolationError('test', 'submitted');
    expect(e.statusCode).toBe(400);
    expect(e.requires).toBe('submitted');
    expect(e.name).toBe('LifecycleViolationError');
  });
});
