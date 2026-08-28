// Hiring packet summary logic from convex/hiringPackets.ts

interface PacketDocument {
  templateId: string;
  status: 'draft' | 'edited' | 'sent' | 'signed' | 'skipped';
  mandatory: boolean;
  secondaryLocale?: string;
}

function computePacketSummary(documents: PacketDocument[]) {
  const active = documents.filter((r) => r.status !== 'skipped');
  const signed = active.filter((r) => r.status === 'signed');
  const sent = active.filter((r) => r.status === 'sent');
  const draft = active.filter((r) => r.status === 'draft' || r.status === 'edited');
  const mandatoryOutstanding = active.filter((r) => r.mandatory && r.status !== 'signed');

  return {
    total: active.length,
    signed: signed.length,
    sent: sent.length,
    draft: draft.length,
    mandatoryOutstanding: mandatoryOutstanding.length,
    complete: active.length > 0 && mandatoryOutstanding.length === 0,
    secondaryLocale: documents[0]?.secondaryLocale ?? null,
  };
}

// Status transitions for packet documents
const PACKET_TRANSITIONS: Record<string, string[]> = {
  draft: ['edited', 'sent', 'skipped'],
  edited: ['draft', 'sent', 'skipped'],
  sent: ['signed'],
  signed: [],
  skipped: ['draft'],
};

function canPacketTransition(from: string, to: string): boolean {
  return PACKET_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Packet summary', () => {
  it('computes summary for mixed statuses', () => {
    const docs: PacketDocument[] = [
      { templateId: 't1', status: 'signed', mandatory: true },
      { templateId: 't2', status: 'signed', mandatory: true },
      { templateId: 't3', status: 'sent', mandatory: true },
      { templateId: 't4', status: 'draft', mandatory: false },
      { templateId: 't5', status: 'skipped', mandatory: false },
    ];
    const summary = computePacketSummary(docs);
    expect(summary.total).toBe(4); // skipped excluded
    expect(summary.signed).toBe(2);
    expect(summary.sent).toBe(1);
    expect(summary.draft).toBe(1);
    expect(summary.mandatoryOutstanding).toBe(1); // t3 not yet signed
    expect(summary.complete).toBe(false);
  });

  it('complete when all mandatory are signed', () => {
    const docs: PacketDocument[] = [
      { templateId: 't1', status: 'signed', mandatory: true },
      { templateId: 't2', status: 'draft', mandatory: false },
    ];
    expect(computePacketSummary(docs).complete).toBe(true);
  });

  it('empty packet is not complete', () => {
    expect(computePacketSummary([]).complete).toBe(false);
  });

  it('skipped documents excluded from total', () => {
    const docs: PacketDocument[] = [
      { templateId: 't1', status: 'signed', mandatory: true },
      { templateId: 't2', status: 'skipped', mandatory: false },
      { templateId: 't3', status: 'skipped', mandatory: false },
    ];
    const summary = computePacketSummary(docs);
    expect(summary.total).toBe(1);
    expect(summary.complete).toBe(true);
  });

  it('extracts secondaryLocale from first document', () => {
    const docs: PacketDocument[] = [
      { templateId: 't1', status: 'draft', mandatory: true, secondaryLocale: 'ru' },
    ];
    expect(computePacketSummary(docs).secondaryLocale).toBe('ru');
  });

  it('returns null secondaryLocale when empty', () => {
    expect(computePacketSummary([]).secondaryLocale).toBeNull();
  });
});

describe('Packet status transitions', () => {
  it('draft → edited', () => {
    expect(canPacketTransition('draft', 'edited')).toBe(true);
  });

  it('draft → sent', () => {
    expect(canPacketTransition('draft', 'sent')).toBe(true);
  });

  it('draft → skipped', () => {
    expect(canPacketTransition('draft', 'skipped')).toBe(true);
  });

  it('edited → sent', () => {
    expect(canPacketTransition('edited', 'sent')).toBe(true);
  });

  it('edited → draft (revert)', () => {
    expect(canPacketTransition('edited', 'draft')).toBe(true);
  });

  it('sent → signed', () => {
    expect(canPacketTransition('sent', 'signed')).toBe(true);
  });

  it('signed → nothing', () => {
    expect(canPacketTransition('signed', 'draft')).toBe(false);
    expect(canPacketTransition('signed', 'sent')).toBe(false);
  });

  it('skipped → draft (un-skip)', () => {
    expect(canPacketTransition('skipped', 'draft')).toBe(true);
  });

  it('cannot skip a signed document', () => {
    expect(canPacketTransition('signed', 'skipped')).toBe(false);
  });

  it('cannot directly sign from draft (must send first)', () => {
    expect(canPacketTransition('draft', 'signed')).toBe(false);
  });
});
