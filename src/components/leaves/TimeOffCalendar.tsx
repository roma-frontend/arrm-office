'use client';

/**
 * TimeOffCalendar — fullscreen-capable timesheet («табель») of every absence.
 *
 * Employees are rows, days are columns. Leave bars are coloured by type and
 * patterned by status, weekends/holidays/today are shaded per column, and a
 * sticky per-employee totals column plus a per-day absence footer give
 * accounting exact numbers. Self-sufficient: fetches leaves, users,
 * departments, positions and holidays itself.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  addDays,
  eachDayOfInterval,
  isToday,
  isWeekend,
  parseISO,
  differenceInCalendarDays,
} from 'date-fns';
import { enUS, ru, hy, de } from 'date-fns/locale';
import i18n from 'i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarCheck,
  Search,
  Maximize2,
  Minimize2,
  Filter,
  RotateCcw,
  Download,
  Users,
  Plane,
  Hourglass,
  Rows3,
  Clock,
  Thermometer,
  Home,
  Stethoscope,
  Sun,
  Baby,
  Heart,
  GraduationCap,
  Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { getInitials, ALL_LEAVE_TYPES, getLeaveTypeColor } from '@/lib/types';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

// ── Leave type catalogue ────────────────────────────────────────────────────
// The full 9-type catalogue and its colours live in src/lib/types.ts so the
// timesheet, the month calendar and the dashboards all speak the same palette.

/** Accent for the overtime layer — matches OVERTIME_COLOR in CalendarClient. */
const OVERTIME_COLOR = '#8b5cf6';

const TYPE_LABEL_KEY: Record<string, string> = {
  paid: 'leaveTypes.paid',
  unpaid: 'leaveTypes.unpaid',
  sick: 'leaveTypes.sick',
  family: 'leaveTypes.family',
  doctor: 'leaveTypes.doctor',
  day_off: 'leaveTypes.dayOff',
  maternity: 'leaveTypes.maternity',
  paternity: 'leaveTypes.paternity',
  study: 'leaveTypes.study',
};

/** A glyph per leave type — the sheet reads at a glance, day by day. */
const TYPE_ICON: Record<string, LucideIcon> = {
  paid: Plane,
  unpaid: Clock,
  sick: Thermometer,
  family: Home,
  doctor: Stethoscope,
  day_off: Sun,
  maternity: Baby,
  paternity: Heart,
  study: GraduationCap,
};

const STATUS_BADGE: Record<
  string,
  { variant: 'success' | 'warning' | 'destructive' | 'secondary'; labelKey: string; dot: string }
> = {
  approved: { variant: 'success', labelKey: 'leave.approved', dot: 'bg-emerald-500' },
  pending: { variant: 'warning', labelKey: 'leave.pending', dot: 'bg-amber-400' },
  rejected: { variant: 'destructive', labelKey: 'leave.rejected', dot: 'bg-red-500' },
  cancel_requested: {
    variant: 'warning',
    labelKey: 'leave.cancellationRequested',
    dot: 'bg-slate-400',
  },
};

const LEFT_W = 240;
const LEFT_W_COMPACT = 204;
const RIGHT_W = 88;
const CELL_W_MIN = 34;
const CELL_W_MIN_COMPACT = 24;
const CELL_W_MAX = 72;
const CELL_W_MAX_COMPACT = 48;
const LANE_H = 22;
const LANE_H_COMPACT = 16;
const LANE_GAP = 3;
const MAX_RANGE_DAYS = 92;

const typeColor = getLeaveTypeColor;

function prettifyType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Soft tinted bands — the status language of the sheet. Icons carry the type. */
function barVisuals(status: string, color: string): React.CSSProperties {
  switch (status) {
    case 'approved':
      return {
        background: `linear-gradient(180deg, ${color}38, ${color}24)`,
        boxShadow: `inset 0 0 0 1px ${color}40, inset 0 2px 0 ${color}59`,
      };
    case 'pending':
      return {
        background: `repeating-linear-gradient(45deg, ${color}24 0 5px, ${color}0d 5px 10px)`,
        boxShadow: `inset 0 0 0 1px ${color}33`,
        border: `1.5px dashed ${color}99`,
      };
    case 'rejected':
      return {
        background: `repeating-linear-gradient(45deg, #94a3b824 0 4px, transparent 4px 8px)`,
        border: '1px solid #94a3b84d',
      };
    default:
      // cancel_requested — still approved, but a cancellation is on the table
      return {
        background: `linear-gradient(180deg, ${color}30, ${color}1c)`,
        border: '1.5px dashed #f59e0b',
      };
  }
}

// ── Local data shapes ───────────────────────────────────────────────────────
interface LeaveRecord {
  _id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  userName?: string | null;
  userDepartment?: string | null;
  userPosition?: string | null;
  userAvatarUrl?: string | null;
  reviewerName?: string | null;
  reviewComment?: string | null;
}

interface EmployeeRecord {
  _id: Id<'users'>;
  name: string;
  department?: string | null;
  position?: string | null;
  avatarUrl?: string | null;
  employeeType?: string | null;
}

interface HolidayRecord {
  _id: string;
  name: string;
  date: string;
  type: string;
  isRecurring: boolean;
}

