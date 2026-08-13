'use client';

/**
 * Event timeline modal — the detail view opened by double-clicking any entry on
 * the calendar page.
 *
 * All content comes from the normalized model in `@/lib/eventTimeline`, so this
 * file only decides how a timeline *looks*: a hero header carrying the source
 * accent, a live progress bar, a vertical milestone rail, and a grid of fact
 * cards. Nothing here knows about leaves, drivers or Google — add a source to
 * the model and it renders for free.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { motion } from '@/lib/cssMotion';
import { toast } from 'sonner';
import {
  Bell,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Gauge,
  Link2,
  MapPin,
  Play,
  Radio,
  Route,
  Star,
  StickyNote,
  Tag,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetBody, SheetContent } from '@/components/ui/sheet';
import { useNow } from '@/hooks/useNow';
import { getInitials } from '@/lib/stringUtils';
import { formatDate, formatTime } from '@/lib/date-format';
import {
  buildEventTimeline,
  buildTimelineIcs,
  buildTimelineSummary,
  type EventTimeline,
  type FactIcon,
  type MilestoneIcon,
  type TimelineInput,
  type TimelineTone,
} from '@/lib/eventTimeline';

/** How often the live progress bar and the "now" marker are recomputed. */
const TICK_MS = 30_000;

/** Lucide icon component — takes className and an optional inline style. */
type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

const MILESTONE_ICONS: Record<MilestoneIcon, IconComponent> = {
  created: FileText,
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  reminder: Bell,
  start: Play,
  end: Flag,
  now: Radio,
  pickup: MapPin,
  dropoff: Flag,
  arrived: Car,
  completed: CheckCircle2,
  cancelled: XCircle,
};

const FACT_ICONS: Record<FactIcon, IconComponent> = {
  user: User,
  users: Users,
  location: MapPin,
  text: FileText,
  tag: Tag,
  bell: Bell,
  clock: Clock,
  calendar: CalendarDays,
  car: Car,
  route: Route,
  note: StickyNote,
  link: Link2,
  building: Building2,
  star: Star,
  gauge: Gauge,
};

