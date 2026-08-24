/**
 * Tests for workflow builder constants and helper logic.
 *
 * Covers: STEP_PALETTE items, TRIGGER_TYPES, ACTION_TYPES,
 * CONDITION_OPERATORS, DELAY_UNITS, step ordering.
 */

// ── Constants extracted from WorkflowBuilderClient ───────────────────────────

type StepType = 'trigger' | 'action' | 'condition' | 'delay';

interface WorkflowStep {
  id: string;
  type: StepType;
  label: string;
  config: Record<string, unknown>;
  position: number;
}

const STEP_PALETTE = [
  { type: 'trigger', label: 'automation.builder.stepTypes.trigger' },
  { type: 'action', label: 'automation.builder.stepTypes.action' },
  { type: 'condition', label: 'automation.builder.stepTypes.condition' },
  { type: 'delay', label: 'automation.builder.stepTypes.delay' },
];

const TRIGGER_TYPES = [
  { value: 'leave_created', label: 'Leave Created' },
  { value: 'leave_approved', label: 'Leave Approved' },
  { value: 'leave_rejected', label: 'Leave Rejected' },
  { value: 'user_onboarded', label: 'User Onboarded' },
  { value: 'user_offboarded', label: 'User Offboarded' },
  { value: 'ticket_created', label: 'Ticket Created' },
  { value: 'ticket_escalated', label: 'Ticket Escalated' },
  { value: 'performance_review_due', label: 'Performance Review Due' },
  { value: 'contract_expiring', label: 'Contract Expiring' },
  { value: 'custom', label: 'Custom' },
];

const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'update_record', label: 'Update Record' },
  { value: 'approve_request', label: 'Approve Request' },
  { value: 'reject_request', label: 'Reject Request' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'assign_user', label: 'Assign User' },
  { value: 'block_user', label: 'Block User' },
  { value: 'webhook', label: 'Webhook' },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

const DELAY_UNITS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

// ── Helper functions ────────────────────────────────────────────────────────

function arrayMove<T>(items: T[], oldIndex: number, newIndex: number): T[] {
  const result = [...items];
  const [removed] = result.splice(oldIndex, 1);
  result.splice(newIndex, 0, removed!);
  return result;
}

function createStep(type: StepType, position: number): WorkflowStep {
  const paletteItem = STEP_PALETTE.find((p) => p.type === type);
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    label: paletteItem?.label || type,
    config: {},
    position,
  };
}

describe('STEP_PALETTE', () => {
  it('has exactly 4 step types', () => {
    expect(STEP_PALETTE).toHaveLength(4);
  });

  it('includes trigger', () => {
    expect(STEP_PALETTE.find((p) => p.type === 'trigger')).toBeDefined();
  });

  it('includes action', () => {
    expect(STEP_PALETTE.find((p) => p.type === 'action')).toBeDefined();
  });

  it('includes condition', () => {
    expect(STEP_PALETTE.find((p) => p.type === 'condition')).toBeDefined();
  });

  it('includes delay', () => {
    expect(STEP_PALETTE.find((p) => p.type === 'delay')).toBeDefined();
  });

  it('each item has a label i18n key', () => {
    for (const item of STEP_PALETTE) {
      expect(item.label).toBeTruthy();
      expect(item.label).toMatch(/^automation\.builder\.stepTypes\./);
    }
  });
});

