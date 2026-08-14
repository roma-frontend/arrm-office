/**
 * The dated news list: what appears in the feed, and when.
 *
 * An admin fills a row in once — the copy in every language, the day or the range
 * of days, and whether it comes back every year — and the feed publishes it on
 * that day and takes it down when the day is over. Birthdays are the obvious case
 * and the reason it repeats yearly, but the same row serves an office event that
 * runs for a week.
 *
 * Dates are calendar days, not instants: the day the admin types is the day the
 * post appears, whatever timezone the server happens to be in.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@/lib/convex-typed';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarClock, CalendarDays, Pencil, Plus, Repeat, Trash2, Zap } from 'lucide-react';
import { CATEGORY_CONFIG, CATEGORY_ORDER, type NewsCategory } from './newsCategories';

/** The languages an entry can carry. English is the fallback for the rest. */
const LOCALES = ['en', 'ru', 'hy', 'de'] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  hy: 'Հայերեն',
  de: 'Deutsch',
};

interface ScheduleEntry {
  _id: Id<'announcementSchedule'>;
  category: NewsCategory;
  title: Record<string, string>;
  content: Record<string, string>;
  startDate: string;
  endDate: string;
  repeat: 'none' | 'yearly';
  employeeId?: Id<'users'>;
  employeeName?: string;
  isPinned: boolean;
  isUrgent: boolean;
  isActive: boolean;
  isLive: boolean;
  lastPublishedKey?: string;
}

interface DraftState {
  entryId?: Id<'announcementSchedule'>;
  category: NewsCategory;
  title: Record<Locale, string>;
  content: Record<Locale, string>;
  startDate: string;
  endDate: string;
  repeat: 'none' | 'yearly';
  employeeId: string;
  isPinned: boolean;
  isUrgent: boolean;
}

const emptyCopy = (): Record<Locale, string> => ({ en: '', ru: '', hy: '', de: '' });

function todayKey(): string {
  // The admin's own day; the server re-reads dates in the organization's timezone.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function emptyDraft(): DraftState {
  const today = todayKey();
  return {
    category: 'birthday',
    title: emptyCopy(),
    content: emptyCopy(),
    startDate: today,
    endDate: today,
    repeat: 'yearly',
    employeeId: '',
    isPinned: false,
    isUrgent: false,
  };
}

function draftFrom(entry: ScheduleEntry): DraftState {
  const fill = (source: Record<string, string>): Record<Locale, string> => {
    const copy = emptyCopy();
    for (const locale of LOCALES) copy[locale] = source[locale] ?? '';
    return copy;
  };
  return {
    entryId: entry._id,
    category: entry.category,
    title: fill(entry.title),
    content: fill(entry.content),
    startDate: entry.startDate,
    endDate: entry.endDate,
    repeat: entry.repeat,
    employeeId: entry.employeeId ?? '',
    isPinned: entry.isPinned,
    isUrgent: entry.isUrgent,
    isActive: entry.isActive,
  } as DraftState;
}

