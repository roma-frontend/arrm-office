import {
  buildEventTimeline,
  buildTimelineIcs,
  buildTimelineSummary,
  formatTimelineDuration,
  parseLocalDate,
  type CustomTimelineData,
  type DriverTimelineData,
  type GoogleTimelineData,
  type LeaveTimelineData,
  type TimelineT,
} from '@/lib/eventTimeline';

/**
 * Echo the key back instead of translating, so assertions can pin down which
 * label the model picked without depending on the English copy. Interpolation
 * placeholders are still expanded, since the model relies on them.
 */
const t: TimelineT = (key, options) => {
  const value = options?.value;
  return value === undefined ? key : `${key}:${String(value)}`;
};

const LANG = 'en';

/** 2026-08-03 12:00 local. */
const NOW = new Date(2026, 7, 3, 12, 0, 0, 0).getTime();
const MS_PER_DAY = 86_400_000;

function leave(overrides: Partial<LeaveTimelineData> = {}): LeaveTimelineData {
  return {
    _id: 'leave1',
    userId: 'user1',
    userName: 'Ada Lovelace',
    userDepartment: 'Engineering',
    type: 'paid',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    days: 5,
    reason: 'Family trip',
    status: 'approved',
    createdAt: new Date(2026, 6, 20, 9, 30).getTime(),
    reviewedAt: new Date(2026, 6, 21, 14, 0).getTime(),
    reviewerName: 'Grace Hopper',
    ...overrides,
  };
}

function driver(overrides: Partial<DriverTimelineData> = {}): DriverTimelineData {
  return {
    _id: 'trip1',
    driverId: 'driver1',
    driverName: 'Alan Turing',
    driverVehicle: { model: 'Toyota Camry', plateNumber: '01AA001', capacity: 4, year: 2022 },
    bookedByName: 'Ada Lovelace',
    startTime: new Date(2026, 7, 3, 11, 0).getTime(),
    endTime: new Date(2026, 7, 3, 13, 30).getTime(),
    type: 'trip',
    status: 'in_progress',
    tripInfo: {
      from: 'Office',
      to: 'Airport',
      purpose: 'Client pickup',
      passengerCount: 2,
      notes: 'Two suitcases',
    },
    createdAt: new Date(2026, 7, 1, 10, 0).getTime(),
    ...overrides,
  };
}

function google(overrides: Partial<GoogleTimelineData> = {}): GoogleTimelineData {
  return {
    id: 'g1',
    title: 'Quarterly review',
    description: 'Numbers walkthrough',
    startDate: '2026-08-05',
    endDate: '2026-08-05',
    startTime: new Date(2026, 7, 5, 10, 0).toISOString(),
    endTime: new Date(2026, 7, 5, 11, 0).toISOString(),
    allDay: false,
    location: 'Room 4',
    htmlLink: 'https://calendar.google.com/event?eid=abc',
    ...overrides,
  };
}

function custom(overrides: Partial<CustomTimelineData> = {}): CustomTimelineData {
  return {
    id: 'c1',
    title: 'Sprint planning',
    date: '2026-08-04',
    startTime: '14:00',
    endTime: '15:30',
    allDay: false,
    location: 'Room 1',
    description: 'Plan the next two weeks',
    category: 'meeting',
    reminder: '30min',
    attendees: ['Ada Lovelace', 'Alan Turing'],
    createdAt: new Date(2026, 7, 2, 8, 0).getTime(),
    ...overrides,
  };
}

describe('parseLocalDate', () => {
  it('parses yyyy-MM-dd as local midnight, not UTC', () => {
    const ms = parseLocalDate('2026-08-03');
    expect(ms).toBe(new Date(2026, 7, 3, 0, 0, 0, 0).getTime());
    expect(new Date(ms!).getDate()).toBe(3);
  });

  it('applies an optional time component', () => {
    expect(parseLocalDate('2026-08-03', '14:45')).toBe(new Date(2026, 7, 3, 14, 45).getTime());
  });

  it('rejects malformed and out-of-range input', () => {
    expect(parseLocalDate('not-a-date')).toBeNull();
    expect(parseLocalDate('2026-8-3')).toBeNull();
    expect(parseLocalDate('2026-13-01')).toBeNull();
    expect(parseLocalDate('2026-08-03', '25:00')).toBe(
      new Date(2026, 7, 3, 0, 0).getTime(), // invalid time falls back to midnight
    );
  });
});

