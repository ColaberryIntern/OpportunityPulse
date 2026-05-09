// Submission Readiness Engine v0.8 — pursuit state machine tests.

jest.mock('../../src/models', () => ({
  BonfireOpportunity: { findByPk: jest.fn() },
}));

const { BonfireOpportunity } = require('../../src/models');
const svc = require('../../src/bonfire/bonfirePursuit.service');

function fakeOpp(overrides = {}) {
  return Object.assign({
    id: 'opp-1',
    pursuitStatus: 'none',
    pursuedAt: null,
    pursuedBy: null,
    save: jest.fn(async function save() { return this; }),
  }, overrides);
}

beforeEach(() => {
  BonfireOpportunity.findByPk.mockReset();
});

describe('bonfirePursuit.getStatus', () => {
  it('returns the current pursuit fields', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(fakeOpp({
      pursuitStatus: 'pursuing',
      pursuedAt: new Date('2026-05-09'),
      pursuedBy: 7,
    }));
    const out = await svc.getStatus('opp-1');
    expect(out.pursuit_status).toBe('pursuing');
    expect(out.pursued_by).toBe(7);
  });

  it('throws NOT_FOUND when opp does not exist', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(null);
    await expect(svc.getStatus('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('bonfirePursuit.transition', () => {
  it('transitions none → pursuing and stamps pursuedAt + pursuedBy', async () => {
    const opp = fakeOpp({ pursuitStatus: 'none' });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.transition('opp-1', { to: 'pursuing', userId: 42 });
    expect(out.transitioned).toBe(true);
    expect(out.from).toBe('none');
    expect(out.pursuit_status).toBe('pursuing');
    expect(opp.pursuedBy).toBe(42);
    expect(opp.pursuedAt).toBeInstanceOf(Date);
    expect(opp.save).toHaveBeenCalled();
  });

  it('is idempotent — same-state transition is a no-op, transitioned=false', async () => {
    const opp = fakeOpp({ pursuitStatus: 'pursuing', pursuedAt: new Date('2026-05-08'), pursuedBy: 1 });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.transition('opp-1', { to: 'pursuing', userId: 99 });
    expect(out.transitioned).toBe(false);
    expect(out.pursuit_status).toBe('pursuing');
    // Original audit fields preserved.
    expect(opp.pursuedBy).toBe(1);
    expect(opp.save).not.toHaveBeenCalled();
  });

  it('allows pursuing → declined (cancel after considering the bid)', async () => {
    const opp = fakeOpp({ pursuitStatus: 'pursuing', pursuedAt: new Date('2026-05-08'), pursuedBy: 1 });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.transition('opp-1', { to: 'declined', userId: 1 });
    expect(out.transitioned).toBe(true);
    expect(out.pursuit_status).toBe('declined');
    // Decline keeps the historical audit trail.
    expect(opp.pursuedAt).toBeInstanceOf(Date);
    expect(opp.pursuedBy).toBe(1);
  });

  it('allows pursuing → none and clears audit fields (true reset)', async () => {
    const opp = fakeOpp({ pursuitStatus: 'pursuing', pursuedAt: new Date('2026-05-08'), pursuedBy: 1 });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.transition('opp-1', { to: 'none', userId: 1 });
    expect(out.transitioned).toBe(true);
    expect(opp.pursuedAt).toBeNull();
    expect(opp.pursuedBy).toBeNull();
  });

  it('allows declined → pursuing (re-engagement after a prior decline)', async () => {
    const opp = fakeOpp({ pursuitStatus: 'declined' });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    const out = await svc.transition('opp-1', { to: 'pursuing', userId: 5 });
    expect(out.transitioned).toBe(true);
    expect(out.pursuit_status).toBe('pursuing');
  });

  it('rejects illegal transitions (none → submitted) with code ILLEGAL_TRANSITION', async () => {
    const opp = fakeOpp({ pursuitStatus: 'none' });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    await expect(svc.transition('opp-1', { to: 'submitted' }))
      .rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
    expect(opp.save).not.toHaveBeenCalled();
  });

  it('rejects transitions out of submitted (terminal state)', async () => {
    const opp = fakeOpp({ pursuitStatus: 'submitted' });
    BonfireOpportunity.findByPk.mockResolvedValue(opp);
    await expect(svc.transition('opp-1', { to: 'pursuing' }))
      .rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' });
  });

  it('rejects unknown target statuses', async () => {
    BonfireOpportunity.findByPk.mockResolvedValue(fakeOpp());
    await expect(svc.transition('opp-1', { to: 'bogus' }))
      .rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });
});
