/**
 * Tests for convex/recruitment — pipeline transitions, CV gate, stage logic.
 *
 * These tests exercise the pure rules that govern the recruitment pipeline:
 * - ALLOWED_TRANSITIONS: which stage-to-stage moves are valid
 * - cvBlocksAdvance: whether the CV review gates a move
 * - Stage-specific behaviors (hired, rejected, etc.)
 */

// Replicate the constants from convex/recruitment.ts
const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  applied: ['screening', 'interview', 'rejected'],
  screening: ['interview', 'offer', 'rejected'],
  interview: ['offer', 'screening', 'rejected'],
  offer: ['hired', 'interview', 'rejected'],
  hired: ['offer'],
  rejected: ['applied', 'screening', 'interview', 'offer'],
};

const STAGES_BEHIND_CV_GATE = new Set(['interview', 'offer', 'hired']);

function cvBlocksAdvance(
  app: { cvFileUrl?: string; cvStatus?: string },
  newStage: string,
): boolean {
  if (!STAGES_BEHIND_CV_GATE.has(newStage)) return false;
  if (!app.cvFileUrl) return false;
  return app.cvStatus !== 'approved';
}

describe('recruitment ALLOWED_TRANSITIONS', () => {
  describe('applied stage', () => {
    it('can move to screening', () => {
      expect(ALLOWED_TRANSITIONS.applied).toContain('screening');
    });
    it('can move to interview', () => {
      expect(ALLOWED_TRANSITIONS.applied).toContain('interview');
    });
    it('can move to rejected', () => {
      expect(ALLOWED_TRANSITIONS.applied).toContain('rejected');
    });
    it('cannot move to offer', () => {
      expect(ALLOWED_TRANSITIONS.applied).not.toContain('offer');
    });
    it('cannot move to hired', () => {
      expect(ALLOWED_TRANSITIONS.applied).not.toContain('hired');
    });
  });

  describe('screening stage', () => {
    it('can move to interview', () => {
      expect(ALLOWED_TRANSITIONS.screening).toContain('interview');
    });
    it('can move to offer', () => {
      expect(ALLOWED_TRANSITIONS.screening).toContain('offer');
    });
    it('can move to rejected', () => {
      expect(ALLOWED_TRANSITIONS.screening).toContain('rejected');
    });
    it('cannot move to hired', () => {
      expect(ALLOWED_TRANSITIONS.screening).not.toContain('hired');
    });
  });

  describe('interview stage', () => {
    it('can move to offer', () => {
      expect(ALLOWED_TRANSITIONS.interview).toContain('offer');
    });
    it('can move back to screening', () => {
      expect(ALLOWED_TRANSITIONS.interview).toContain('screening');
    });
    it('can move to rejected', () => {
      expect(ALLOWED_TRANSITIONS.interview).toContain('rejected');
    });
    it('cannot move to hired', () => {
      expect(ALLOWED_TRANSITIONS.interview).not.toContain('hired');
    });
  });

  describe('offer stage', () => {
    it('can move to hired', () => {
      expect(ALLOWED_TRANSITIONS.offer).toContain('hired');
    });
    it('can move back to interview', () => {
      expect(ALLOWED_TRANSITIONS.offer).toContain('interview');
    });
    it('can move to rejected', () => {
      expect(ALLOWED_TRANSITIONS.offer).toContain('rejected');
    });
  });

  describe('hired (terminal)', () => {
    it('can only move to offer', () => {
      expect(ALLOWED_TRANSITIONS.hired).toEqual(['offer']);
    });
  });

  describe('rejected (reversible)', () => {
    it('can reopen to any earlier stage', () => {
      expect(ALLOWED_TRANSITIONS.rejected).toEqual(['applied', 'screening', 'interview', 'offer']);
    });
  });
});

describe('recruitment cvBlocksAdvance', () => {
  it('does not block non-gated stages', () => {
    // screening is not in the gate
    expect(cvBlocksAdvance({ cvFileUrl: 'url', cvStatus: 'pending' }, 'screening')).toBe(false);
  });

  it('does not block when no CV uploaded', () => {
    expect(cvBlocksAdvance({}, 'interview')).toBe(false);
  });

  it('does not block when CV is approved', () => {
    expect(cvBlocksAdvance({ cvFileUrl: 'url', cvStatus: 'approved' }, 'interview')).toBe(false);
  });

  it('blocks interview when CV is pending', () => {
    expect(cvBlocksAdvance({ cvFileUrl: 'url', cvStatus: 'pending' }, 'interview')).toBe(true);
  });

  it('blocks interview when CV is rejected', () => {
    expect(cvBlocksAdvance({ cvFileUrl: 'url', cvStatus: 'rejected' }, 'interview')).toBe(true);
  });

  it('blocks offer when CV is pending', () => {
    expect(cvBlocksAdvance({ cvFileUrl: 'url', cvStatus: 'pending' }, 'offer')).toBe(true);
  });

  it('blocks hired when CV is pending', () => {
    expect(cvBlocksAdvance({ cvFileUrl: 'url', cvStatus: 'pending' }, 'hired')).toBe(true);
  });

  it('blocks hired when CV is rejected', () => {
    expect(cvBlocksAdvance({ cvFileUrl: 'url', cvStatus: 'rejected' }, 'hired')).toBe(true);
  });

  it('allows interview when no cvFileUrl but has cvStatus', () => {
    expect(cvBlocksAdvance({ cvStatus: 'pending' }, 'interview')).toBe(false);
  });
});

describe('recruitment STAGES_BEHIND_CV_GATE', () => {
  it('contains interview', () => {
    expect(STAGES_BEHIND_CV_GATE.has('interview')).toBe(true);
  });
  it('contains offer', () => {
    expect(STAGES_BEHIND_CV_GATE.has('offer')).toBe(true);
  });
  it('contains hired', () => {
    expect(STAGES_BEHIND_CV_GATE.has('hired')).toBe(true);
  });
  it('does not contain applied', () => {
    expect(STAGES_BEHIND_CV_GATE.has('applied')).toBe(false);
  });
  it('does not contain screening', () => {
    expect(STAGES_BEHIND_CV_GATE.has('screening')).toBe(false);
  });
  it('does not contain rejected', () => {
    expect(STAGES_BEHIND_CV_GATE.has('rejected')).toBe(false);
  });
});

describe('recruitment pipeline integrity', () => {
  it('every stage has a transition map', () => {
    const allStages = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
    for (const stage of allStages) {
      expect(ALLOWED_TRANSITIONS[stage]).toBeDefined();
      expect(Array.isArray(ALLOWED_TRANSITIONS[stage])).toBe(true);
    }
  });

  it('applied → screening → interview → offer → hired is a valid path', () => {
    const path = ['applied', 'screening', 'interview', 'offer', 'hired'];
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]!;
      const to = path[i + 1]!;
      expect(ALLOWED_TRANSITIONS[from]).toContain(to);
    }
  });

  it('every stage can reach rejected (except hired)', () => {
    const rejectableStages = ['applied', 'screening', 'interview', 'offer'];
    for (const stage of rejectableStages) {
      expect(ALLOWED_TRANSITIONS[stage]).toContain('rejected');
    }
  });
});
