import { canReadTask, orgForTask } from '../../convex/lib/taskAccess';

// Minimal mock types for testing pure functions
type Caller = {
  _id: string;
  role?: string;
  organizationId?: string;
  email?: string;
};

type Task = {
  _id: string;
  organizationId?: string;
  assignedTo?: string;
  assigneeIds?: string[];
  assignedBy?: string;
};

function makeCaller(overrides: Partial<Caller> = {}): Caller {
  return { _id: 'caller1', role: 'employee', organizationId: 'org1', ...overrides };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return { _id: 'task1', organizationId: 'org1', ...overrides };
}

describe('canReadTask', () => {
  it('allows superadmin to read any task', () => {
    const caller = makeCaller({ role: 'superadmin', organizationId: undefined });
    const task = makeTask({ organizationId: 'other-org' });
    expect(canReadTask(caller, task)).toBe(true);
  });

  it('allows same-org member to read task', () => {
    const caller = makeCaller({ organizationId: 'org1' });
    const task = makeTask({ organizationId: 'org1' });
    expect(canReadTask(caller, task)).toBe(true);
  });

  it('blocks cross-org read', () => {
    const caller = makeCaller({ organizationId: 'org1' });
    const task = makeTask({ organizationId: 'org2' });
    expect(canReadTask(caller, task)).toBe(false);
  });

  it('allows read on legacy task (no org)', () => {
    const caller = makeCaller({ organizationId: 'org1' });
    const task = makeTask({ organizationId: undefined });
    expect(canReadTask(caller, task)).toBe(true);
  });

  it('allows read when caller has no org', () => {
    const caller = makeCaller({ organizationId: undefined });
    const task = makeTask({ organizationId: 'org1' });
    expect(canReadTask(caller, task)).toBe(true);
  });
});

describe('orgForTask', () => {
  it('returns task organization when present', () => {
    const caller = makeCaller({ organizationId: 'org1' });
    const task = makeTask({ organizationId: 'org2' });
    expect(orgForTask(caller, task)).toBe('org2');
  });

  it('falls back to caller organization for legacy tasks', () => {
    const caller = makeCaller({ organizationId: 'org1' });
    const task = makeTask({ organizationId: undefined });
    expect(orgForTask(caller, task)).toBe('org1');
  });

  it('throws when neither has an organization', () => {
    const caller = makeCaller({ organizationId: undefined });
    const task = makeTask({ organizationId: undefined });
    expect(() => orgForTask(caller, task)).toThrow('no organization');
  });
});
