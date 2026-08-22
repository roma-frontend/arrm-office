'use client';

/**
 * Shared Calendar — the picker behind the calendar's "shared" view.
 *
 * The shared view is opt-in by design: everyone lands on their own calendar and
 * this dialog is the only door into somebody else's. It has two sides.
 *
 * "Calendars" pins the calendars you already hold a grant for at the top,
 * ordered by when you last opened them, so coming back to a colleague is one
 * click and never a second request. Below that sits the rest of the
 * organization grouped by department, where a row either shows the request as
 * already sent or offers to send it. A colleague's calendar always needs that
 * colleague's own approval — organization-wide access opens the organization
 * entry only, because the events query enforces exactly the same rule and a
 * "View" button the server would refuse is worse than no button at all.
 *
 * "Access to my calendar" is the other direction: who the viewer has let in,
 * each with a revoke, so a key you handed out stays visible instead of being a
 * one-way door you forget about.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  Check,
  Clock3,
  Eye,
  History,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/stringUtils';
import { formatRelativeTime } from '@/lib/date-format';
import type { Id } from '@/convex/_generated/dataModel';

export interface SharedCalendarPerson {
  _id: Id<'users'>;
  name: string;
  department?: string;
  position?: string;
}

/**
 * A colleague's calendar the viewer may already open, read straight from the
 * stored grants — this list is what makes "just pick it again" possible.
 */
export interface AvailableCalendar {
  userId: string;
  name: string;
  position?: string;
  grantedAt: number;
  lastViewedAt?: number;
}

/** Someone the viewer has let into their own calendar. */
export interface CalendarViewer {
  _id: Id<'calendarAccess'>;
  viewerId: string;
  viewerName: string;
  viewerPosition?: string;
  scope: 'person' | 'organization';
  grantedAt: number;
  lastViewedAt?: number;
}

export type PersonAccessStatus = 'approved' | 'pending' | 'none';
export type OrganizationAccessStatus = 'approved' | 'pending' | 'none';

export type ActiveView =
  | { type: 'mine' }
  | { type: 'person'; userId: string }
  | { type: 'organization' };

interface SharedCalendarDialogProps {
  open: boolean;
  onClose: () => void;
  /** Everyone in the organization except the viewer, incl. department/position. */
  people: SharedCalendarPerson[];
  /** Access state of the viewer toward the organization-wide calendar. */
  organizationAccess: OrganizationAccessStatus;
  /** Access state of the viewer toward each colleague's calendar. */
  personAccess: Record<string, PersonAccessStatus>;
  /** Calendars already granted to the viewer, shown as the quick-pick section. */
  availableCalendars?: AvailableCalendar[];
  /** Colleagues the viewer granted access to, for the second tab. */
  viewers?: CalendarViewer[];
  activeView: ActiveView;
  onSelectMine: () => void;
  onSelectPerson: (userId: string) => void;
  onRequestPerson: (userId: string) => void;
  onSelectOrganization: () => void;
  onRevokeViewer?: (accessId: Id<'calendarAccess'>) => void;
}

const NO_DEPARTMENT = '\u00a0-';

type DialogTab = 'browse' | 'viewers';