export function NewsScheduleManager({
  open,
  onClose,
  organizationId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: Id<'organizations'>;
}) {
  const { t } = useTranslation();
  const entries = useQuery(api.newsSchedule.listSchedule, { organizationId }) as
    | ScheduleEntry[]
    | undefined;
  const employees = useQuery(api.users.queries.getUsersByOrganizationId, { organizationId }) as
    | Array<{ _id: Id<'users'>; name: string }>
    | undefined;

  const createEntry = useMutation(api.newsSchedule.createScheduleEntry);
  const updateEntry = useMutation(api.newsSchedule.updateScheduleEntry);
  const deleteEntry = useMutation(api.newsSchedule.deleteScheduleEntry);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const list = entries ?? [];
    return {
      live: list.filter((e) => e.isLive),
      upcoming: list.filter((e) => !e.isLive && e.isActive),
      paused: list.filter((e) => !e.isActive),
    };
  }, [entries]);

  const save = async () => {
    if (!draft) return;
    // Any one language is enough. The office may work in Armenian, and being told
    // to write English first would be a pointless obstacle; readers whose language
    // is missing fall back to whatever the entry does have.
    const written = LOCALES.filter(
      (locale) => draft.title[locale].trim() && draft.content[locale].trim(),
    );
    if (written.length === 0) {
      toast.error(t('news.schedule.anyLanguageRequired'));
      return;
    }
    if (draft.endDate < draft.startDate) {
      toast.error(t('news.schedule.rangeInvalid'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category: draft.category,
        title: draft.title,
        content: draft.content,
        startDate: draft.startDate,
        endDate: draft.endDate,
        repeat: draft.repeat,
        ...(draft.employeeId ? { employeeId: draft.employeeId as Id<'users'> } : {}),
        isPinned: draft.isPinned,
        isUrgent: draft.isUrgent,
      };

      if (draft.entryId) {
        await updateEntry({ entryId: draft.entryId, ...payload });
        toast.success(t('news.schedule.updated'));
      } else {
        const result = (await createEntry({ organizationId, ...payload })) as {
          publishedNow?: boolean;
        };
        toast.success(
          result?.publishedNow ? t('news.schedule.createdLive') : t('news.schedule.created'),
        );
      }
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('news.schedule.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: ScheduleEntry) => {
    try {
      await deleteEntry({ entryId: entry._id });
      toast.success(t('news.schedule.deleted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('news.schedule.saveFailed'));
    }
  };

  const togglePause = async (entry: ScheduleEntry) => {
    try {
      await updateEntry({ entryId: entry._id, isActive: !entry.isActive });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('news.schedule.saveFailed'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            {t('news.schedule.title')}
          </SheetTitle>
          <SheetDescription>{t('news.schedule.description')}</SheetDescription>
        </SheetHeader>

        <SheetBody>
          {draft ? (
            <DraftForm
              draft={draft}
              employees={employees ?? []}
              saving={saving}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={save}
            />
          ) : (
            <div className="space-y-4">
              <Button onClick={() => setDraft(emptyDraft())} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                {t('news.schedule.add')}
              </Button>

              {entries === undefined ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('news.schedule.loading')}
                </p>
              ) : entries.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">{t('news.schedule.emptyTitle')}</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    {t('news.schedule.emptyHint')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Group
                    label={t('news.schedule.groupLive')}
                    entries={grouped.live}
                    onEdit={(entry) => setDraft(draftFrom(entry))}
                    onDelete={remove}
                    onTogglePause={togglePause}
                  />
                  <Group
                    label={t('news.schedule.groupUpcoming')}
                    entries={grouped.upcoming}
                    onEdit={(entry) => setDraft(draftFrom(entry))}
                    onDelete={remove}
                    onTogglePause={togglePause}
                  />
                  <Group
                    label={t('news.schedule.groupPaused')}
                    entries={grouped.paused}
                    onEdit={(entry) => setDraft(draftFrom(entry))}
                    onDelete={remove}
                    onTogglePause={togglePause}
                  />
                </div>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function Group({
  label,
  entries,
  onEdit,
  onDelete,
  onTogglePause,
}: {
  label: string;
  entries: ScheduleEntry[];
  onEdit: (entry: ScheduleEntry) => void;
  onDelete: (entry: ScheduleEntry) => void;
  onTogglePause: (entry: ScheduleEntry) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language ?? 'en').slice(0, 2);
  if (entries.length === 0) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label} · {entries.length}
      </h4>
      {entries.map((entry) => {
        const cfg = CATEGORY_CONFIG[entry.category] ?? CATEGORY_CONFIG.general;
        // Fall through to whatever the entry has: an Armenian-only row must still
        // be readable in this list, not an empty line the admin cannot identify.
        const title = entry.title[lang] ?? entry.title.en ?? Object.values(entry.title)[0] ?? '';
        const missing = LOCALES.filter((locale) => !entry.title[locale]);
        const multiDay = entry.endDate !== entry.startDate;

        return (
          <div
            key={entry._id}
            className="flex flex-wrap items-start gap-3 rounded-xl border p-3"
            style={{ borderColor: `${cfg.color}55` }}
          >
            <span
              className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: cfg.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{title}</span>
                {entry.isLive && (
                  <Badge className="bg-emerald-500/10 text-emerald-600">
                    {t('news.schedule.badgeLive')}
                  </Badge>
                )}
                {entry.repeat === 'yearly' && (
                  <Badge variant="secondary" className="gap-1">
                    <Repeat className="h-3 w-3" />
                    {t('news.schedule.yearly')}
                  </Badge>
                )}
                {entry.isUrgent && (
                  <Badge variant="secondary" className="gap-1 text-(--danger-text)">
                    <Zap className="h-3 w-3" />
                    {t('news.compose.urgent')}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {multiDay
                  ? t('news.schedule.range', { from: entry.startDate, to: entry.endDate })
                  : entry.startDate}
                {entry.employeeName ? ` · ${entry.employeeName}` : ''}
              </p>
              {missing.length > 0 && (
                <p className="mt-0.5 text-xs text-(--warning-text)">
                  {t('news.schedule.missingLocales', {
                    locales: missing.map((l) => LOCALE_LABELS[l]).join(', '),
                  })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onTogglePause(entry)}
                title={entry.isActive ? t('news.schedule.pause') : t('news.schedule.resume')}
              >
                {entry.isActive ? t('news.schedule.pause') : t('news.schedule.resume')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEdit(entry)}
                aria-label={t('news.schedule.edit')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(entry)}
                aria-label={t('news.schedule.delete')}
              >
                <Trash2 className="h-4 w-4 text-rose-500" />
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DraftForm({
  draft,
  employees,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: DraftState;
  employees: Array<{ _id: Id<'users'>; name: string }>;
  saving: boolean;
  onChange: (draft: DraftState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t, i18n } = useTranslation();
  // Open on the language the admin is working in — that is the one they will type.
  const ownLocale = (i18n.language ?? 'en').slice(0, 2) as Locale;
  const [tab, setTab] = useState<Locale>(LOCALES.includes(ownLocale) ? ownLocale : 'en');

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('news.compose.category')}</Label>
          <Select
            value={draft.category}
            onValueChange={(value) => set('category', value as NewsCategory)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_ORDER.map((category) => (
                <SelectItem key={category} value={category}>
                  {t(CATEGORY_CONFIG[category].labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t('news.schedule.employee')}</Label>
          <Select
            value={draft.employeeId || 'none'}
            onValueChange={(value) => set('employeeId', value === 'none' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('news.schedule.noEmployee')}</SelectItem>
              {employees.map((employee) => (
                <SelectItem key={employee._id} value={employee._id}>
                  {employee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="schedule-start">{t('news.schedule.firstDay')}</Label>
          <Input
            id="schedule-start"
            type="date"
            value={draft.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              // Keep the range coherent: moving the first day past the last drags
              // the last with it instead of rejecting the edit.
              onChange({
                ...draft,
                startDate,
                endDate: draft.endDate < startDate ? startDate : draft.endDate,
              });
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="schedule-end">{t('news.schedule.lastDay')}</Label>
          <Input
            id="schedule-end"
            type="date"
            min={draft.startDate}
            value={draft.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('news.schedule.rangeHint')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-xl border p-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={draft.repeat === 'yearly'}
            onCheckedChange={(checked) => set('repeat', checked ? 'yearly' : 'none')}
          />
          {t('news.schedule.repeatYearly')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={draft.isPinned}
            onCheckedChange={(checked) => set('isPinned', checked)}
          />
          {t('news.compose.pin')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={draft.isUrgent}
            onCheckedChange={(checked) => set('isUrgent', checked)}
          />
          {t('news.compose.urgent')}
        </label>
      </div>

      {/* One tab per language: the whole point of the list is that a post reads
          natively for everyone, so every language is one click away. */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {LOCALES.map((locale) => {
            const filled =
              draft.title[locale].trim().length > 0 && draft.content[locale].trim().length > 0;
            return (
              <button
                key={locale}
                type="button"
                onClick={() => setTab(locale)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  tab === locale ? 'border-transparent text-white' : 'hover:bg-muted'
                }`}
                style={tab === locale ? { backgroundColor: 'var(--primary)' } : undefined}
              >
                {LOCALE_LABELS[locale]}
                {filled ? ' ✓' : ''}
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="schedule-title">{t('news.compose.headline')}</Label>
          <Input
            id="schedule-title"
            value={draft.title[tab]}
            placeholder={t('news.schedule.titlePlaceholder')}
            onChange={(e) => set('title', { ...draft.title, [tab]: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="schedule-body">{t('news.compose.body')}</Label>
          <Textarea
            id="schedule-body"
            rows={5}
            value={draft.content[tab]}
            placeholder={t('news.schedule.contentPlaceholder')}
            onChange={(e) => set('content', { ...draft.content, [tab]: e.target.value })}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('news.schedule.fallbackHint')}</p>
      </div>

      <SheetFooter className="gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          {t('buttons.cancel')}
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? t('buttons.saving') : t('buttons.save')}
        </Button>
      </SheetFooter>
    </div>
  );
}
