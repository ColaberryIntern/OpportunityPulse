// Deep Research Phase 3 — ventureLifecycle.service tests.

jest.mock('../../src/models', () => ({
  VentureIdea: { findByPk: jest.fn() },
  VentureLifecycleEvent: { create: jest.fn(), findAll: jest.fn() },
  ExecutionQueueItem: { update: jest.fn() },
}));

const { VentureIdea, VentureLifecycleEvent, ExecutionQueueItem } = require('../../src/models');
const svc = require('../../src/deepResearch/ventureLifecycle.service');

function fakeRow(initial) {
  const row = { ...initial };
  row.update = jest.fn(async (patch) => { Object.assign(row, patch); return row; });
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  VentureLifecycleEvent.create.mockResolvedValue({});
  VentureLifecycleEvent.findAll.mockResolvedValue([]);
  ExecutionQueueItem.update.mockResolvedValue([0]);
});

describe('ventureLifecycle.canTransition', () => {
  it('allows valid forward transitions', () => {
    expect(svc.canTransition('discovered', 'researching')).toBe(true);
    expect(svc.canTransition('evaluating', 'approved')).toBe(true);
    expect(svc.canTransition('building', 'validating')).toBe(true);
  });
  it('allows archiving from any state and reviving from archived', () => {
    expect(svc.canTransition('building', 'archived')).toBe(true);
    expect(svc.canTransition('archived', 'discovered')).toBe(true);
  });
  it('rejects illegal jumps', () => {
    expect(svc.canTransition('discovered', 'launching')).toBe(false);
    expect(svc.canTransition('approved', 'building')).toBe(false);
    expect(svc.canTransition('discovered', 'not_a_state')).toBe(false);
  });
});

describe('ventureLifecycle.transition', () => {
  it('rejects an unknown target state', async () => {
    await expect(svc.transition(1, 'bogus')).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('throws NOT_FOUND for a missing venture idea', async () => {
    VentureIdea.findByPk.mockResolvedValue(null);
    await expect(svc.transition(99, 'researching')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an illegal transition', async () => {
    VentureIdea.findByPk.mockResolvedValue(fakeRow({ id: 1, lifecycleState: 'discovered' }));
    await expect(svc.transition(1, 'launching')).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('rejects a no-op transition to the same state', async () => {
    VentureIdea.findByPk.mockResolvedValue(fakeRow({ id: 1, lifecycleState: 'evaluating' }));
    await expect(svc.transition(1, 'evaluating')).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });

  it('performs a valid transition: writes the event, updates state, syncs the queue item', async () => {
    const idea = fakeRow({ id: 1, lifecycleState: 'discovered' });
    VentureIdea.findByPk.mockResolvedValue(idea);
    await svc.transition(1, 'researching', { actor: 'ali@colaberry.com', note: 'looks promising' });
    expect(VentureLifecycleEvent.create).toHaveBeenCalledTimes(1);
    const event = VentureLifecycleEvent.create.mock.calls[0][0];
    expect(event.fromState).toBe('discovered');
    expect(event.toState).toBe('researching');
    expect(event.actor).toBe('ali@colaberry.com');
    expect(idea.lifecycleState).toBe('researching');
    expect(ExecutionQueueItem.update).toHaveBeenCalled();
  });
});

describe('ventureLifecycle.getLifecycle', () => {
  it('returns current state, allowed transitions, and the event history', async () => {
    VentureIdea.findByPk.mockResolvedValue(fakeRow({ id: 1, lifecycleState: 'evaluating', lifecycleOwner: 'ali' }));
    VentureLifecycleEvent.findAll.mockResolvedValue([
      { fromState: 'discovered', toState: 'researching', actor: 'ali', note: null, createdAt: new Date() },
      { fromState: 'researching', toState: 'evaluating', actor: 'ali', note: null, createdAt: new Date() },
    ]);
    const out = await svc.getLifecycle(1);
    expect(out.current_state).toBe('evaluating');
    expect(out.owner).toBe('ali');
    expect(out.allowed_transitions).toEqual(svc.TRANSITIONS.evaluating);
    expect(out.events).toHaveLength(2);
  });
});

describe('ventureLifecycle.setOwner', () => {
  it('sets the owner and syncs the queue item', async () => {
    const idea = fakeRow({ id: 1, lifecycleState: 'discovered' });
    VentureIdea.findByPk.mockResolvedValue(idea);
    const out = await svc.setOwner(1, 'ram@colaberry.com');
    expect(idea.lifecycleOwner).toBe('ram@colaberry.com');
    expect(out.owner).toBe('ram@colaberry.com');
    expect(ExecutionQueueItem.update).toHaveBeenCalled();
  });
});
