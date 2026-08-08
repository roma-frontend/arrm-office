/**
 * Company events on the shared calendar.
 *
 * Events created in /admin/events live in `companyEvents`, a different table from
 * the calendar's own `calendarEvents`, and the calendar never read it — so an
 * organization-wide event was missing from the organization's own calendar. These
 * tests cover the two pieces that decide whether it shows up and what it says:
 * the personal-view ownership rule and the timeline the detail views render.
 */

import { describe, it, expect } from '@jest/globals';
import { isMyCompanyEvent, filterForScope } from '@/lib/calendarScope';
import {
  buildEventTimeline,
  COMPANY_EVENT_ACCENTS,
  type CompanyTimelineData,
} from '@/lib/eventTimeline';

const viewer = { id: 'u-1', name: 'Ann Petrosyan', department: 'Finance' };

const baseEvent: CompanyTimelineData = {
  id: 'ev-1',
  name: 'ADB Annual Meeting',
  description: 'Annual gathering of the whole company',
  // 22 May 2026, local midnight.
  startDate: new Date(2026, 4, 22).getTime(),
  endDate: new Date(2026, 4, 23).getTime(),
  isAllDay: true,
  eventType: 'conference',
  priority: 'high',
  requiredDepartments: [],
  creatorName: 'Roman Gulanyan',
  notifyDaysBefore: 3,
  createdAt: new Date(2026, 4, 1).getTime(),
};

/** `t` echoing the key, so assertions read as the keys the UI must have. */
const t = (key: string, options?: Record<string, unknown>) =>
  options && 'count' in options ? `${key}:${String(options.count)}` : key;

const options = { now: new Date(2026, 4, 20).getTime(), lang: 'en', t };

describe('isMyCompanyEvent', () => {
  it('treats an event with no named audience as everyone’s', () => {
    // The whole point of the feature: an org-wide event must not be filtered out
    // of the personal view.
    expect(isMyCompanyEvent({ requiredDepartments: [], requiredEmployeeIds: [] }, viewer)).toBe(
      true,
    );
  });

  it('keeps an event for the department it names', () => {
    expect(isMyCompanyEvent({ requiredDepartments: ['Finance'] }, viewer)).toBe(true);
    expect(isMyCompanyEvent({ requiredDepartments: ['  finance '] }, viewer)).toBe(true);
  });

  it('drops an event aimed at another department', () => {
    expect(isMyCompanyEvent({ requiredDepartments: ['Legal'] }, viewer)).toBe(false);
  });

  it('keeps an event that names the viewer, whatever their department', () => {
    expect(
      isMyCompanyEvent({ requiredDepartments: ['Legal'], requiredEmployeeIds: ['u-1'] }, viewer),
    ).toBe(true);
  });

  it('keeps an event the viewer organized', () => {
    expect(isMyCompanyEvent({ createdBy: 'u-1', requiredDepartments: ['Legal'] }, viewer)).toBe(
      true,
    );
  });

  it('drops a targeted event from a viewer with no department', () => {
    expect(
      isMyCompanyEvent({ requiredDepartments: ['Finance'] }, { id: 'u-9', name: 'No Dept' }),
    ).toBe(false);
  });

  it('shows everything in the team scope', () => {
    const events = [{ requiredDepartments: ['Legal'] }, { requiredDepartments: [] }];
    expect(filterForScope(events, 'team', (e) => isMyCompanyEvent(e, viewer))).toHaveLength(2);
    expect(filterForScope(events, 'mine', (e) => isMyCompanyEvent(e, viewer))).toHaveLength(1);
  });
});