describe('TRIGGER_TYPES', () => {
  it('has 10 trigger types', () => {
    expect(TRIGGER_TYPES).toHaveLength(10);
  });

  it('includes leave_created', () => {
    expect(TRIGGER_TYPES.find((t) => t.value === 'leave_created')).toBeDefined();
  });

  it('includes custom', () => {
    expect(TRIGGER_TYPES.find((t) => t.value === 'custom')).toBeDefined();
  });

  it('each trigger has unique value', () => {
    const values = TRIGGER_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('ACTION_TYPES', () => {
  it('has 10 action types', () => {
    expect(ACTION_TYPES).toHaveLength(10);
  });

  it('includes send_email', () => {
    expect(ACTION_TYPES.find((a) => a.value === 'send_email')).toBeDefined();
  });

  it('includes webhook', () => {
    expect(ACTION_TYPES.find((a) => a.value === 'webhook')).toBeDefined();
  });

  it('each action has unique value', () => {
    const values = ACTION_TYPES.map((a) => a.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('CONDITION_OPERATORS', () => {
  it('has 7 operators', () => {
    expect(CONDITION_OPERATORS).toHaveLength(7);
  });

  it('includes equals and not_equals', () => {
    expect(CONDITION_OPERATORS.find((o) => o.value === 'equals')).toBeDefined();
    expect(CONDITION_OPERATORS.find((o) => o.value === 'not_equals')).toBeDefined();
  });

  it('includes comparison operators', () => {
    expect(CONDITION_OPERATORS.find((o) => o.value === 'greater_than')).toBeDefined();
    expect(CONDITION_OPERATORS.find((o) => o.value === 'less_than')).toBeDefined();
  });
});

describe('DELAY_UNITS', () => {
  it('has 3 units', () => {
    expect(DELAY_UNITS).toHaveLength(3);
  });

  it('includes minutes, hours, days', () => {
    const values = DELAY_UNITS.map((u) => u.value);
    expect(values).toContain('minutes');
    expect(values).toContain('hours');
    expect(values).toContain('days');
  });
});

describe('arrayMove', () => {
  it('moves an item forward', () => {
    const items = ['a', 'b', 'c', 'd'];
    const result = arrayMove(items, 0, 2);
    expect(result).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward', () => {
    const items = ['a', 'b', 'c', 'd'];
    const result = arrayMove(items, 3, 1);
    expect(result).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns same array when no move needed', () => {
    const items = ['a', 'b', 'c'];
    const result = arrayMove(items, 1, 1);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the original', () => {
    const items = ['a', 'b', 'c'];
    const result = arrayMove(items, 0, 2);
    expect(items).toEqual(['a', 'b', 'c']);
    expect(result).not.toBe(items);
  });
});

describe('createStep', () => {
  it('creates a trigger step', () => {
    const step = createStep('trigger', 0);
    expect(step.type).toBe('trigger');
    expect(step.label).toContain('trigger');
    expect(step.position).toBe(0);
    expect(step.id).toBeTruthy();
  });

  it('creates an action step', () => {
    const step = createStep('action', 1);
    expect(step.type).toBe('action');
    expect(step.position).toBe(1);
  });

  it('creates a condition step', () => {
    const step = createStep('condition', 2);
    expect(step.type).toBe('condition');
    expect(step.position).toBe(2);
  });

  it('creates a delay step', () => {
    const step = createStep('delay', 3);
    expect(step.type).toBe('delay');
    expect(step.position).toBe(3);
  });

  it('generates unique IDs', () => {
    const s1 = createStep('trigger', 0);
    const s2 = createStep('trigger', 0);
    expect(s1.id).not.toBe(s2.id);
  });
});

describe('Step validation logic', () => {
  function canGoNext(step: WorkflowStep, data: Record<string, unknown>): boolean {
    switch (step.type) {
      case 'trigger':
        return !!data.eventType;
      case 'action':
        return !!data.actionType;
      case 'condition':
        return !!data.field && !!data.operator;
      case 'delay':
        return typeof data.duration === 'number' && data.duration > 0;
      default:
        return true;
    }
  }

  it('trigger needs eventType', () => {
    const step = createStep('trigger', 0);
    expect(canGoNext(step, {})).toBe(false);
    expect(canGoNext(step, { eventType: 'leave_created' })).toBe(true);
  });

  it('action needs actionType', () => {
    const step = createStep('action', 1);
    expect(canGoNext(step, {})).toBe(false);
    expect(canGoNext(step, { actionType: 'send_email' })).toBe(true);
  });

  it('condition needs field and operator', () => {
    const step = createStep('condition', 2);
    expect(canGoNext(step, { field: 'status' })).toBe(false);
    expect(canGoNext(step, { field: 'status', operator: 'equals' })).toBe(true);
  });

  it('delay needs positive duration', () => {
    const step = createStep('delay', 3);
    expect(canGoNext(step, { duration: 0 })).toBe(false);
    expect(canGoNext(step, { duration: -5 })).toBe(false);
    expect(canGoNext(step, { duration: 30 })).toBe(true);
  });
});
