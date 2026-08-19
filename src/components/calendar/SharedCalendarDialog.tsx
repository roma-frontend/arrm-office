'use client';

/**
 * Shared Calendar — the colleague picker behind the calendar's "shared" view.
 *
 * The shared view is opt-in by design: everyone lands on their own calendar,
 * and this dialog is the only door into somebody else's. It lists the whole
 * organization grouped by department, with a per-person access state decided
 * by the calendar-access requests: a granted colleague opens immediately, a
 * pending one shows the request as sent, and everyone else offers to send the
 * request right from the row.
 *
 * The organization head (and anyone else the head approved for org-wide
 * access) additionally sees an "entire organization" entry at the top — the
 * only place that scope can be entered now, so the header itself never needs
 * a second switcher.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, Clock3, Eye, Search, Send, User, Users } from 'lucide-react';
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
import type { Id } from '@/convex/_generated/dataModel';

export interface SharedCalendarPerson {
  _id: Id<'users'>;
  name: string;
  department?: string;
  position?: string;
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
  /** Org-wide approval implicitly opens every colleague's calendar (org head). */
  orgGrantsPeople: boolean;
  activeView: ActiveView;
  onSelectMine: () => void;
  onSelectPerson: (userId: string) => void;
  onRequestPerson: (userId: string) => void;
  onSelectOrganization: () => void;
}

const NO_DEPARTMENT = '\u00a0-';

export function SharedCalendarDialog({
  open,
  onClose,
  people,
  organizationAccess,
  personAccess,
  orgGrantsPeople,
  activeView,
  onSelectMine,
  onSelectPerson,
  onRequestPerson,
  onSelectOrganization,
}: SharedCalendarDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  /** Org-approved viewers can open anyone's calendar without a person request. */
  const effectiveStatus = (userId: string): PersonAccessStatus =>
    orgGrantsPeople && organizationAccess === 'approved'
      ? 'approved'
      : (personAccess[userId] ?? 'none');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      [p.name, p.department, p.position].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [people, query]);

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
  }, [filtered]);

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
            {t(
              'calendarShared.subtitle',
              'Pick a colleague to see their calendar. Without access, send the request right here.',
            )}
          </SheetDescription>
          {/* Search */}
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
        </SheetHeader>

        <SheetBody className="space-y-5 px-5 py-5 sm:px-6">
          {/* Me */}
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

          {/* Organization-wide option — only for viewers whose access the head
              has approved; it is the single entry point into the team scope. */}
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

          {/* Colleagues by department */}
          {filtered.length === 0 ? (
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
                  const status = effectiveStatus(person._id);
                  const isActive = activeView.type === 'person' && activeView.userId === person._id;
                  return (
                    <div
                      key={person._id}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                        isActive
                          ? 'border-(--brand-outline) bg-(--brand-quiet)'
                          : 'border-(--border)'
                      }`}
                    >
                      <Avatar className="size-9 shrink-0">
                        <AvatarFallback>{getInitials(person.name).slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-(--text-primary)">
                          {person.name}
                        </p>
                        <p className="truncate text-caption text-(--text-muted)">
                          {person.position}
                        </p>
                      </div>
                      {status === 'approved' &&
                        viewButton(
                          t('calendarShared.view', 'View'),
                          () => {
                            onSelectPerson(person._id);
                            onClose();
                          },
                          isActive,
                        )}
                      {status === 'pending' && (
                        <Badge variant="warning" className="gap-1 px-2.5 py-1">
                          <Clock3 className="h-3 w-3" />
                          {t('calendarShared.requestSent', 'Request sent')}
                        </Badge>
                      )}
                      {status === 'none' && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => onRequestPerson(person._id)}
                        >
                          <Send className="h-3.5 w-3.5" />
                          {t('calendarShared.requestAccess', 'Request access')}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export default SharedCalendarDialog;