/** Tone → concrete colors. Kept as literal classes so Tailwind can see them. */
const TONE_CLASSES: Record<TimelineTone, { text: string; bg: string; ring: string }> = {
  neutral: {
    text: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    ring: 'ring-(--border)',
  },
  accent: { text: 'text-(--primary)', bg: 'bg-(--primary)/10', ring: 'ring-(--primary)/30' },
  success: { text: 'text-emerald-600', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30' },
  warning: { text: 'text-amber-600', bg: 'bg-amber-500/10', ring: 'ring-amber-500/30' },
  danger: { text: 'text-red-600', bg: 'bg-red-500/10', ring: 'ring-red-500/30' },
};

const BADGE_VARIANTS: Record<TimelineTone, 'secondary' | 'success' | 'warning' | 'danger'> = {
  neutral: 'secondary',
  accent: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

interface EventTimelineModalProps {
  /** `null` closes the modal; a value opens it. */
  input: TimelineInput | null;
  onClose: () => void;
}

export function EventTimelineModal({ input, onClose }: EventTimelineModalProps) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const closeRef = useRef<HTMLButtonElement>(null);
  // Live clock for the progress bar and the "now" marker. The shared hook keeps
  // ticking while the modal is closed, which is what removes the old "reset on
  // open" effect: the value is never more than one tick stale, so a modal
  // reopened hours later is already current.
  const now = useNow(TICK_MS);

  // Escape is handled by the Sheet (Radix `onEscapeKeyDown`), so the hand-rolled
  // document listener that used to live here is gone. It also called
  // `stopPropagation`, which meant that when this panel opened on top of the
  // day-details panel, one Escape closed both — Radix dismisses only the topmost
  // layer, which is what a user expects from a stack.
  useEffect(() => {
    if (!input) return;
    closeRef.current?.focus();
  }, [input]);

  const timeline = useMemo(
    () => (input ? buildEventTimeline(input, { now, lang, t }) : null),
    [input, now, lang, t],
  );

  const formatMoment = useCallback(
    (ms: number, allDay: boolean) =>
      allDay
        ? formatDate(ms, lang, { month: 'short', day: 'numeric', year: 'numeric' })
        : `${formatDate(ms, lang, { month: 'short', day: 'numeric' })}, ${formatTime(ms, lang, {
            hour: '2-digit',
            minute: '2-digit',
          })}`,
    [lang],
  );

  const handleCopy = useCallback(async () => {
    if (!timeline) return;
    const text = buildTimelineSummary(timeline, (ms) => formatMoment(ms, timeline.allDay));
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('eventTimeline.actions.copied'));
    } catch {
      toast.error(t('eventTimeline.actions.copyFailed'));
    }
  }, [timeline, formatMoment, t]);

  const handleDownloadIcs = useCallback(() => {
    if (!timeline) return;
    const ics = buildTimelineIcs(timeline, Date.now());
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${timeline.source}-${timeline.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('eventTimeline.actions.downloaded'));
  }, [timeline, t]);

  return (
    <Sheet open={timeline !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" size="xl" hideClose label={timeline?.title} className="p-0">
        {timeline && (
          <>
            {/* This panel can open on top of the day-details panel (double-click a
                day with several entries). Radix stacks nested dialogs and scopes
                the focus trap to the topmost one, which replaces the hand-managed
                z-50 / z-[60] pair the two portals used to coordinate with. */}
            <TimelineHeader
              timeline={timeline}
              formatMoment={formatMoment}
              onClose={onClose}
              closeRef={closeRef}
            />

            <SheetBody className="px-0 py-0">
              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <MilestoneRail timeline={timeline} formatMoment={formatMoment} />
                <div className="space-y-6">
                  <FactGrid timeline={timeline} />
                  <PeopleList timeline={timeline} />
                </div>
              </div>
            </SheetBody>

            <TimelineFooter
              timeline={timeline}
              onCopy={handleCopy}
              onDownload={handleDownloadIcs}
              onClose={onClose}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

function TimelineHeader({
  timeline,
  formatMoment,
  onClose,
  closeRef,
}: {
  timeline: EventTimeline;
  formatMoment: (ms: number, allDay: boolean) => string;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const { accent, phase } = timeline;

  return (
    <div className="relative shrink-0 overflow-hidden px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{ background: `linear-gradient(135deg, ${accent} 0%, transparent 65%)` }}
      />
      <div
        className="pointer-events-none absolute -mr-24 -mt-24 top-0 right-0 h-48 w-48 rounded-full opacity-20 blur-3xl"
        style={{ background: accent }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div
            className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
          >
            <span className="text-lg leading-none font-bold">
              {new Date(timeline.start).getDate()}
            </span>
            <span className="mt-0.5 text-[10px] font-medium uppercase opacity-90">
              {formatDate(timeline.start, i18n.language || 'en', { month: 'short' })}
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ background: `${accent}1f`, color: accent }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
                {timeline.sourceLabel}
              </span>
              <Badge
                variant={BADGE_VARIANTS[timeline.status.tone]}
                className="h-5 px-2 text-[10px]"
              >
                {timeline.status.label}
              </Badge>
              <PhasePill phase={phase} />
            </div>

            <h2 className="mt-2 text-xl leading-tight font-bold break-words text-(--text-primary) sm:text-2xl">
              {timeline.title}
            </h2>
            {timeline.subtitle && (
              <p className="mt-0.5 truncate text-sm text-(--text-muted)">{timeline.subtitle}</p>
            )}
          </div>
        </div>

        <button
          ref={closeRef}
          onClick={onClose}
          aria-label={t('common.close')}
          className="shrink-0 rounded-full p-2 text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Span + duration + progress */}
      <div className="relative mt-5 rounded-2xl border border-(--border) bg-(--background-subtle)/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 shrink-0 text-(--text-muted)" />
            <span className="font-semibold text-(--text-primary)">
              {formatMoment(timeline.start, timeline.allDay)}
            </span>
            <span className="text-(--text-muted)">→</span>
            <span className="font-semibold text-(--text-primary)">
              {formatMoment(timeline.end, timeline.allDay)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--card) px-2.5 py-1 font-medium text-(--text-secondary)">
              <Clock className="h-3.5 w-3.5" />
              {timeline.durationLabel}
            </span>
            <span className="text-(--text-muted)">{timeline.relativeLabel}</span>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--border)">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${timeline.progress}%`,
                background:
                  phase === 'past'
                    ? 'var(--text-muted)'
                    : `linear-gradient(90deg, ${accent}, ${accent}99)`,
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-(--text-muted)">
            <span>{t('eventTimeline.progress.elapsed', { value: timeline.progress })}</span>
            <span>{timeline.allDay ? t('calendar.allDay') : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhasePill({ phase }: { phase: EventTimeline['phase'] }) {
  const { t } = useTranslation();
  if (phase === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        {t('eventTimeline.phase.live')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-(--background-subtle) px-2.5 py-0.5 text-[10px] font-semibold text-(--text-muted)">
      {phase === 'upcoming' ? t('eventTimeline.phase.upcoming') : t('eventTimeline.phase.past')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone rail
// ─────────────────────────────────────────────────────────────────────────────

function MilestoneRail({
  timeline,
  formatMoment,
}: {
  timeline: EventTimeline;
  formatMoment: (ms: number, allDay: boolean) => string;
}) {
  const { t } = useTranslation();

  return (
    <section>
      <SectionTitle>{t('eventTimeline.sections.timeline')}</SectionTitle>
      <ol className="relative mt-3 space-y-1">
        {/* The rail itself: inset so it starts and ends inside the first/last dot. */}
        <span
          aria-hidden
          className="absolute top-3 bottom-3 left-[15px] w-px bg-gradient-to-b from-(--border) via-(--border) to-transparent"
        />
        {timeline.milestones.map((milestone, index) => {
          const Icon = MILESTONE_ICONS[milestone.icon];
          const tone = TONE_CLASSES[milestone.tone];
          const isNow = milestone.id === 'now';
          return (
            <motion.li
              key={milestone.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.05, 0.4) }}
              className="relative flex gap-3 rounded-xl px-1 py-2"
            >
              <span
                className={[
                  'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2',
                  tone.bg,
                  tone.ring,
                  milestone.state === 'upcoming' ? 'opacity-60' : '',
                ].join(' ')}
                style={isNow ? { background: `${timeline.accent}1f` } : undefined}
              >
                <Icon
                  className={`h-4 w-4 ${tone.text}`}
                  style={isNow ? { color: timeline.accent } : undefined}
                />
                {isNow && (
                  <span
                    className="absolute inset-0 animate-ping rounded-full opacity-40"
                    style={{ background: `${timeline.accent}55` }}
                  />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p
                    className={[
                      'text-sm font-semibold',
                      milestone.state === 'upcoming'
                        ? 'text-(--text-muted)'
                        : 'text-(--text-primary)',
                    ].join(' ')}
                  >
                    {milestone.label}
                  </p>
                  {milestone.state === 'done' && !isNow && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                </div>
                <p className="mt-0.5 text-xs text-(--text-muted)">
                  {milestone.at === null
                    ? t('eventTimeline.milestones.noDateYet')
                    : formatMoment(milestone.at, timeline.allDay && !isNow)}
                </p>
                {milestone.detail && (
                  <p className="mt-1 line-clamp-2 text-xs text-(--text-secondary)">
                    {milestone.detail}
                  </p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Facts
// ─────────────────────────────────────────────────────────────────────────────

function FactGrid({ timeline }: { timeline: EventTimeline }) {
  const { t } = useTranslation();
  if (timeline.facts.length === 0) return null;

  return (
    <section>
      <SectionTitle>{t('eventTimeline.sections.details')}</SectionTitle>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {timeline.facts.map((fact, index) => {
          const Icon = FACT_ICONS[fact.icon];
          const body = (
            <>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${timeline.accent}14`, color: timeline.accent }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-wider text-(--text-muted) uppercase">
                  {fact.label}
                </span>
                <span className="mt-0.5 block text-sm leading-snug break-words whitespace-pre-wrap text-(--text-primary)">
                  {fact.value}
                </span>
              </span>
            </>
          );

          const className =
            'flex h-full items-start gap-3 rounded-xl border border-(--border) bg-(--background-subtle)/60 p-3 transition-colors hover:border-(--primary)/40';

          return (
            <motion.div
              key={fact.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.04, 0.3) }}
              className={fact.wide ? 'sm:col-span-2' : ''}
            >
              {fact.href ? (
                <a href={fact.href} target="_blank" rel="noopener noreferrer" className={className}>
                  {body}
                </a>
              ) : (
                <div className={className}>{body}</div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function PeopleList({ timeline }: { timeline: EventTimeline }) {
  const { t } = useTranslation();
  if (timeline.people.length === 0) return null;

  return (
    <section>
      <SectionTitle>{t('eventTimeline.sections.people')}</SectionTitle>
      <div className="mt-3 flex flex-wrap gap-2">
        {timeline.people.map((person, index) => (
          <div
            key={`${person.name}-${index}`}
            className="flex items-center gap-2.5 rounded-full border border-(--border) bg-(--background-subtle)/60 py-1 pr-3.5 pl-1"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, ${timeline.accent}, ${timeline.accent}bb)`,
              }}
            >
              {getInitials(person.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-(--text-primary)">
                {person.name}
              </span>
              {person.role && (
                <span className="block truncate text-[10px] text-(--text-muted)">
                  {person.role}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

function TimelineFooter({
  timeline,
  onCopy,
  onDownload,
  onClose,
}: {
  timeline: EventTimeline;
  onCopy: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-(--border) bg-(--background-subtle)/50 px-5 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <FooterButton onClick={onCopy} icon={ClipboardCopy}>
          {t('eventTimeline.actions.copyDetails')}
        </FooterButton>
        <FooterButton onClick={onDownload} icon={Download}>
          {t('eventTimeline.actions.addToCalendar')}
        </FooterButton>
        {timeline.externalUrl && (
          <a
            href={timeline.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--card) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--primary)/50 hover:text-(--text-primary)"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('calendar.openInGoogle')}
          </a>
        )}
      </div>
      <button
        onClick={onClose}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-(--text-muted) transition-colors hover:bg-(--card) hover:text-(--text-primary)"
      >
        {t('common.close')}
        <kbd className="rounded border border-(--border) bg-(--card) px-1 text-[9px] tracking-wider">
          ESC
        </kbd>
      </button>
    </div>
  );
}

function FooterButton({
  onClick,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  icon: IconComponent;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--card) px-3 py-1.5 text-xs font-medium text-(--text-secondary) transition-colors hover:border-(--primary)/50 hover:text-(--text-primary)"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
        {children}
      </h3>
      <span className="h-px flex-1 bg-(--border)" />
    </div>
  );
}

export default EventTimelineModal;