interface LaneBar {
  leave: LeaveRecord;
  lane: number;
  startIdx: number;
  endIdx: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

interface RowData {
  emp: EmployeeRecord;
  leaves: LeaveRecord[];
  bars: LaneBar[];
  laneCount: number;
  approvedDays: number;
  pendingDays: number;
  byType: Map<string, number>;
  onLeaveToday: boolean;
}

interface OvertimeRecord {
  _id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  estimatedHours: number;
  status: string;
  reason: string;
  userName?: string | null;
}

interface DayCell {
  date: Date;
  ds: string;
  isWeekend: boolean;
  isToday: boolean;
  holiday?: HolidayRecord;
}

function overlapDays(start1: string, end1: string, start2: string, end2: string): number {
  // yyyy-MM-dd strings compare lexicographically as dates
  const s = start1 > start2 ? start1 : start2;
  const e = end1 < end2 ? end1 : end2;
  if (s > e) return 0;
  return differenceInCalendarDays(parseISO(e), parseISO(s)) + 1;
}

export function TimeOffCalendar({
  onLeaveClick,
  onClose,
  embedded = false,
}: {
  onLeaveClick?: (leave: { _id: string; userName?: string | null }) => void;
  /** When provided, an exit button is shown and Escape/minimize calls it (host-controlled fullscreen). */
  onClose?: () => void;
  /** Render as a full-viewport overlay driven by the host instead of the built-in fullscreen toggle. */
  embedded?: boolean;
}) {
  const { t } = useTranslation('leaves');
  const selectedOrgId = useSelectedOrganization();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : lang === 'de' ? de : enUS;

  const today = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

  // ── View state ───────────────────────────────────────────────────────────
  const [viewStart, setViewStart] = useState(fmt(startOfMonth(today)));
  const [viewEnd, setViewEnd] = useState(fmt(endOfMonth(today)));
  const [search, setSearch] = useState('');
  const [typeSet, setTypeSet] = useState<Set<string>>(new Set());
  const [statusSet, setStatusSet] = useState<Set<string>>(new Set());
  const [deptFilter, setDeptFilter] = useState('all');
  const [posFilter, setPosFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [empTypeFilter, setEmpTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showWeekends, setShowWeekends] = useState(true);
  const [markHolidays, setMarkHolidays] = useState(true);
  const [groupByDept, setGroupByDept] = useState(false);
  const [onlyWithLeave, setOnlyWithLeave] = useState(false);
  const [showOvertime, setShowOvertime] = useState(true);
  const [compact, setCompact] = useState(false);
  const [sortMode, setSortMode] = useState<'name' | 'days'>('name');

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Data ─────────────────────────────────────────────────────────────────
  const leavesData = useQuery(api.leaves.getLeavesForDateRange, {
    startDate: viewStart,
    endDate: viewEnd,
    ...(selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : {}),
  });
  const usersData = useQuery(api.users.queries.getAllUsers, {
    limit: 100,
    ...(selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : {}),
  });
  const departmentsRaw = useQuery(
    api.departments.list,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  );
  const positionsRaw = useQuery(
    api.positions.list,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  );
  const holidaysData = useQuery(
    api.leaveSettings.getHolidays,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : 'skip',
  );
  const overtimeData = useQuery(api.overtime.getOvertimeForDateRange, {
    startDate: viewStart,
    endDate: viewEnd,
  });

  const departments = useMemo(() => departmentsRaw ?? [], [departmentsRaw]);
  const positions = useMemo(() => positionsRaw ?? [], [positionsRaw]);
  const leaves = useMemo(() => (leavesData ?? []) as LeaveRecord[], [leavesData]);
  const allUsers = useMemo(() => (usersData ?? []) as EmployeeRecord[], [usersData]);
  const holidays = useMemo(() => (holidaysData ?? []) as HolidayRecord[], [holidaysData]);
  const overtimes = useMemo(() => (overtimeData ?? []) as OvertimeRecord[], [overtimeData]);

  const typeLabel = useCallback(
    (type: string) =>
      t(TYPE_LABEL_KEY[type] ?? 'timesheet.unknownType', { defaultValue: prettifyType(type) }),
    [t],
  );

  // ── Fullscreen ────────────────────────────────────────────────────────────
  // A CSS overlay portaled to <body> — NOT the native Fullscreen API. Native
  // fullscreen would trap portaled record sheets/selects outside the
  // fullscreened subtree, and moving the node into a portal kicks the element
  // out of native fullscreen anyway. In embedded mode the host owns the
  // chrome: the sheet always fills the viewport and the toggle exits via
  // onClose.
  const [cssFs, setCssFs] = useState(false);
  // fsClosing: the exit animation is playing while the overlay is still up;
  // fsSettling: right after the overlay unmounts, fade the inline sheet in so
  // the portal↔inline hand-off never reads as a hard pop.
  const [fsClosing, setFsClosing] = useState(false);
  const [fsSettling, setFsSettling] = useState(false);
  const isFs = embedded || cssFs;

  const closeFs = useCallback(() => {
    setFsClosing(true);
    window.setTimeout(() => {
      setFsClosing(false);
      setCssFs(false);
      setFsSettling(true);
      window.setTimeout(() => setFsSettling(false), 260);
    }, 180);
  }, []);

  useEffect(() => {
    if (!isFs) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (embedded) onClose?.();
      else closeFs();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFs, embedded, onClose, closeFs]);

  // Lock the page scroll while the sheet covers the viewport. Compensate the
  // disappearing scrollbar so the page behind never jumps sideways.
  useEffect(() => {
    if (!isFs) return;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
    };
  }, [isFs]);

  const toggleFullscreen = useCallback(() => {
    if (embedded) {
      onClose?.();
      return;
    }
    if (cssFs) closeFs();
    else setCssFs(true);
  }, [embedded, onClose, cssFs, closeFs]);

  // ── Period helpers ───────────────────────────────────────────────────────
  const isFullMonth =
    viewStart === fmt(startOfMonth(parseISO(viewStart))) &&
    viewEnd === fmt(endOfMonth(parseISO(viewStart)));

  const shiftMonth = (dir: 1 | -1) => {
    const base = startOfMonth(addMonths(startOfMonth(parseISO(viewStart)), dir));
    setViewStart(fmt(base));
    setViewEnd(fmt(endOfMonth(base)));
  };
  const goToday = () => {
    setViewStart(fmt(startOfMonth(today)));
    setViewEnd(fmt(endOfMonth(today)));
  };
  const setRange = (start: string, end: string) => {
    const s = start || viewStart;
    let e = end || s;
    if (e < s) e = s;
    // Keep the grid renderable: cap the span, anchored on the start date
    if (differenceInCalendarDays(parseISO(e), parseISO(s)) + 1 > MAX_RANGE_DAYS) {
      e = fmt(addDays(parseISO(s), MAX_RANGE_DAYS - 1));
    }
    setViewStart(s);
    setViewEnd(e);
  };

  const periodLabel = isFullMonth
    ? format(parseISO(viewStart), 'LLLL yyyy', { locale: dateFnsLocale })
    : `${format(parseISO(viewStart), 'dd MMM', { locale: dateFnsLocale })} – ${format(
        parseISO(viewEnd),
        'dd MMM yyyy',
        { locale: dateFnsLocale },
      )}`;

  // ── Calendar math ────────────────────────────────────────────────────────
  const holidayMap = useMemo(() => {
    const map = new Map<string, HolidayRecord>();
    const years = new Set<number>();
    for (let d = parseISO(viewStart); d <= parseISO(viewEnd); d = addDays(d, 1)) {
      years.add(d.getFullYear());
    }
    for (const h of holidays) {
      if (!h.isRecurring) {
        if (h.date >= viewStart && h.date <= viewEnd) map.set(h.date, h);
      } else {
        // Recurring holidays are stored with their original year — project the
        // month-day onto every year the view touches
        for (const y of years) {
          const projected = `${y}-${h.date.slice(5)}`;
          const pd = parseISO(projected);
          if (!isNaN(pd.getTime()) && projected >= viewStart && projected <= viewEnd) {
            map.set(projected, h);
          }
        }
      }
    }
    return map;
  }, [holidays, viewStart, viewEnd]);

  const dayCells = useMemo<DayCell[]>(
    () =>
      eachDayOfInterval({ start: parseISO(viewStart), end: parseISO(viewEnd) }).map((d) => {
        const ds = fmt(d);
        return {
          date: d,
          ds,
          isWeekend: isWeekend(d),
          isToday: isToday(d),
          holiday: holidayMap.get(ds),
        };
      }),
    [viewStart, viewEnd, holidayMap],
  );

  const visibleDays = useMemo(
    () => (showWeekends ? dayCells : dayCells.filter((d) => !d.isWeekend)),
    [dayCells, showWeekends],
  );
  const dayIndex = useMemo(() => {
    const m = new Map<string, number>();
    visibleDays.forEach((d, i) => m.set(d.ds, i));
    return m;
  }, [visibleDays]);

  const laneH = compact ? LANE_H_COMPACT : LANE_H;
  const leftW = compact ? LEFT_W_COMPACT : LEFT_W;

  // Stretch the day columns to fill the viewport width (like a true timesheet
  // wall) instead of leaving dead space after the last day; scroll only when
  // the period cannot fit at the minimum cell width.
  const [availW, setAvailW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const en of entries) setAvailW(en.contentRect.width);
    });
    ro.observe(el);
    setAvailW(el.clientWidth);
    return () => ro.disconnect();
  }, [isFs]);

  const minCellW = compact ? CELL_W_MIN_COMPACT : CELL_W_MIN;
  const maxCellW = compact ? CELL_W_MAX_COMPACT : CELL_W_MAX;
  const cellW = useMemo(() => {
    if (!availW || visibleDays.length === 0) return minCellW;
    const fit = Math.floor((availW - leftW - RIGHT_W - 6) / visibleDays.length);
    return Math.max(minCellW, Math.min(maxCellW, fit));
  }, [availW, leftW, visibleDays.length, minCellW, maxCellW]);

  const trackW = visibleDays.length * cellW;
  const totalW = leftW + trackW + RIGHT_W;

  // ── Filtering ────────────────────────────────────────────────────────────
  const filteredLeaves = useMemo(
    () =>
      leaves.filter(
        (l) =>
          (typeSet.size === 0 || typeSet.has(l.type)) &&
          (statusSet.size === 0 || statusSet.has(l.status)),
      ),
    [leaves, typeSet, statusSet],
  );

  const levelsByTitle = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of positions) {
      if (!p.level) continue;
      const s = m.get(p.title) ?? new Set();
      s.add(p.level);
      m.set(p.title, s);
    }
    return m;
  }, [positions]);

  const filteredUsers = useMemo(() => {
    let result = allUsers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.department ?? '').toLowerCase().includes(q) ||
          (u.position ?? '').toLowerCase().includes(q),
      );
    }
    if (deptFilter !== 'all') result = result.filter((u) => u.department === deptFilter);
    if (posFilter !== 'all') result = result.filter((u) => u.position === posFilter);
    if (levelFilter !== 'all') {
      result = result.filter((u) => levelsByTitle.get(u.position ?? '')?.has(levelFilter));
    }
    if (empTypeFilter !== 'all') result = result.filter((u) => u.employeeType === empTypeFilter);
    return result;
  }, [allUsers, search, deptFilter, posFilter, levelFilter, empTypeFilter, levelsByTitle]);

  // ── Rows: lanes, clipped bars, totals ────────────────────────────────────
  const rows = useMemo<RowData[]>(() => {
    const todayStr = fmt(new Date());
    const byUser = new Map<string, LeaveRecord[]>();
    for (const l of filteredLeaves) {
      if (!byUser.has(l.userId)) byUser.set(l.userId, []);
      byUser.get(l.userId)!.push(l);
    }

    const list = filteredUsers.map<RowData>((emp) => {
      const inRange = (byUser.get(emp._id) ?? [])
        .filter((l) => l.endDate >= viewStart && l.startDate <= viewEnd)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));

      // Greedy lane packing so overlapping leaves stack instead of z-fighting
      const laneEnds: string[] = [];
      const bars: LaneBar[] = [];
      for (const l of inRange) {
        let lane = laneEnds.findIndex((e) => e < l.startDate);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(l.endDate);
        } else {
          laneEnds[lane] = l.endDate;
        }
        const clippedStart = l.startDate < viewStart;
        const clippedEnd = l.endDate > viewEnd;
        const sKey = clippedStart ? viewStart : l.startDate;
        const eKey = clippedEnd ? viewEnd : l.endDate;
        const sIdx = dayIndex.get(sKey);
        const eIdx = dayIndex.get(eKey);
        if (sIdx === undefined || eIdx === undefined) continue;
        bars.push({ leave: l, lane, startIdx: sIdx, endIdx: eIdx, clippedStart, clippedEnd });
      }

      let approvedDays = 0;
      let pendingDays = 0;
      const byType = new Map<string, number>();
      for (const l of inRange) {
        const d = overlapDays(l.startDate, l.endDate, viewStart, viewEnd);
        if (l.status === 'pending') {
          pendingDays += d;
        } else if (l.status !== 'rejected') {
          approvedDays += d;
        }
        if (l.status !== 'rejected') {
          byType.set(l.type, (byType.get(l.type) ?? 0) + d);
        }
      }

      return {
        emp,
        leaves: inRange,
        bars,
        laneCount: Math.max(1, laneEnds.length),
        approvedDays,
        pendingDays,
        byType,
        onLeaveToday: inRange.some(
          (l) =>
            l.status !== 'rejected' &&
            l.status !== 'pending' &&
            l.startDate <= todayStr &&
            l.endDate >= todayStr,
        ),
      };
    });

    const filtered = onlyWithLeave ? list.filter((r) => r.leaves.length > 0) : list;
    return filtered.sort((a, b) => {
      if (sortMode === 'days') {
        const diff = b.approvedDays + b.pendingDays - (a.approvedDays + a.pendingDays);
        if (diff !== 0) return diff;
      }
      return a.emp.name.localeCompare(b.emp.name, lang);
    });
  }, [filteredLeaves, filteredUsers, viewStart, viewEnd, dayIndex, onlyWithLeave, sortMode, lang]);

  const groups = useMemo(() => {
    if (!groupByDept) return [{ key: '__all', label: '', rows }];
    const m = new Map<string, RowData[]>();
    for (const r of rows) {
      const key = r.emp.department || '—';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()]
      .map(([label, groupRows]) => ({ key: label, label, rows: groupRows }))
      .sort((a, b) => {
        const sum = (g: typeof a) =>
          g.rows.reduce((acc, r) => acc + r.approvedDays + r.pendingDays, 0);
        return sum(b) - sum(a) || a.label.localeCompare(b.label);
      });
  }, [rows, groupByDept]);

  // ── Overtime layer: per-user, per-day hours ──────────────────────────────
  // Accounting needs the opposite of absence too: who worked extra and how
  // much. Rejected/cancelled requests carry no hours and are dropped.
  const overtimeByUser = useMemo(() => {
    const m = new Map<string, Map<string, OvertimeRecord[]>>();
    if (!showOvertime) return m;
    for (const o of overtimes) {
      if (o.status === 'rejected' || o.status === 'cancelled') continue;
      if (o.date < viewStart || o.date > viewEnd) continue;
      let byDay = m.get(o.userId);
      if (!byDay) {
        byDay = new Map();
        m.set(o.userId, byDay);
      }
      const list = byDay.get(o.date) ?? [];
      list.push(o);
      byDay.set(o.date, list);
    }
    return m;
  }, [overtimes, showOvertime, viewStart, viewEnd]);

  const overtimeHoursForUser = useCallback(
    (userId: string) => {
      const byDay = overtimeByUser.get(userId);
      if (!byDay) return 0;
      let sum = 0;
      for (const list of byDay.values()) {
        for (const o of list) if (o.status === 'approved') sum += o.estimatedHours;
      }
      return sum;
    },
    [overtimeByUser],
  );

  const totalOvertimeHours = useMemo(
    () => rows.reduce((acc, r) => acc + overtimeHoursForUser(r.emp._id), 0),
    [rows, overtimeHoursForUser],
  );

  // ── KPIs & per-day absence counts ────────────────────────────────────────
  const onLeaveTodayNames = rows.filter((r) => r.onLeaveToday).map((r) => r.emp.name);
  const pendingCount = filteredLeaves.filter((l) => l.status === 'pending').length;
  const totalApprovedDays = rows.reduce((acc, r) => acc + r.approvedDays, 0);
  const totalPendingDays = rows.reduce((acc, r) => acc + r.pendingDays, 0);

  const absentPerDay = useMemo(() => {
    const counts = new Array(visibleDays.length).fill(0) as number[];
    const names = visibleDays.map(() => [] as string[]);
    for (const r of rows) {
      for (const l of r.leaves) {
        if (l.status === 'rejected' || l.status === 'pending') continue;
        visibleDays.forEach((d, i) => {
          if (l.startDate <= d.ds && l.endDate >= d.ds) {
            counts[i] = (counts[i] ?? 0) + 1;
            (names[i] ??= []).push(r.emp.name);
          }
        });
      }
    }
    return { counts, names };
  }, [rows, visibleDays]);

  // Snap today's column into view when the period contains it
  useEffect(() => {
    const i = visibleDays.findIndex((d) => d.isToday);
    if (i === -1 || !scrollRef.current) return;
    const target = leftW + i * cellW - 240;
    if (target > 0) scrollRef.current.scrollTo({ left: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layout inputs only
  }, [viewStart, viewEnd, showWeekends, compact, cellW]);

  // ── Filter actions ───────────────────────────────────────────────────────
  const toggleSetValue = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.size === 0) return new Set([v]); // "all" → focus this one
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next; // empty again means "all"
    });

  const activeFilterCount =
    typeSet.size +
    statusSet.size +
    [
      deptFilter !== 'all',
      posFilter !== 'all',
      levelFilter !== 'all',
      empTypeFilter !== 'all',
      onlyWithLeave,
      !!search,
    ].filter(Boolean).length;

  const resetFilters = () => {
    setSearch('');
    setTypeSet(new Set());
    setStatusSet(new Set());
    setDeptFilter('all');
    setPosFilter('all');
    setLevelFilter('all');
    setEmpTypeFilter('all');
    setOnlyWithLeave(false);
  };

  // ── CSV export (the accounting deliverable) ──────────────────────────────
  const exportCsv = useCallback(() => {
    const sep = ';';
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const dateHeaders = visibleDays.map((d) => format(d.date, 'dd.MM'));
    const typeCols = ALL_LEAVE_TYPES.filter((ty) => rows.some((r) => r.byType.get(ty)));

    const header = [
      t('timesheet.employee'),
      t('timesheet.position'),
      t('timesheet.department'),
      ...dateHeaders,
      t('timesheet.totalDays'),
      ...typeCols.map((ty) => typeLabel(ty)),
    ]
      .map(q)
      .join(sep);

    const lines = rows.map((r) => {
      const cells = visibleDays.map((d) => {
        const covering = r.leaves
          .filter((l) => l.startDate <= d.ds && l.endDate >= d.ds && l.status !== 'rejected')
          .sort((a) => (a.status === 'pending' ? 1 : -1));
        const cov = covering[0];
        if (!cov) return '';
        return cov.status === 'pending' ? `${cov.type}?` : cov.type;
      });
      return [
        r.emp.name,
        r.emp.position ?? '',
        r.emp.department ?? '',
        ...cells,
        String(r.approvedDays + r.pendingDays),
        ...typeCols.map((ty) => String(r.byType.get(ty) ?? 0)),
      ]
        .map(q)
        .join(sep);
    });

    const csv = '\uFEFF' + [header, ...lines, '', q(t('timesheet.exportLegend'))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet_${viewStart}_${viewEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, visibleDays, viewStart, viewEnd, t, typeLabel]);

  // ── Render helpers ───────────────────────────────────────────────────────
  const rowHeight = (laneCount: number) =>
    Math.max(compact ? 40 : 58, (compact ? 8 : 14) + laneCount * (laneH + LANE_GAP));

  const statusChip = (status: string, label: string, swatch: React.ReactNode) => (
    <button
      key={status}
      type="button"
      onClick={() => toggleSetValue(setStatusSet, status)}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
        statusSet.size === 0 || statusSet.has(status)
          ? 'border-transparent bg-(--surface-2) text-(--text-primary) shadow-sm'
          : 'border-(--border-subtle) text-(--text-muted) opacity-50 hover:opacity-90',
      )}
    >
      {swatch}
      {label}
    </button>
  );

  const quickToggle = (checked: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
        checked
          ? 'border-(--brand)/30 bg-(--brand)/10 text-(--brand-text)'
          : 'border-(--border-subtle) text-(--text-muted) hover:bg-(--surface-2)/60',
      )}
    >
      <span
        className={cn(
          'flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-colors',
          checked
            ? 'border-transparent bg-(--brand) text-white'
            : 'border-(--border) bg-(--background)',
        )}
      >
        {checked && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      </span>
      {label}
    </button>
  );

  const sectionLabel = (key: string) => (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)/80">
      {t(key)}
    </div>
  );

  const emptyState = rows.length === 0 && (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none">
      <CalendarDays className="h-10 w-10 text-(--text-muted)/30" />
      <p className="text-sm font-medium text-(--text-muted)">
        {allUsers.length === 0
          ? t('timesheet.noEmployees', { defaultValue: 'No employees found' })
          : t('timesheet.noEmployeesHint', { defaultValue: 'No employees match the filters' })}
      </p>
      {allUsers.length > 0 && (
        <p className="text-xs text-(--text-muted)/70">{t('timesheet.noEmployeesHint')}</p>
      )}
    </div>
  );

  const noLeaves = rows.length > 0 && rows.every((r) => r.leaves.length === 0) && (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-(--border-subtle) bg-(--background)/90 px-4 py-1.5 text-xs text-(--text-muted) shadow-sm backdrop-blur">
      {t('timesheet.noLeavesInPeriod', { defaultValue: 'No leave records in this period' })}
    </div>
  );

  const renderBar = (bar: LaneBar, laneTop: number) => {
    const { leave, startIdx, endIdx, lane, clippedStart, clippedEnd } = bar;
    const c = typeColor(leave.type);
    const span = endIdx - startIdx + 1;
    const isPending = leave.status === 'pending';
    const isRejected = leave.status === 'rejected';
    const meta = STATUS_BADGE[leave.status];
    const Icon = TYPE_ICON[leave.type] ?? CalendarDays;
    const radius = clippedStart || clippedEnd ? 0 : 7;
    const iconSize = compact ? 10 : cellW >= 48 ? 15 : 12;

    return (
      <Tooltip key={leave._id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onLeaveClick?.(leave)}
            aria-label={`${typeLabel(leave.type)} · ${leave.userName ?? ''}`}
            className={cn(
              'absolute z-[5] flex items-center overflow-hidden text-left',
              'cursor-pointer transition-all hover:z-10 hover:scale-y-110 hover:brightness-105',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-1',
            )}
            style={{
              left: startIdx * cellW + 1,
              width: span * cellW - 2,
              top: laneTop + lane * (laneH + LANE_GAP),
              height: laneH,
              borderRadius: radius,
              opacity: isRejected ? 0.5 : 1,
              ...barVisuals(leave.status, c),
            }}
          >
            {!isRejected && (
              <span className="flex h-full w-full" aria-hidden>
                {Array.from({ length: span }, (_, i) => (
                  <span
                    key={i}
                    className="flex h-full shrink-0 items-center justify-center"
                    style={{ width: cellW }}
                  >
                    <Icon
                      style={{ color: c, opacity: isPending ? 0.55 : 0.9 }}
                      size={iconSize}
                      strokeWidth={2.4}
                    />
                  </span>
                ))}
              </span>
            )}
            {clippedStart && (
              <ChevronLeft
                aria-hidden
                className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: c }}
                strokeWidth={3}
              />
            )}
            {clippedEnd && (
              <ChevronRight
                aria-hidden
                className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: c }}
                strokeWidth={3}
              />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="w-64 p-0 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: `${c}1f` }}>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md shadow-sm"
              style={{ background: `linear-gradient(135deg, ${c}, ${c}c0)` }}
            >
              <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
            </span>
            <span className="truncate text-xs font-semibold text-(--text-primary)">
              {typeLabel(leave.type)}
            </span>
            {meta && (
              <Badge variant={meta.variant} size="sm" className="ml-auto shrink-0">
                {t(meta.labelKey)}
              </Badge>
            )}
          </div>
          <div className="space-y-1.5 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-(--text-muted)">{t('timesheet.period')}</span>
              <span className="font-medium text-(--text-primary)">
                {format(parseISO(leave.startDate), 'dd MMM', { locale: dateFnsLocale })} –{' '}
                {format(parseISO(leave.endDate), 'dd MMM yyyy', { locale: dateFnsLocale })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-(--text-muted)">{t('leave.days')}</span>
              <span className="font-semibold text-(--text-primary)">
                {leave.days} {t('leave.daysSuffix', { defaultValue: 'd' })}
              </span>
            </div>
            {(clippedStart || clippedEnd) && (
              <p className="text-[10px] italic text-(--text-muted)">↦ {t('timesheet.clipped')}</p>
            )}
            {leave.reason && (
              <div className="border-t border-(--border-subtle) pt-1.5">
                <span className="text-[10px] uppercase tracking-wide text-(--text-muted)/80">
                  {t('timesheet.reason')}
                </span>
                <p className="line-clamp-3 text-(--text-secondary)">{leave.reason}</p>
              </div>
            )}
            {leave.reviewComment && (
              <div className="border-t border-(--border-subtle) pt-1.5">
                <span className="text-[10px] uppercase tracking-wide text-(--text-muted)/80">
                  {t('timesheet.reviewedBy')}
                  {leave.reviewerName ? ` · ${leave.reviewerName}` : ''}
                </span>
                <p className="line-clamp-2 text-(--text-secondary)">{leave.reviewComment}</p>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const kpiCard = (
    icon: React.ElementType,
    label: string,
    value: React.ReactNode,
    tone: string,
    title?: string,
  ) => (
    <div
      title={title}
      className="glass-panel flex items-center gap-3 rounded-xl border border-(--border-subtle) bg-(--background)/60 px-3 py-2.5"
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>
        {React.createElement(icon, { className: 'h-4 w-4' })}
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight text-(--text-primary)">{value}</div>
        <div className="truncate text-[10.5px] text-(--text-muted)">{label}</div>
      </div>
    </div>
  );

  const sheet = (
    <TooltipProvider delayDuration={150}>
      <div
        ref={containerRef}
        className={cn(
          'flex min-h-0 flex-col gap-3',
          // z-70: above the desktop sidebar (z-60) and navbar (z-50), below
          // tooltips (z-90) and dialogs. Record sheets opened from a bar are
          // elevated to z-75 by the host so they stay on top.
          isFs && 'fixed inset-0 z-[70] overflow-hidden bg-(--background) p-4 sm:p-6',
          isFs && (fsClosing ? 'tc-fs-exit' : 'tc-fs-enter'),
          !isFs && fsSettling && 'tc-fs-enter',
        )}
      >
        {/* ── Title row ── */}
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold tracking-tight text-(--text-primary)">
              {t('timesheet.title', { defaultValue: 'Timesheet Calendar' })}
            </h3>
            <p className="truncate text-xs text-(--text-muted)">
              {t('timesheet.subtitle', {
                defaultValue: 'Who is away, when and why — all leave types in one view',
              })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleFullscreen} className="gap-2 shrink-0">
            {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFs
              ? t('actions.exitFullscreen', { defaultValue: 'Exit fullscreen' })
              : t('actions.fullscreen', { defaultValue: 'Fullscreen' })}
          </Button>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {kpiCard(
            Users,
            t('timesheet.kpiEmployees'),
            rows.length === allUsers.length ? (
              rows.length
            ) : (
              <span>
                {rows.length}
                <span className="text-sm font-medium text-(--text-muted)">/{allUsers.length}</span>
              </span>
            ),
            'bg-(--brand)/15 text-(--brand-text)',
          )}
          {kpiCard(
            Plane,
            t('timesheet.kpiOnLeaveToday'),
            onLeaveTodayNames.length,
            'bg-(--danger)/15 text-(--danger-text)',
            onLeaveTodayNames.join(', '),
          )}
          {kpiCard(
            Hourglass,
            t('timesheet.kpiPending'),
            pendingCount,
            'bg-(--warning-quiet) text-(--warning-text)',
          )}
          {kpiCard(
            CalendarCheck,
            t('timesheet.kpiDaysInPeriod'),
            <span>
              {totalApprovedDays}
              {totalPendingDays > 0 && (
                <span
                  className="ml-1 text-sm font-semibold text-(--warning-text)"
                  title={t('timesheet.legendPending')}
                >
                  +{totalPendingDays}
                </span>
              )}
            </span>,
            'bg-(--success-quiet) text-(--success-text)',
          )}
        </div>

        {/* ── Toolbar ── */}
        <Card className="glass-panel shrink-0 shadow-sm">
          <CardContent className="space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)" />
                <Input
                  placeholder={t('timesheet.searchPlaceholder')}
                  className="h-8 pl-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Button
                size="sm"
                variant={showFilters ? 'default' : 'outline'}
                onClick={() => setShowFilters((v) => !v)}
                className="gap-1.5"
              >
                <Filter className="h-3.5 w-3.5" />
                {t('timesheet.filter')}
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--background)/25 px-1 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>

              <div className="mx-1 hidden h-6 w-px bg-(--border-subtle) sm:block" />

              <div className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[170px] text-center text-sm font-semibold capitalize text-(--text-primary)">
                  {periodLabel}
                  {!isFullMonth && (
                    <span className="ml-1.5 rounded-full bg-(--surface-2) px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-(--text-muted)">
                      {t('timesheet.customPeriod')}
                    </span>
                  )}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Button size="sm" variant="outline" onClick={goToday} className="gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {t('timesheet.today')}
              </Button>

              {quickToggle(
                showWeekends,
                () => setShowWeekends((v) => !v),
                t('timesheet.showWeekends', { defaultValue: 'Weekends' }),
              )}
              {quickToggle(
                markHolidays,
                () => setMarkHolidays((v) => !v),
                t('timesheet.markHolidays', { defaultValue: 'Holidays' }),
              )}

              <div className="mx-1 hidden h-6 w-px bg-(--border-subtle) sm:block" />

              <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {t('timesheet.exportCsv')}
              </Button>

              <Button
                size="icon-sm"
                variant={compact ? 'default' : 'ghost'}
                onClick={() => setCompact((v) => !v)}
                title={t('timesheet.compactMode')}
                aria-label={t('timesheet.compactMode')}
              >
                <Rows3 className="h-4 w-4" />
              </Button>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div className="space-y-3 border-t border-(--border-subtle) pt-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
                  <div>
                    {sectionLabel('timesheet.timeOffType')}
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_LEAVE_TYPES.map((ty) => {
                        const c = typeColor(ty);
                        const active = typeSet.size === 0 || typeSet.has(ty);
                        const FIcon = TYPE_ICON[ty] ?? CalendarDays;
                        return (
                          <button
                            key={ty}
                            type="button"
                            onClick={() => toggleSetValue(setTypeSet, ty)}
                            title={typeLabel(ty)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                              active
                                ? 'border-transparent shadow-sm'
                                : 'border-(--border-subtle) opacity-45 hover:opacity-90',
                            )}
                            style={active ? { background: `${c}1f`, color: c } : undefined}
                          >
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px]"
                              style={{ background: c }}
                            >
                              <FIcon className="h-2.5 w-2.5 text-white" strokeWidth={2.6} />
                            </span>
                            {typeLabel(ty)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    {sectionLabel('timesheet.requestStatus')}
                    <div className="flex flex-wrap gap-1.5">
                      {statusChip(
                        'approved',
                        t('leave.approved'),
                        <span className="h-2 w-2 rounded-[3px] bg-emerald-500" />,
                      )}
                      {statusChip(
                        'pending',
                        t('leave.pending'),
                        <span
                          className="h-2 w-2 rounded-[3px]"
                          style={{
                            background:
                              'repeating-linear-gradient(45deg, #fbbf24 0 3px, #fde68a 3px 6px)',
                          }}
                        />,
                      )}
                      {statusChip(
                        'rejected',
                        t('leave.rejected'),
                        <span
                          className="h-2 w-2 rounded-[3px] border border-slate-400"
                          style={{
                            background:
                              'repeating-linear-gradient(45deg, #94a3b866 0 2px, transparent 2px 4px)',
                          }}
                        />,
                      )}
                      {statusChip(
                        'cancel_requested',
                        t('leave.cancellationRequested'),
                        <span className="h-2 w-2 rounded-[3px] border border-dashed border-slate-500 bg-slate-300" />,
                      )}
                    </div>
                  </div>

                  <div>
                    {sectionLabel('timesheet.employeeType')}
                    <Select value={empTypeFilter} onValueChange={setEmpTypeFilter}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('timesheet.allEmployeeTypes')}</SelectItem>
                        <SelectItem value="staff">{t('timesheet.staff')}</SelectItem>
                        <SelectItem value="contractor">{t('timesheet.contractor')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    {sectionLabel('timesheet.period')}
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={viewStart}
                        onChange={(e) => setRange(e.target.value, viewEnd)}
                        className="h-8 w-[124px] text-xs"
                        aria-label={t('timesheet.from')}
                      />
                      <span className="text-xs text-(--text-muted)">–</span>
                      <Input
                        type="date"
                        value={viewEnd}
                        onChange={(e) => setRange(viewStart, e.target.value)}
                        className="h-8 w-[124px] text-xs"
                        aria-label={t('timesheet.to')}
                      />
                    </div>
                  </div>

                  <div>
                    {sectionLabel('timesheet.department')}
                    <Select value={deptFilter} onValueChange={setDeptFilter}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('timesheet.allDepartments')}</SelectItem>
                        {departments.map((dept) => (
                          <SelectItem key={dept._id} value={dept.name}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    {sectionLabel('timesheet.position')}
                    <Select value={posFilter} onValueChange={setPosFilter}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('timesheet.allPositions')}</SelectItem>
                        {[...new Set(positions.map((p) => p.title))].map((title) => (
                          <SelectItem key={title} value={title}>
                            {title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    {sectionLabel('timesheet.level')}
                    <Select value={levelFilter} onValueChange={setLevelFilter}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('timesheet.allLevels')}</SelectItem>
                        {[...new Set(positions.map((p) => p.level).filter(Boolean))].map((lvl) => (
                          <SelectItem key={lvl} value={lvl!}>
                            {lvl}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    {sectionLabel('timesheet.sortBy')}
                    <Select
                      value={sortMode}
                      onValueChange={(v) => setSortMode(v as 'name' | 'days')}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">{t('timesheet.byName')}</SelectItem>
                        <SelectItem value="days">{t('timesheet.byDays')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-(--border-subtle) pt-2.5">
                  {[
                    {
                      checked: showWeekends,
                      set: setShowWeekends,
                      label: t('timesheet.showWeekends'),
                    },
                    {
                      checked: markHolidays,
                      set: setMarkHolidays,
                      label: t('timesheet.markHolidays'),
                    },
                    {
                      checked: groupByDept,
                      set: setGroupByDept,
                      label: t('timesheet.groupByDepartment'),
                    },
                    {
                      checked: onlyWithLeave,
                      set: setOnlyWithLeave,
                      label: t('timesheet.onlyWithLeave'),
                    },
                    {
                      checked: showOvertime,
                      set: setShowOvertime,
                      label: t('timesheet.showOvertime', { defaultValue: 'Show overtime' }),
                    },
                  ].map(({ checked, set, label }) => (
                    <label key={label} className="flex cursor-pointer items-center gap-2">
                      <Switch checked={checked} onCheckedChange={set} className="scale-90" />
                      <span className="text-xs text-(--text-secondary)">{label}</span>
                    </label>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetFilters}
                    className="ml-auto h-8 gap-1 text-(--text-muted)"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('timesheet.reset')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Grid ── */}
        <div
          ref={scrollRef}
          className={cn(
            'relative min-h-0 flex-1 overflow-auto rounded-xl border border-(--border-subtle)',
            'bg-(--background) shadow-sm',
            !isFs && 'min-h-[560px]',
          )}
        >
          <div style={{ minWidth: totalW }} className="relative flex min-h-full flex-col">
            {emptyState}
            {noLeaves}

            {/* Header */}
            <div className="sticky top-0 z-30 flex shrink-0 border-b border-(--border) bg-(--background)/95 backdrop-blur">
              <div
                className="sticky left-0 z-40 flex shrink-0 items-end border-r border-(--border-subtle) bg-(--background) px-3 pb-2"
                style={{ width: leftW }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  {t('timesheet.employee')}
                </span>
              </div>
              {visibleDays.map((cell) => {
                const head = (
                  <div
                    key={cell.ds}
                    className={cn(
                      'flex shrink-0 select-none flex-col items-center justify-end gap-0.5 py-1.5',
                      cell.isToday && 'bg-(--brand)/[0.07]',
                      cell.isWeekend && !cell.isToday && 'bg-(--surface-2)/40',
                    )}
                    style={{ width: cellW }}
                  >
                    <span
                      className={cn(
                        'text-[9px] leading-none',
                        cell.isWeekend ? 'text-(--text-muted)/55' : 'text-(--text-muted)',
                      )}
                    >
                      {format(
                        cell.date,
                        compact || cellW < 30 ? 'EEEEE' : cellW < 42 ? 'EE' : 'EEE',
                        {
                          locale: dateFnsLocale,
                        },
                      )}
                    </span>
                    <span
                      className={cn(
                        'flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold leading-none',
                        cell.isToday
                          ? 'bg-(--brand) text-white shadow'
                          : cell.isWeekend
                            ? 'text-(--text-muted)'
                            : cell.holiday
                              ? 'text-(--danger-text)'
                              : 'text-(--text-primary)',
                      )}
                    >
                      {format(cell.date, 'd')}
                    </span>
                    {cell.holiday ? (
                      <span
                        className={cn(
                          'h-1 w-1 rounded-full',
                          cell.holiday.type === 'public' ? 'bg-rose-500' : 'bg-amber-400',
                        )}
                      />
                    ) : (
                      <span className="h-1" />
                    )}
                  </div>
                );
                if (cell.holiday && markHolidays) {
                  return (
                    <Tooltip key={cell.ds}>
                      <TooltipTrigger asChild>
                        <div>{head}</div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <span className="font-semibold">{cell.holiday.name}</span>
                        <span className="ml-1.5 text-(--text-muted)">
                          {cell.holiday.type === 'public'
                            ? t('timesheet.holidayPublic')
                            : t('timesheet.holidayInternal')}
                        </span>
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return head;
              })}
              <div
                className="sticky right-0 z-40 flex shrink-0 items-center justify-center border-l border-(--border-subtle) bg-(--background) px-1 pb-2"
                style={{ width: RIGHT_W }}
              >
                <span className="text-center text-[10px] font-semibold uppercase leading-tight tracking-wider text-(--text-muted)">
                  {t('timesheet.totalDays')}
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1">
              {groups.map((group) => (
                <div key={group.key}>
                  {groupByDept && (
                    <div className="flex h-9 border-b border-(--border-subtle) bg-(--surface-2)/45">
                      <div
                        className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-(--border-subtle) bg-(--surface-2)/45 px-3"
                        style={{ width: leftW }}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-(--brand)/15 text-[9px] font-bold text-(--brand-text)">
                          {getInitials(group.label).charAt(0)}
                        </span>
                        <span className="truncate text-[11px] font-semibold text-(--text-primary)">
                          {group.label}
                        </span>
                      </div>
                      <div
                        className="flex shrink-0 items-center gap-2 px-3"
                        style={{ width: trackW }}
                      >
                        <span className="text-[10px] uppercase tracking-wider text-(--text-muted)">
                          {t('timesheet.employeesInGroup', { count: group.rows.length })}
                        </span>
                      </div>
                      <div
                        className="sticky right-0 z-20 flex shrink-0 items-center justify-center border-l border-(--border-subtle) bg-(--surface-2)/45 px-2 text-xs font-bold text-(--text-secondary)"
                        style={{ width: RIGHT_W }}
                      >
                        {group.rows.reduce((acc, r) => acc + r.approvedDays + r.pendingDays, 0)}
                        {t('leave.daysSuffix', { defaultValue: 'd' })}
                      </div>
                    </div>
                  )}

                  {group.rows.map((row) => {
                    const h = rowHeight(row.laneCount);
                    const laneTop =
                      (h - row.laneCount * laneH - (row.laneCount - 1) * LANE_GAP) / 2;
                    return (
                      <div
                        key={row.emp._id}
                        className="group/row flex border-b border-(--border-subtle)/60 transition-colors hover:bg-(--surface-2)/25"
                        style={{ height: h }}
                      >
                        {/* Identity (sticky left) */}
                        <div
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-2.5 border-r border-(--border-subtle) bg-(--background) px-3"
                          style={{ width: leftW }}
                        >
                          <div className="pointer-events-none absolute inset-0 hidden bg-(--surface-2)/25 group-hover/row:block" />
                          {row.emp.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- dynamic user avatar URL from backend
                            <img
                              src={row.emp.avatarUrl}
                              alt=""
                              className="relative h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-(--brand)/20"
                            />
                          ) : (
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-(--brand)/25 to-(--brand)/10 ring-2 ring-(--brand)/20">
                              <span className="text-[11px] font-bold text-(--brand-text)">
                                {getInitials(row.emp.name)}
                              </span>
                            </div>
                          )}
                          <div className="relative min-w-0">
                            <EmployeeHoverCard
                              userId={row.emp._id as unknown as string}
                              name={row.emp.name}
                              employeeData={row.emp}
                              elevated
                            >
                              <p className="truncate text-[13px] font-semibold leading-tight text-(--brand-text) cursor-pointer hover:underline hover:underline-offset-2">
                                {row.emp.name}
                              </p>
                            </EmployeeHoverCard>
                            <p className="truncate text-[10px] leading-tight text-(--text-muted)">
                              {row.emp.position ?? ''}
                            </p>
                            <p className="truncate text-[10px] leading-tight text-(--text-muted)/70">
                              {row.emp.department ?? ''}
                            </p>
                          </div>
                        </div>

                        {/* Track: day cells + leave bars */}
                        <div className="relative shrink-0" style={{ width: trackW }}>
                          <div className="flex h-full">
                            {visibleDays.map((cell) => (
                              <div
                                key={cell.ds}
                                className={cn(
                                  'h-full shrink-0 border-r border-(--border-subtle)/25',
                                  cell.isToday && 'bg-(--brand)/[0.06]',
                                  cell.isWeekend && !cell.isToday && 'bg-(--surface-2)/40',
                                  markHolidays &&
                                    cell.holiday &&
                                    !cell.isToday &&
                                    'bg-rose-500/[0.05]',
                                )}
                                style={{ width: cellW }}
                              />
                            ))}
                          </div>
                          {row.bars.map((bar) => renderBar(bar, laneTop))}
                          {/* Overtime ticks: a corner flag + hour count per day */}
                          {showOvertime &&
                            [...(overtimeByUser.get(row.emp._id)?.entries() ?? [])].map(
                              ([ds, list]) => {
                                const idx = dayIndex.get(ds);
                                if (idx === undefined) return null;
                                const hours = list.reduce((a, o) => a + o.estimatedHours, 0);
                                const pending = list.some((o) => o.status === 'pending');
                                return (
                                  <Tooltip key={`ot-${row.emp._id}-${ds}`}>
                                    <TooltipTrigger asChild>
                                      <span
                                        className="absolute top-0 z-[6] flex cursor-default items-center justify-center rounded-b-[4px] px-0.5 text-[8px] font-bold leading-none text-white"
                                        style={{
                                          left: idx * cellW + 2,
                                          width: cellW - 4,
                                          height: compact ? 9 : 11,
                                          background: pending
                                            ? `repeating-linear-gradient(45deg, ${OVERTIME_COLOR}cc 0 3px, ${OVERTIME_COLOR}77 3px 6px)`
                                            : OVERTIME_COLOR,
                                        }}
                                      >
                                        {!compact && `+${hours}`}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-60 text-xs">
                                      <p
                                        className="font-semibold"
                                        style={{ color: OVERTIME_COLOR }}
                                      >
                                        {t('timesheet.overtime', { defaultValue: 'Overtime' })} · +
                                        {hours}
                                        {t('timesheet.hoursSuffix', { defaultValue: 'h' })}
                                      </p>
                                      {list.map((o) => (
                                        <p key={o._id} className="text-(--text-secondary)">
                                          {o.startTime}–{o.endTime} · {o.estimatedHours}
                                          {t('timesheet.hoursSuffix', { defaultValue: 'h' })}
                                          {o.status === 'pending' &&
                                            ` · ${t('leave.pending', { defaultValue: 'Pending' })}`}
                                        </p>
                                      ))}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              },
                            )}
                        </div>

                        {/* Totals (sticky right) */}
                        <div
                          className="sticky right-0 z-20 flex shrink-0 items-center justify-center border-l border-(--border-subtle) bg-(--background) px-2"
                          style={{ width: RIGHT_W }}
                        >
                          <div className="pointer-events-none absolute inset-0 hidden bg-(--surface-2)/25 group-hover/row:block" />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="relative flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-sm font-bold text-(--text-primary) transition-colors hover:bg-(--surface-2)/60"
                              >
                                {row.approvedDays}
                                {row.pendingDays > 0 && (
                                  <span
                                    className="text-[10px] font-semibold text-(--warning-text)"
                                    title={t('timesheet.legendPending')}
                                  >
                                    +{row.pendingDays}
                                  </span>
                                )}
                                {showOvertime && overtimeHoursForUser(row.emp._id) > 0 && (
                                  <span
                                    className="text-[10px] font-semibold"
                                    style={{ color: OVERTIME_COLOR }}
                                    title={t('timesheet.overtime', { defaultValue: 'Overtime' })}
                                  >
                                    {overtimeHoursForUser(row.emp._id)}
                                    {t('timesheet.hoursSuffix', { defaultValue: 'h' })}
                                  </span>
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="w-56 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-semibold text-(--text-primary)">
                                  {row.emp.name}
                                </span>
                                <span className="shrink-0 text-xs font-bold text-(--text-primary)">
                                  {row.approvedDays + row.pendingDays}
                                  {t('leave.daysSuffix', { defaultValue: 'd' })}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {[...row.byType.entries()]
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([ty, days]) => (
                                    <div key={ty} className="flex items-center gap-2 text-xs">
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-[3px]"
                                        style={{ background: typeColor(ty) }}
                                      />
                                      <span className="flex-1 truncate text-(--text-secondary)">
                                        {typeLabel(ty)}
                                      </span>
                                      <span className="font-semibold text-(--text-primary)">
                                        {days}
                                        {t('leave.daysSuffix', { defaultValue: 'd' })}
                                      </span>
                                    </div>
                                  ))}
                                {row.pendingDays > 0 && (
                                  <p className="pt-1 text-[10px] text-(--warning-text)">
                                    +{row.pendingDays}
                                    {t('leave.daysSuffix', { defaultValue: 'd' })} ·{' '}
                                    {t('timesheet.legendPending')}
                                  </p>
                                )}
                                {row.byType.size === 0 && (
                                  <p className="text-xs text-(--text-muted)">—</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer: absence count per day */}
            <div className="sticky bottom-0 z-30 flex shrink-0 border-t border-(--border) bg-(--background)/95 backdrop-blur">
              <div
                className="sticky left-0 z-40 flex shrink-0 items-center border-r border-(--border-subtle) bg-(--background) px-3"
                style={{ width: leftW }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  {t('timesheet.absentPerDay')}
                </span>
              </div>
              {absentPerDay.counts.map((n, i) => (
                <div
                  key={visibleDays[i]?.ds ?? i}
                  title={absentPerDay.names[i]?.join(', ')}
                  className={cn(
                    'flex h-7 shrink-0 items-center justify-center border-r border-(--border-subtle)/25 text-[10px] font-bold',
                    n === 0 && 'text-(--text-muted)/30',
                    n > 0 && n < 3 && 'bg-(--brand)/[0.10] text-(--brand-text)',
                    n >= 3 && 'bg-(--danger)/[0.14] text-(--danger-text)',
                    visibleDays[i]?.isWeekend && n === 0 && 'bg-(--surface-2)/40',
                  )}
                  style={{ width: cellW }}
                >
                  {n || ''}
                </div>
              ))}
              <div
                className="sticky right-0 z-40 flex shrink-0 items-center justify-center border-l border-(--border-subtle) bg-(--background) px-2 text-xs font-bold text-(--text-primary)"
                style={{ width: RIGHT_W }}
              >
                {totalApprovedDays}
                {t('leave.daysSuffix', { defaultValue: 'd' })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Legend (interactive — click a type to filter) ── */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)/70">
            {t('timesheet.legendTypes')}
          </span>
          {ALL_LEAVE_TYPES.map((ty) => {
            const c = typeColor(ty);
            const active = typeSet.size === 0 || typeSet.has(ty);
            const LIcon = TYPE_ICON[ty] ?? CalendarDays;
            return (
              <button
                key={ty}
                type="button"
                onClick={() => toggleSetValue(setTypeSet, ty)}
                className={cn(
                  'flex items-center gap-1.5 transition-opacity',
                  active ? 'opacity-100' : 'opacity-40 hover:opacity-75',
                )}
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${c}, ${c}c0)` }}
                >
                  <LIcon className="h-3 w-3 text-white" strokeWidth={2.4} />
                </span>
                <span className="text-[10.5px] text-(--text-muted)">{typeLabel(ty)}</span>
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-(--border-subtle)" />
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 shrink-0 rounded-sm bg-(--surface-2) ring-1 ring-(--border-subtle)" />
            <span className="text-[10.5px] text-(--text-muted)">
              {t('timesheet.legendWeekend')}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 shrink-0 rounded-sm bg-rose-500/10 ring-1 ring-rose-500/25" />
            <span className="text-[10.5px] text-(--text-muted)">
              {t('timesheet.legendHoliday')}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 shrink-0 rounded-sm bg-(--brand)/15 ring-1 ring-(--brand)/40" />
            <span className="text-[10.5px] text-(--text-muted)">{t('timesheet.legendToday')}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-3.5 shrink-0 rounded-sm"
              style={{
                background:
                  'repeating-linear-gradient(45deg, #94a3b82e 0 4px, transparent 4px 8px)',
              }}
            />
            <span className="text-[10.5px] text-(--text-muted)">
              {t('timesheet.legendRejected')}
            </span>
          </span>
          {showOvertime && (
            <button
              type="button"
              onClick={() => setShowOvertime(false)}
              className="flex items-center gap-1.5"
              title={t('timesheet.showOvertime', { defaultValue: 'Show overtime' })}
            >
              <span
                className="h-2.5 w-3.5 shrink-0 rounded-sm"
                style={{ background: OVERTIME_COLOR }}
              />
              <span className="text-[10.5px] text-(--text-muted)">
                {t('timesheet.overtime', { defaultValue: 'Overtime' })}
                {totalOvertimeHours > 0 &&
                  ` · ${totalOvertimeHours}${t('timesheet.hoursSuffix', { defaultValue: 'h' })}`}
              </span>
            </button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );

  // Fullscreen must escape the app shell (sidebar z-60, navbar z-50 and the
  // overflow-clip main column all create paint/clip traps) — portal to body.
  if (isFs && typeof document !== 'undefined') {
    return createPortal(sheet, document.body);
  }
  return sheet;
}