describe('formatTimelineDuration', () => {
  it('drops minutes once the span covers whole days', () => {
    expect(formatTimelineDuration(2 * 1440 + 4 * 60 + 15, t)).toBe(
      '2 eventTimeline.units.day 4 eventTimeline.units.hour',
    );
  });

  it('keeps minutes for sub-day spans', () => {
    expect(formatTimelineDuration(150, t)).toBe(
      '2 eventTimeline.units.hour 30 eventTimeline.units.minute',
    );
  });

  it('floors sub-minute spans', () => {
    expect(formatTimelineDuration(0, t)).toBe('< 1 eventTimeline.units.minute');
    expect(formatTimelineDuration(-10, t)).toBe('< 1 eventTimeline.units.minute');
  });
});

describe('buildEventTimeline — leave', () => {
  it('spans whole local days and reports an upcoming phase', () => {
    const timeline = buildEventTimeline(
      { source: 'leave', data: leave() },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.source).toBe('leave');
    expect(timeline.allDay).toBe(true);
    expect(timeline.start).toBe(new Date(2026, 7, 10, 0, 0).getTime());
    expect(timeline.end).toBe(new Date(2026, 7, 14, 0, 0).getTime() + MS_PER_DAY - 1);
    expect(timeline.phase).toBe('upcoming');
    expect(timeline.progress).toBe(0);
    expect(timeline.relativeLabel).toContain('eventTimeline.relative.starts');
  });

  it('lays out the review trail in order and marks past steps done', () => {
    const timeline = buildEventTimeline(
      { source: 'leave', data: leave() },
      { now: NOW, lang: LANG, t },
    );
    const ids = timeline.milestones.map((m) => m.id);

    // Already reviewed but not yet started, so "now" sits inside the trail.
    expect(ids).toEqual(['submitted', 'review', 'now', 'start', 'end']);

    const byId = new Map(timeline.milestones.map((m) => [m.id, m]));
    expect(byId.get('submitted')!.state).toBe('done');
    expect(byId.get('review')!.label).toBe('eventTimeline.milestones.approved');
    expect(byId.get('review')!.tone).toBe('success');
    expect(byId.get('review')!.state).toBe('done');
    expect(byId.get('start')!.state).toBe('upcoming');
  });

  it('places the now marker between start and end mid-leave', () => {
    const timeline = buildEventTimeline(
      { source: 'leave', data: leave({ startDate: '2026-08-01', endDate: '2026-08-05' }) },
      { now: NOW, lang: LANG, t },
    );
    const ids = timeline.milestones.map((m) => m.id);

    expect(timeline.phase).toBe('live');
    expect(ids.indexOf('now')).toBeGreaterThan(ids.indexOf('start'));
    expect(ids.indexOf('now')).toBeLessThan(ids.indexOf('end'));
  });

  it('drops the now marker once the leave is over', () => {
    const timeline = buildEventTimeline(
      { source: 'leave', data: leave({ startDate: '2026-07-01', endDate: '2026-07-05' }) },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.phase).toBe('past');
    expect(timeline.progress).toBe(100);
    expect(timeline.milestones.map((m) => m.id)).not.toContain('now');
  });

  it('shows a dateless "awaiting review" step while pending', () => {
    const timeline = buildEventTimeline(
      {
        source: 'leave',
        data: leave({ status: 'pending', reviewedAt: undefined, reviewerName: undefined }),
      },
      { now: NOW, lang: LANG, t },
    );
    const review = timeline.milestones.find((m) => m.id === 'review')!;

    expect(review.at).toBeNull();
    expect(review.state).toBe('current');
    expect(review.label).toBe('eventTimeline.milestones.awaitingReview');
    expect(timeline.status.tone).toBe('warning');
  });

  it('omits facts with no value and keeps the ones present', () => {
    const timeline = buildEventTimeline(
      {
        source: 'leave',
        data: leave({ reason: '   ', userDepartment: undefined, comment: 'Approved by HR' }),
      },
      { now: NOW, lang: LANG, t },
    );
    const ids = timeline.facts.map((f) => f.id);

    expect(ids).not.toContain('reason');
    expect(ids).not.toContain('department');
    expect(ids).toContain('comment');
    expect(timeline.facts.find((f) => f.id === 'comment')!.value).toBe('Approved by HR');
  });

  it('lists the employee and the reviewer as people', () => {
    const timeline = buildEventTimeline(
      { source: 'leave', data: leave() },
      { now: NOW, lang: LANG, t },
    );
    expect(timeline.people).toEqual([
      { name: 'Ada Lovelace', role: 'eventTimeline.roles.employee' },
      { name: 'Grace Hopper', role: 'eventTimeline.roles.reviewer' },
    ]);
  });
});