describe('company event timeline', () => {
  it('gives an all-day event the whole of its last day', () => {
    const timeline = buildEventTimeline({ source: 'company', data: baseEvent }, options);
    const end = new Date(timeline.end);
    expect(end.getDate()).toBe(23);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('does not collapse a single-day all-day event to zero length', () => {
    // Stored at the start of its day, so a naive end would equal the start and
    // the event would read as already finished.
    const timeline = buildEventTimeline(
      { source: 'company', data: { ...baseEvent, endDate: baseEvent.startDate } },
      options,
    );
    expect(timeline.end).toBeGreaterThan(timeline.start);
    expect(timeline.durationMinutes).toBeGreaterThan(0);
  });

  it('keeps exact times for an event that is not all-day', () => {
    const start = new Date(2026, 4, 22, 14, 30).getTime();
    const end = new Date(2026, 4, 22, 16, 0).getTime();
    const timeline = buildEventTimeline(
      {
        source: 'company',
        data: { ...baseEvent, isAllDay: false, startDate: start, endDate: end },
      },
      options,
    );
    expect(timeline.start).toBe(start);
    expect(timeline.end).toBe(end);
    expect(timeline.durationMinutes).toBe(90);
  });

  it('reports the phase against the given clock', () => {
    expect(buildEventTimeline({ source: 'company', data: baseEvent }, options).phase).toBe(
      'upcoming',
    );
    expect(
      buildEventTimeline(
        { source: 'company', data: baseEvent },
        { ...options, now: new Date(2026, 4, 22, 12, 0).getTime() },
      ).phase,
    ).toBe('live');
    expect(
      buildEventTimeline(
        { source: 'company', data: baseEvent },
        { ...options, now: new Date(2026, 4, 30).getTime() },
      ).phase,
    ).toBe('past');
  });

  it('colours the event by its type', () => {
    const timeline = buildEventTimeline({ source: 'company', data: baseEvent }, options);
    expect(timeline.accent).toBe(COMPANY_EVENT_ACCENTS.conference);
  });

  it('states the audience', () => {
    const wholeCompany = buildEventTimeline({ source: 'company', data: baseEvent }, options);
    expect(wholeCompany.status.label).toBe('eventTimeline.status.wholeCompany');

    const targeted = buildEventTimeline(
      { source: 'company', data: { ...baseEvent, requiredDepartments: ['Finance'] } },
      options,
    );
    expect(targeted.status.label).toBe('eventTimeline.status.attendanceRequired');
  });

  it('lists the organizer, the type and a link to the event page', () => {
    const timeline = buildEventTimeline({ source: 'company', data: baseEvent }, options);
    const facts = new Map(timeline.facts.map((f) => [f.id, f]));

    expect(facts.get('organizer')?.value).toBe('Roman Gulanyan');
    expect(facts.get('type')?.value).toBe('event.types.conference');
    expect(facts.get('description')?.value).toBe('Annual gathering of the whole company');
    expect(facts.get('eventPage')?.href).toBe('/events/ev-1');
  });

  it('omits facts it has no data for', () => {
    const timeline = buildEventTimeline(
      {
        source: 'company',
        data: { ...baseEvent, description: undefined, creatorName: undefined, priority: undefined },
      },
      options,
    );
    const ids = timeline.facts.map((f) => f.id);
    expect(ids).not.toContain('description');
    expect(ids).not.toContain('organizer');
    expect(ids).not.toContain('priority');
  });

  it('places the reminder the configured number of days ahead', () => {
    const timeline = buildEventTimeline({ source: 'company', data: baseEvent }, options);
    const reminder = timeline.milestones.find((m) => m.id === 'reminder');
    expect(reminder?.at).toBe(baseEvent.startDate - 3 * 86_400_000);
  });

  it('drops the reminder when none is configured', () => {
    const timeline = buildEventTimeline(
      { source: 'company', data: { ...baseEvent, notifyDaysBefore: 0 } },
      options,
    );
    expect(timeline.milestones.some((m) => m.id === 'reminder')).toBe(false);
  });

  it('labels the source', () => {
    const timeline = buildEventTimeline({ source: 'company', data: baseEvent }, options);
    expect(timeline.sourceLabel).toBe('eventTimeline.sources.company');
  });

  it('survives an end before the start', () => {
    const timeline = buildEventTimeline(
      { source: 'company', data: { ...baseEvent, endDate: baseEvent.startDate - 86_400_000 } },
      options,
    );
    expect(timeline.end).toBeGreaterThanOrEqual(timeline.start);
  });
});