export function SharedCalendarDialog({
  open,
  onClose,
  people,
  organizationAccess,
  personAccess,
  availableCalendars = [],
  viewers = [],
  activeView,
  onSelectMine,
  onSelectPerson,
  onRequestPerson,
  onSelectOrganization,
  onRevokeViewer,
}: SharedCalendarDialogProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<DialogTab>('browse');

  const needle = query.trim().toLowerCase();
  const hits = (fields: (string | undefined)[]): boolean =>
    !needle || fields.some((field) => field?.toLowerCase().includes(needle));

  /** Granted calendars, most recently opened first — the point of the section. */
  const available = [...availableCalendars]
    .filter((entry) => hits([entry.name, entry.position]))
    .sort((a, b) => (b.lastViewedAt ?? b.grantedAt) - (a.lastViewedAt ?? a.grantedAt));

  // Anyone in the quick-pick section is left out of the department groups below,
  // so the same colleague never shows up twice with two different buttons.
  const grantedIds = useMemo(
    () => new Set(availableCalendars.map((entry) => entry.userId)),
    [availableCalendars],
  );
  const filtered = people.filter(
    (person) =>
      !grantedIds.has(person._id) && hits([person.name, person.department, person.position]),
  );

  const groups = useMemo(() => {
    const map = new Map<string, SharedCalendarPerson[]>();
    for (const person of filtered) {
      const key = person.department?.trim() || NO_DEPARTMENT;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(person);
    }
    const nameless = map.get(NO_DEPARTMENT);
    map.delete(NO_DEPARTMENT);
    const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (nameless) sorted.push([NO_DEPARTMENT, nameless]);
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, grantedIds, needle]);

  const mineActive = activeView.type === 'mine';

  const viewButton = (label: string, onSelect: () => void, active: boolean): React.ReactNode =>
    active ? (
      <Badge variant="primary" className="gap-1">
        <Check className="h-3 w-3" />
        {t('calendarShared.viewing', 'Viewing')}
      </Badge>
    ) : (
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onSelect}>
        <Eye className="h-3.5 w-3.5" />
        {label}
      </Button>
    );

  /** "Last opened 2 days ago", or nothing for a grant never used yet. */
  const lastOpened = (timestamp?: number): string | undefined =>
    timestamp
      ? t('calendarShared.lastOpened', {
          defaultValue: 'Last opened {{time}}',
          time: formatRelativeTime(timestamp, i18n.language),
        })
      : undefined;

  const tabButton = (value: DialogTab, label: string, count: number): React.ReactNode => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`flex-1 rounded-field px-3 py-1.5 text-sm font-medium transition-colors ${
        tab === value
          ? 'bg-(--background) text-(--text-primary) shadow-sm'
          : 'text-(--text-muted) hover:text-(--text-primary)'
      }`}
    >
      {count > 0 ? `${label} (${count})` : label}
    </button>
  );

  const personRow = (
    key: string,
    name: string,
    caption: string | undefined,
    active: boolean,
    action: React.ReactNode,
  ): React.ReactNode => (
    <div
      key={key}
      className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
        active ? 'border-(--brand-outline) bg-(--brand-quiet)' : 'border-(--border)'
      }`}
    >
      <Avatar className="size-9 shrink-0">
        <AvatarFallback>{getInitials(name).slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-(--text-primary)">{name}</p>
        <p className="truncate text-caption text-(--text-muted)">{caption}</p>
      </div>
      {action}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')} className="p-0">
        <SheetHeader className="gap-2.5 px-5 pb-0 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-field bg-(--brand-quiet) text-(--brand-text)">
              <Users className="size-4" />
            </span>
            <SheetTitle>{t('calendarShared.title', 'Shared calendar')}</SheetTitle>
          </div>
          <SheetDescription>
            {tab === 'browse'
              ? t(
                  'calendarShared.subtitle',
                  'Pick a colleague to see their calendar. Without access, send the request right here.',
                )
              : t(
                  'calendarShared.viewersSubtitle',
                  'Everyone you let into your calendar. You can take access back at any time.',
                )}
          </SheetDescription>
          <div
            role="tablist"
            aria-label={t('calendarShared.title', 'Shared calendar')}
            className="flex gap-1 rounded-control bg-(--background-subtle) p-1"
          >
            {tabButton('browse', t('calendarShared.tabCalendars', 'Calendars'), available.length)}
            {tabButton('viewers', t('calendarShared.tabViewers', 'Who sees mine'), viewers.length)}
          </div>
          {tab === 'browse' && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t(
                  'calendarShared.searchPlaceholder',
                  'Search by name, department, or position…',
                )}
                className="h-10 w-full rounded-control border border-(--border-default) bg-(--background) pl-9 pr-3 text-sm text-(--text-primary) outline-none placeholder:text-(--text-muted) focus-visible:ring-[3px] focus-visible:ring-ring/25"
                aria-label={t('calendarShared.searchAriaLabel', 'Search colleagues')}
              />
            </div>
          )}
        </SheetHeader>

        <SheetBody className="space-y-5 px-5 py-5 sm:px-6">
          {tab === 'viewers' ? (
            viewers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <ShieldCheck className="h-8 w-8 text-(--border)" />
                <p className="text-sm text-(--text-muted)">
                  {t('calendarShared.noViewers', 'Nobody can see your calendar yet.')}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {viewers.map((viewer) =>
                  personRow(
                    viewer._id,
                    viewer.viewerName,
                    viewer.scope === 'organization'
                      ? t('calendarShared.viewerOrgScope', 'Organization calendar')
                      : (lastOpened(viewer.lastViewedAt) ?? viewer.viewerPosition),
                    false,
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => onRevokeViewer?.(viewer._id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('calendarShared.revoke', 'Revoke')}
                    </Button>,
                  ),
                )}
              </div>
            )
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onSelectMine();
                  onClose();
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                  mineActive
                    ? 'border-(--brand-outline) bg-(--brand-quiet)'
                    : 'border-(--border) bg-(--background-subtle) hover:border-(--primary)/50'
                }`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--brand) text-white">
                  <User className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-(--text-primary)">
                    {t('calendarShared.myCalendar', 'My calendar')}
                  </span>
                </span>
                {mineActive && <Check className="size-4 shrink-0 text-(--brand-text)" />}
              </button>

              {/* Organization-wide option — only for viewers the head approved;
                  it is the single entry point into the team scope, and the only
                  scope that org-wide approval unlocks. */}
              {organizationAccess === 'approved' && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectOrganization();
                    onClose();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
                    activeView.type === 'organization'
                      ? 'border-(--brand-outline) bg-(--brand-quiet)'
                      : 'border-(--border) bg-(--background-subtle) hover:border-(--primary)/50'
                  }`}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--brand) text-white">
                    <Building2 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-(--text-primary)">
                      {t('calendarAccess.entireOrganization', 'Entire organization')}
                    </span>
                    <span className="block truncate text-caption text-(--text-muted)">
                      {t(
                        'calendarShared.entireOrganizationDesc',
                        'Leaves, bookings and events across the whole organization',
                      )}
                    </span>
                  </span>
                  {activeView.type === 'organization' && (
                    <Check className="size-4 shrink-0 text-(--brand-text)" />
                  )}
                </button>
              )}

              {/* Calendars already granted to the viewer. Kept above the
                  directory because re-opening a colleague you were approved for
                  is the common case; the request flow is the exception. */}
              {available.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <History className="size-3.5 shrink-0 text-(--text-muted)" />
                    <h4 className="text-label font-semibold uppercase tracking-wider text-(--text-muted)">
                      {t('calendarShared.availableTitle', 'Calendars you can open')}
                    </h4>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {available.length}
                    </Badge>
                    <div className="h-px flex-1 bg-(--border)" />
                  </div>
                  {available.map((entry) => {
                    const isActive =
                      activeView.type === 'person' && activeView.userId === entry.userId;
                    return personRow(
                      entry.userId,
                      entry.name,
                      lastOpened(entry.lastViewedAt) ?? entry.position,
                      isActive,
                      viewButton(
                        t('calendarShared.view', 'View'),
                        () => {
                          onSelectPerson(entry.userId);
                          onClose();
                        },
                        isActive,
                      ),
                    );
                  })}
                </div>
              )}

              {filtered.length === 0 && available.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Users className="h-8 w-8 text-(--border)" />
                  <p className="text-sm text-(--text-muted)">{t('calendarShared.noEmployees')}</p>
                </div>
              ) : (
                groups.map(([department, members]) => (
                  <div key={department} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h4 className="text-label font-semibold uppercase tracking-wider text-(--text-muted)">
                        {department === NO_DEPARTMENT
                          ? t('calendarShared.noDepartment', 'No department')
                          : department}
                      </h4>
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {members.length}
                      </Badge>
                      <div className="h-px flex-1 bg-(--border)" />
                    </div>
                    {members.map((person) => {
                      const status = personAccess[person._id] ?? 'none';
                      const isActive =
                        activeView.type === 'person' && activeView.userId === person._id;
                      return personRow(
                        person._id,
                        person.name,
                        person.position,
                        isActive,
                        status === 'approved' ? (
                          viewButton(
                            t('calendarShared.view', 'View'),
                            () => {
                              onSelectPerson(person._id);
                              onClose();
                            },
                            isActive,
                          )
                        ) : status === 'pending' ? (
                          <Badge variant="warning" className="gap-1 px-2.5 py-1">
                            <Clock3 className="h-3 w-3" />
                            {t('calendarShared.requestSent', 'Request sent')}
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => onRequestPerson(person._id)}
                          >
                            <Send className="h-3.5 w-3.5" />
                            {t('calendarShared.requestAccess', 'Request access')}
                          </Button>
                        ),
                      );
                    })}
                  </div>
                ))
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export default SharedCalendarDialog;