describe('buildEventTimeline — driver', () => {
  it('reports a live phase with partial progress and a now marker', () => {
    const timeline = buildEventTimeline(
      { source: 'driver', data: driver() },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.phase).toBe('live');
    expect(timeline.progress).toBe(40); // 60 min into a 150 min trip
    expect(timeline.durationLabel).toBe('2 eventTimeline.units.hour 30 eventTimeline.units.minute');

    const nowIndex = timeline.milestones.findIndex((m) => m.id === 'now');
    expect(nowIndex).toBeGreaterThan(0);
    expect(nowIndex).toBeLessThan(timeline.milestones.length - 1);
    // The marker must sit between the last past and the first future step.
    const before = timeline.milestones[nowIndex - 1]!.at!;
    const after = timeline.milestones[nowIndex + 1]!.at!;
    expect(before).toBeLessThanOrEqual(NOW);
    expect(after).toBeGreaterThan(NOW);
  });

  it('omits the now marker for events entirely in the past', () => {
    const past = driver({
      startTime: NOW - 5 * 3600_000,
      endTime: NOW - 4 * 3600_000,
      status: 'completed',
    });
    const timeline = buildEventTimeline(
      { source: 'driver', data: past },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.phase).toBe('past');
    expect(timeline.progress).toBe(100);
    expect(timeline.milestones.map((m) => m.id)).not.toContain('now');
  });

  it('includes the trip lifecycle steps that actually happened', () => {
    const timeline = buildEventTimeline(
      {
        source: 'driver',
        data: driver({
          arrivedAt: new Date(2026, 7, 3, 10, 50).getTime(),
          passengerPickedUpAt: new Date(2026, 7, 3, 11, 5).getTime(),
        }),
      },
      { now: NOW, lang: LANG, t },
    );
    const ids = timeline.milestones.map((m) => m.id);

    expect(ids).toContain('arrived');
    expect(ids).toContain('pickedUp');
    // Chronological, ignoring the dateless entries.
    const dated = timeline.milestones.map((m) => m.at).filter((at): at is number => at !== null);
    expect([...dated].sort((a, b) => a - b)).toEqual(dated);
  });

  it('reorders steps that happened out of narrative order', () => {
    // The driver showed up 20 minutes before the scheduled pickup, so "arrived"
    // must render above "pickup" even though the builder appends it after.
    const timeline = buildEventTimeline(
      { source: 'driver', data: driver({ arrivedAt: new Date(2026, 7, 3, 10, 40).getTime() }) },
      { now: NOW, lang: LANG, t },
    );
    const ids = timeline.milestones.map((m) => m.id);

    expect(ids.indexOf('arrived')).toBeLessThan(ids.indexOf('start'));
  });

  it('titles a trip by its route and a block by its type', () => {
    const trip = buildEventTimeline(
      { source: 'driver', data: driver() },
      { now: NOW, lang: LANG, t },
    );
    expect(trip.title).toBe('Office → Airport');

    const blocked = buildEventTimeline(
      {
        source: 'driver',
        data: driver({ type: 'blocked', tripInfo: undefined, reason: 'Service' }),
      },
      { now: NOW, lang: LANG, t },
    );
    expect(blocked.title).toBe('eventTimeline.driverType.blocked');
    expect(blocked.milestones.find((m) => m.id === 'start')!.label).toBe(
      'eventTimeline.milestones.blockStarts',
    );
  });

  it('prefers mapData distance over the tripInfo estimate', () => {
    const timeline = buildEventTimeline(
      {
        source: 'driver',
        data: driver({
          tripInfo: { from: 'A', to: 'B', purpose: 'x', passengerCount: 1, distanceKm: 5 },
          mapData: { distanceMeters: 12_300, durationSeconds: 900 },
        }),
      },
      { now: NOW, lang: LANG, t },
    );
    expect(timeline.facts.find((f) => f.id === 'distance')!.value).toBe(
      '12.3 eventTimeline.units.km',
    );
  });
});

describe('buildEventTimeline — google', () => {
  it('uses the ISO timestamps for a timed event', () => {
    const timeline = buildEventTimeline(
      { source: 'google', data: google() },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.start).toBe(new Date(2026, 7, 5, 10, 0).getTime());
    expect(timeline.end).toBe(new Date(2026, 7, 5, 11, 0).getTime());
    expect(timeline.externalUrl).toBe('https://calendar.google.com/event?eid=abc');
  });

  it('converts an exclusive all-day end into an inclusive one', () => {
    const timeline = buildEventTimeline(
      {
        source: 'google',
        data: google({
          allDay: true,
          startTime: null,
          endTime: null,
          startDate: '2026-08-05',
          endDate: '2026-08-07', // Google's exclusive end
        }),
      },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.allDay).toBe(true);
    // Last covered instant is just before Aug 7 midnight, i.e. still Aug 6.
    expect(new Date(timeline.end).getDate()).toBe(6);
  });

  it('never lets the end precede the start', () => {
    const timeline = buildEventTimeline(
      { source: 'google', data: google({ startTime: null, endTime: null, endDate: '2026-08-01' }) },
      { now: NOW, lang: LANG, t },
    );
    expect(timeline.end).toBeGreaterThanOrEqual(timeline.start);
  });
});

describe('buildEventTimeline — custom', () => {
  it('derives a reminder milestone from the reminder offset', () => {
    const timeline = buildEventTimeline(
      { source: 'custom', data: custom() },
      { now: NOW, lang: LANG, t },
    );
    const reminder = timeline.milestones.find((m) => m.id === 'reminder')!;

    expect(reminder.at).toBe(new Date(2026, 7, 4, 13, 30).getTime());
    expect(reminder.tone).toBe('warning');
  });

  it('has no reminder milestone when the reminder is "none"', () => {
    const timeline = buildEventTimeline(
      { source: 'custom', data: custom({ reminder: 'none' }) },
      { now: NOW, lang: LANG, t },
    );
    expect(timeline.milestones.map((m) => m.id)).not.toContain('reminder');
  });

  it('rolls an end time earlier than the start over to the next day', () => {
    const timeline = buildEventTimeline(
      { source: 'custom', data: custom({ startTime: '22:00', endTime: '01:00' }) },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.end).toBe(new Date(2026, 7, 5, 1, 0).getTime());
    expect(timeline.durationMinutes).toBe(180);
  });

  it('spans the whole day for an all-day event', () => {
    const timeline = buildEventTimeline(
      { source: 'custom', data: custom({ allDay: true }) },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.start).toBe(new Date(2026, 7, 4, 0, 0).getTime());
    expect(timeline.end).toBe(new Date(2026, 7, 4, 23, 59).getTime());
  });

  it('turns attendees into people and an attachment into a link fact', () => {
    const timeline = buildEventTimeline(
      { source: 'custom', data: custom({ attachmentUrl: 'https://files.example/agenda.pdf' }) },
      { now: NOW, lang: LANG, t },
    );

    expect(timeline.people).toHaveLength(2);
    expect(timeline.facts.find((f) => f.id === 'attachment')!.href).toBe(
      'https://files.example/agenda.pdf',
    );
  });
});

describe('buildTimelineIcs', () => {
  it('emits UTC timestamps for a timed event and escapes text', () => {
    const timeline = buildEventTimeline(
      {
        source: 'driver',
        data: driver({ tripInfo: { from: 'A; B', to: 'C, D', purpose: 'x', passengerCount: 1 } }),
      },
      { now: NOW, lang: LANG, t },
    );
    const ics = buildTimelineIcs(timeline, NOW);

    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
    expect(ics).toContain('UID:driver-trip1@office');
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toContain('END:VCALENDAR');
    // The route contains both a semicolon and a comma; both must be escaped.
    expect(ics).toContain('A\\; B → C\\, D');
  });

  it('uses VALUE=DATE with an exclusive end for all-day events', () => {
    const timeline = buildEventTimeline(
      { source: 'leave', data: leave() },
      { now: NOW, lang: LANG, t },
    );
    const ics = buildTimelineIcs(timeline, NOW);

    expect(ics).toContain('DTSTART;VALUE=DATE:20260810');
    expect(ics).toContain('DTEND;VALUE=DATE:20260815');
  });

  it('carries the location and external URL through', () => {
    const timeline = buildEventTimeline(
      { source: 'google', data: google() },
      { now: NOW, lang: LANG, t },
    );
    const ics = buildTimelineIcs(timeline, NOW);

    expect(ics).toContain('LOCATION:Room 4');
    expect(ics).toContain('URL:https://calendar.google.com/event?eid=abc');
  });
});

describe('buildTimelineSummary', () => {
  it('renders the header, every milestone and every fact', () => {
    const timeline = buildEventTimeline(
      { source: 'custom', data: custom() },
      { now: NOW, lang: LANG, t },
    );
    const summary = buildTimelineSummary(timeline, (ms) => `@${ms}`);

    expect(summary.split('\n')[0]).toBe('Sprint planning');
    for (const milestone of timeline.milestones) {
      expect(summary).toContain(milestone.label);
    }
    for (const fact of timeline.facts) {
      expect(summary).toContain(`${fact.label}: ${fact.value}`);
    }
  });

  it('renders a dash for milestones without a date', () => {
    const timeline = buildEventTimeline(
      { source: 'leave', data: leave({ status: 'pending', reviewedAt: undefined }) },
      { now: NOW, lang: LANG, t },
    );
    const summary = buildTimelineSummary(timeline, (ms) => `@${ms}`);

    expect(summary).toContain('• — — eventTimeline.milestones.awaitingReview');
  });
});
