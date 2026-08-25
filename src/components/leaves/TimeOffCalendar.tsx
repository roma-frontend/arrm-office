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
  FileSpreadsheet,
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
import type * as ExcelJS from 'exceljs';

// ── Leave type catalogue ────────────────────────────────────────────────────
// The full 9-type catalogue and its colours live in src/lib/types.ts so the
// timesheet, the month calendar and the dashboards all speak the same palette.

/** Accent for the overtime layer — matches OVERTIME_COLOR in CalendarClient. */
const OVERTIME_COLOR = '#8b5cf6';

/**
 * Soft pastel palette used for leave-type cells in the Excel export.
 * Keyed by leave type, mirroring LEAVE_TYPE_COLORS in src/lib/types.ts but
 * rendered in light, neutral tones so the grid reads at a glance.
 */
const TYPE_PASTEL_BG: Record<string, string> = {
  paid: '#BFDBFE',
  unpaid: '#FDE68A',
  sick: '#FECACA',
  family: '#A7F3D0',
  doctor: '#A5F3FC',
  day_off: '#DDD6FE',
  maternity: '#FBCFE8',
  paternity: '#C7D2FE',
  study: '#E2E8F0',
};
const TYPE_PASTEL_FG: Record<string, string> = {
  paid: '#1E3A8A',
  unpaid: '#78350F',
  sick: '#7F1D1D',
  family: '#064E3B',
  doctor: '#164E63',
  day_off: '#4C1D95',
  maternity: '#831843',
  paternity: '#1E1B4B',
  study: '#1E293B',
};
const FALLBACK_PASTEL_BG = '#F1F5F9';
const FALLBACK_PASTEL_FG = '#334155';
const pastelBg = (t: string) => TYPE_PASTEL_BG[t] ?? FALLBACK_PASTEL_BG;
const pastelFg = (t: string) => TYPE_PASTEL_FG[t] ?? FALLBACK_PASTEL_FG;

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
  const [showOvertime, setShowOvertime] = useState(false);
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

  // ── Excel export (server-side, via API) ──────────────────────────────────
  const exportExcel = useCallback(async () => {
    try {
      const lang = (i18n.language as 'en' | 'ru' | 'hy' | 'de') || 'en';
      const payload = {
        viewStart,
        viewEnd,
        lang,
        days: visibleDays.map((d) => ({
          date: d.date.toISOString(),
          ds: d.ds,
          isWeekend: d.isWeekend,
          holidayName: d.holiday?.name ?? null,
        })),
        rows: rows.map((r) => ({
          emp: {
            _id: r.emp._id,
            name: r.emp.name,
            department: r.emp.department,
            position: r.emp.position,
          },
          leaves: r.leaves,
          approvedDays: r.approvedDays,
          pendingDays: r.pendingDays,
          byType: Object.fromEntries(r.byType),
          onLeaveToday: r.onLeaveToday,
        })),
        filters: {
          search: search.trim() || undefined,
          statuses: statusSet.size ? [...statusSet] : undefined,
          types: typeSet.size ? [...typeSet] : undefined,
          department: deptFilter !== 'all' ? deptFilter : undefined,
          position: posFilter !== 'all' ? posFilter : undefined,
          level: levelFilter !== 'all' ? levelFilter : undefined,
          employeeType: empTypeFilter !== 'all' ? empTypeFilter : undefined,
          onlyWithLeave: onlyWithLeave || undefined,
        },
      };
      const res = await fetch('/api/leave/timesheet-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
      a.download = `timesheet_${viewStart}_${viewEnd}_${ts}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    } catch (err) {
      console.error('Excel export failed', err);
      // fall through to legacy in-browser export
    }
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'HR Project';
    wb.created = new Date();
    wb.modified = new Date();
    wb.title = t('timesheet.title', { defaultValue: 'Табель отсутствий' });

    const typeCols = ALL_LEAVE_TYPES.filter((ty) => rows.some((r) => r.byType.get(ty)));

    // ── Helpers ─────────────────────────────────────────────────────────────
    const hexToArgb = (hex: string): string => {
      const h = hex.replace('#', '').trim().toUpperCase();
      // Already a full ARGB value — return as-is to avoid double-prefixing,
      // which Excel renders as black cells.
      if (h.length === 8) return h;
      const full =
        h.length === 3
          ? h
              .split('')
              .map((c) => c + c)
              .join('')
          : h;
      const a = 'FF';
      return a + full;
    };
    const darken = (hex: string, amount = 0.7): string => {
      const h = hex.replace('#', '');
      const full =
        h.length === 3
          ? h
              .split('')
              .map((c) => c + c)
              .join('')
          : h;
      const r = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(0, 2), 16) * amount)));
      const g = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(2, 4), 16) * amount)));
      const b = Math.max(0, Math.min(255, Math.round(parseInt(full.slice(4, 6), 16) * amount)));
      return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    const mix = (hex: string, withHex: string, t: number): string => {
      const a = hex.replace('#', '');
      const b = withHex.replace('#', '');
      const ar = parseInt(a.slice(0, 2), 16),
        ag = parseInt(a.slice(2, 4), 16),
        ab = parseInt(a.slice(4, 6), 16);
      const br = parseInt(b.slice(0, 2), 16),
        bg = parseInt(b.slice(2, 4), 16),
        bb = parseInt(b.slice(4, 6), 16);
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const bl = Math.round(ab + (bb - ab) * t);
      return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
    };

    const border: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    const borderStrong: Partial<ExcelJS.Borders> = {
      top: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'medium', color: { argb: 'FF1E293B' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right: { style: 'medium', color: { argb: 'FF1E293B' } },
    };

    // ════════════════════════════════════════════════════════════════════════
    // Sheet 1: «Сводка» — Cover/summary with KPI cards, filters, legend
    // ════════════════════════════════════════════════════════════════════════
    const cover = wb.addWorksheet(t('timesheet.sheetSummary'), {
      views: [{ showGridLines: false, zoomScale: 110 }],
    });
    cover.getColumn(1).width = 2;
    for (let c = 2; c <= 7; c++) cover.getColumn(c).width = 22;

    const now = new Date();
    cover.mergeCells('B2:G2');
    const titleCell = cover.getCell('B2');
    titleCell.value = t('timesheet.title', { defaultValue: 'Табель отсутствий' });
    titleCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    cover.getRow(2).height = 44;

    cover.mergeCells('B3:G3');
    const subCell = cover.getCell('B3');
    subCell.value = `${format(parseISO(viewStart), 'dd MMMM yyyy', { locale: ru })} — ${format(parseISO(viewEnd), 'dd MMMM yyyy', { locale: ru })} · сформировано ${format(now, 'dd.MM.yyyy HH:mm')}`;
    subCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF475569' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left' };
    cover.getRow(3).height = 22;

    // KPI cards
    const totalEmp = rows.length;
    const totalAbsenceDays = rows.reduce((acc, r) => acc + r.approvedDays + r.pendingDays, 0);
    const totalApproved = rows.reduce((acc, r) => acc + r.approvedDays, 0);
    const totalPending = rows.reduce((acc, r) => acc + r.pendingDays, 0);
    const todayAbsentees = rows.filter((r) => r.onLeaveToday).length;
    const onLeaveByType = new Map<string, number>();
    rows.forEach((r) => {
      r.leaves
        .filter((l) => {
          const today = format(now, 'yyyy-MM-dd');
          return l.startDate <= today && l.endDate >= today && l.status !== 'rejected';
        })
        .forEach((l) => onLeaveByType.set(l.type, (onLeaveByType.get(l.type) ?? 0) + 1));
    });

    const kpis: Array<{ label: string; value: number; color: string; sub?: string }> = [
      {
        label: t('timesheet.kpiEmployees'),
        value: totalEmp,
        color: '#3B82F6',
        sub: t('timesheet.kpiEmployeesSub'),
      },
      {
        label: t('timesheet.kpiOnLeaveToday'),
        value: todayAbsentees,
        color: '#EF4444',
        sub: t('timesheet.kpiPeopleSub'),
      },
      {
        label: t('timesheet.kpiPending'),
        value: totalPending,
        color: '#F59E0B',
        sub: t('timesheet.kpiDaysSub'),
      },
      {
        label: t('timesheet.kpiDaysInPeriod'),
        value: totalAbsenceDays,
        color: '#10B981',
        sub: t('timesheet.kpiPerPeriodSub'),
      },
    ];
    const kpiRow = 5;
    cover.getRow(kpiRow).height = 26;
    cover.getRow(kpiRow + 1).height = 42;
    kpis.forEach((k, i) => {
      const col = 2 + i;
      const labelCell = cover.getCell(kpiRow, col);
      labelCell.value = k.label;
      labelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(k.color) } };
      labelCell.border = borderStrong;

      const valueCell = cover.getCell(kpiRow + 1, col);
      valueCell.value = k.value;
      valueCell.font = {
        name: 'Calibri',
        size: 22,
        bold: true,
        color: { argb: hexToArgb(k.color) },
      };
      valueCell.alignment = { vertical: 'middle', horizontal: 'center' };
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: hexToArgb(mix(k.color, '#FFFFFF', 0.85)) },
      };
      valueCell.border = borderStrong;
    });

    // Legend
    const legendRow = kpiRow + 4;
    cover.mergeCells(legendRow, 2, legendRow, 7);
    const legendTitle = cover.getCell(legendRow, 2);
    legendTitle.value = t('timesheet.legendTitle');
    legendTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    legendTitle.alignment = { vertical: 'middle' };
    cover.getRow(legendRow).height = 22;

    const activeTypes = ALL_LEAVE_TYPES.filter(
      (ty) => onLeaveByType.has(ty) || rows.some((r) => r.byType.get(ty)),
    );
    const legendData: Array<{ swatch: string; label: string; note: string }> = [
      ...activeTypes.map((ty) => ({
        swatch: pastelBg(ty),
        label: typeLabel(ty),
        note: onLeaveByType.has(ty)
          ? t('timesheet.legendTodayCount', { count: onLeaveByType.get(ty) ?? 0 })
          : '',
      })),
      { swatch: '#FEE2E2', label: t('timesheet.legendWeekend'), note: '' },
      { swatch: '#E0E7FF', label: t('timesheet.legendToday'), note: '' },
      { swatch: '#F1F5F9', label: t('timesheet.legendNoData'), note: '' },
    ];
    let lRow = legendRow + 1;
    legendData.forEach((item) => {
      const sw = cover.getCell(lRow, 2);
      sw.value = '';
      sw.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(item.swatch) } };
      sw.border = border;
      const lc = cover.getCell(lRow, 3);
      lc.value = item.label;
      lc.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      lc.alignment = { vertical: 'middle' };
      lc.border = border;
      cover.mergeCells(lRow, 3, lRow, 5);
      if (item.note) {
        const noteCell = cover.getCell(lRow, 6);
        noteCell.value = item.note;
        noteCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
        noteCell.alignment = { vertical: 'middle' };
        noteCell.border = border;
        cover.mergeCells(lRow, 6, lRow, 7);
      }
      cover.getRow(lRow).height = 20;
      lRow++;
    });

    // Filters summary
    lRow += 1;
    cover.mergeCells(lRow, 2, lRow, 7);
    const fTitle = cover.getCell(lRow, 2);
    fTitle.value = t('timesheet.appliedFilters');
    fTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    fTitle.alignment = { vertical: 'middle' };
    cover.getRow(lRow).height = 22;
    lRow++;
    const filterInfo: Array<[string, string]> = [];
    filterInfo.push([t('timesheet.period'), `${viewStart} — ${viewEnd}`]);
    if (search.trim()) filterInfo.push([t('timesheet.searchLabel'), search.trim()]);
    if (statusSet.size)
      filterInfo.push([
        t('timesheet.statusesLabel'),
        [...statusSet]
          .map((s) => (STATUS_BADGE[s] ? t(STATUS_BADGE[s].labelKey, s) : s))
          .join(', '),
      ]);
    if (typeSet.size)
      filterInfo.push([t('timesheet.typesLabel'), [...typeSet].map(typeLabel).join(', ')]);
    if (deptFilter !== 'all') filterInfo.push([t('timesheet.department'), deptFilter]);
    if (posFilter !== 'all') filterInfo.push([t('timesheet.position'), posFilter]);
    if (levelFilter !== 'all') filterInfo.push([t('timesheet.level'), levelFilter]);
    if (empTypeFilter !== 'all') filterInfo.push([t('timesheet.employeeType'), empTypeFilter]);
    if (onlyWithLeave) filterInfo.push([t('timesheet.onlyWithLeave'), t('timesheet.yes')]);
    filterInfo.forEach(([k, v]) => {
      const a = cover.getCell(lRow, 2);
      a.value = k;
      a.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      a.alignment = { vertical: 'middle' };
      a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      a.border = border;
      const b = cover.getCell(lRow, 3);
      b.value = v;
      b.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      b.alignment = { vertical: 'middle', wrapText: true };
      b.border = border;
      cover.mergeCells(lRow, 3, lRow, 7);
      cover.getRow(lRow).height = 18;
      lRow++;
    });

    // ════════════════════════════════════════════════════════════════════════
    // Sheet 2: «Табель» — main grid (employees × days)
    // ════════════════════════════════════════════════════════════════════════
    const ws = wb.addWorksheet(t('timesheet.sheetTimesheet'), {
      views: [
        {
          state: 'frozen',
          xSplit: 3,
          ySplit: 3,
          showGridLines: false,
          zoomScale: 100,
        },
      ],
    });

    // Column widths
    ws.getColumn(1).width = 4; // №
    ws.getColumn(2).width = 30; // employee
    ws.getColumn(3).width = 22; // position
    visibleDays.forEach((d, i) => {
      const col = 4 + i;
      ws.getColumn(col).width = d.isWeekend ? 4.5 : 6;
    });
    const totalCol = 4 + visibleDays.length;
    const typeStartCol = totalCol + 1;
    typeCols.forEach((_, i) => {
      ws.getColumn(typeStartCol + i).width = 11;
    });
    const sumCol = typeStartCol + typeCols.length;
    ws.getColumn(sumCol).width = 16;

    // Row 1: month banner spans the day columns
    ws.mergeCells(1, 4, 1, 3 + visibleDays.length);
    const monthCell = ws.getCell(1, 4);
    monthCell.value = `${format(parseISO(viewStart), 'LLLL yyyy', { locale: ru })}`;
    monthCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    monthCell.alignment = { vertical: 'middle', horizontal: 'center' };
    monthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    monthCell.border = borderStrong;
    ws.getRow(1).height = 22;

    // Row 2: weekday short names
    const weekday = parseISO(visibleDays[0]?.ds ?? viewStart);
    const wkLocale =
      i18n.language === 'ru'
        ? ru
        : i18n.language === 'hy'
          ? hy
          : i18n.language === 'de'
            ? de
            : enUS;
    const dayLabel = (dateStr: string) => format(parseISO(dateStr), 'EEEEEE', { locale: wkLocale });
    visibleDays.forEach((d, i) => {
      const cell = ws.getCell(2, 4 + i);
      cell.value = dayLabel(d.ds);
      cell.font = {
        name: 'Calibri',
        size: 9,
        bold: true,
        color: { argb: d.isWeekend ? 'FFB91C1C' : 'FF475569' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = border;
    });

    // Row 3: day numbers + headers for left columns
    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFF6FF' },
    };
    const headerFont: Partial<ExcelJS.Font> = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    const headerAlign: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center' };
    const leftHeaders: Array<[number, string]> = [
      [1, t('timesheet.rowNumber')],
      [2, t('timesheet.employee')],
      [3, t('timesheet.department') + ' · ' + t('timesheet.position')],
    ];
    leftHeaders.forEach(([c, v]) => {
      const cell = ws.getCell(3, c);
      cell.value = v;
      cell.font = headerFont;
      cell.alignment =
        c === 1 ? headerAlign : { vertical: 'middle', horizontal: 'left', indent: 1 };
      cell.fill = headerFill;
      cell.border = borderStrong;
    });

    visibleDays.forEach((d, i) => {
      const cell = ws.getCell(3, 4 + i);
      const dNum = format(parseISO(d.ds), 'd');
      const isHoliday = !!d.holiday;
      const isTodayCol = d.ds === format(now, 'yyyy-MM-dd');
      let fillArgb: string;
      if (isHoliday) fillArgb = 'FFFEF3C7';
      else if (isTodayCol) fillArgb = 'FFE0E7FF';
      else if (d.isWeekend) fillArgb = 'FFFEE2E2';
      else fillArgb = 'FFFAFBFC';
      cell.value = parseInt(dNum, 10);
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: {
          argb: isHoliday
            ? 'FF92400E'
            : isTodayCol
              ? 'FF3730A3'
              : d.isWeekend
                ? 'FFB91C1C'
                : 'FF0F172A',
        },
      };
      cell.alignment = headerAlign;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
      cell.border = border;
      if (isTodayCol) {
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF4F46E5' } },
          left: { style: 'medium', color: { argb: 'FF4F46E5' } },
          bottom: { style: 'medium', color: { argb: 'FF4F46E5' } },
          right: { style: 'medium', color: { argb: 'FF4F46E5' } },
        };
      }
    });

    // Totals / per-type headers
    const totalHeader = ws.getCell(3, totalCol);
    totalHeader.value = t('timesheet.totalDays');
    totalHeader.font = headerFont;
    totalHeader.alignment = headerAlign;
    totalHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    totalHeader.border = borderStrong;
    typeCols.forEach((ty, i) => {
      const cell = ws.getCell(3, typeStartCol + i);
      cell.value = typeLabel(ty);
      cell.font = {
        name: 'Calibri',
        size: 9,
        bold: true,
        color: { argb: hexToArgb(pastelFg(ty)) },
      };
      cell.alignment = { ...headerAlign, wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(pastelBg(ty)) } };
      cell.border = border;
    });
    const sumHeader = ws.getCell(3, sumCol);
    sumHeader.value = t('timesheet.totalDays');
    sumHeader.font = headerFont;
    sumHeader.alignment = headerAlign;
    sumHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    sumHeader.border = borderStrong;

    ws.getRow(3).height = 32;
    ws.getRow(2).height = 16;
    ws.getRow(1).height = 22;

    // Body rows
    rows.forEach((r, idx) => {
      const xlRow = 4 + idx;
      const isAlt = idx % 2 === 1;
      const baseRowFill = isAlt ? 'FFE2E8F0' : 'FFF1F5F9';

      // №
      const numCell = ws.getCell(xlRow, 1);
      numCell.value = idx + 1;
      numCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF94A3B8' } };
      numCell.alignment = { vertical: 'middle', horizontal: 'center' };
      numCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseRowFill } };
      numCell.border = border;

      // Employee
      const empCell = ws.getCell(xlRow, 2);
      empCell.value = r.emp.name;
      empCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      empCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      empCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseRowFill } };
      empCell.border = border;

      // Department · position
      const depCell = ws.getCell(xlRow, 3);
      depCell.value = [r.emp.department, r.emp.position].filter(Boolean).join(' · ');
      depCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };
      depCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false };
      depCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseRowFill } };
      depCell.border = border;

      // Day cells
      visibleDays.forEach((d, i) => {
        const cell = ws.getCell(xlRow, 4 + i);
        const covering = r.leaves
          .filter((l) => l.startDate <= d.ds && l.endDate >= d.ds && l.status !== 'rejected')
          .sort((a) => (a.status === 'pending' ? 1 : -1));
        const cov = covering[0];
        const isHoliday = !!d.holiday;
        const isTodayCol = d.ds === format(now, 'yyyy-MM-dd');
        let bg: string;
        if (isHoliday) bg = 'FFFEF3C7';
        else if (isTodayCol) bg = 'FFE0E7FF';
        else if (d.isWeekend) bg = 'FFFEE2E2';
        else bg = baseRowFill;
        if (cov) {
          const fg = pastelFg(cov.type);
          cell.value =
            cov.status === 'pending' ? `${prettifyType(cov.type)} ?` : prettifyType(cov.type);
          bg = pastelBg(cov.type);
          cell.font = {
            name: 'Calibri',
            size: 9,
            bold: true,
            color: { argb: hexToArgb(cov.status === 'pending' ? mix(fg, '#FFFFFF', 0.35) : fg) },
          };
        } else {
          cell.value = '';
          cell.font = { name: 'Calibri', size: 9, color: { argb: 'FFCBD5E1' } };
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(bg) } };
        cell.border = border;
        if (isTodayCol) {
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF4F46E5' } },
            left: { style: 'medium', color: { argb: 'FF4F46E5' } },
            bottom: { style: 'medium', color: { argb: 'FF4F46E5' } },
            right: { style: 'medium', color: { argb: 'FF4F46E5' } },
          };
        }
      });

      // Total days (approved)
      const totalCell = ws.getCell(xlRow, totalCol);
      const totalDays = r.approvedDays + r.pendingDays;
      totalCell.value = totalDays;
      totalCell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: totalDays > 0 ? 'FF0F172A' : 'FFCBD5E1' },
      };
      totalCell.alignment = { vertical: 'middle', horizontal: 'center' };
      totalCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: totalDays > 0 ? 'FFEFF6FF' : baseRowFill },
      };
      totalCell.border = border;
      totalCell.numFmt = '0';

      // Per-type breakdown
      typeCols.forEach((ty, i) => {
        const cell = ws.getCell(xlRow, typeStartCol + i);
        const v = r.byType.get(ty) ?? 0;
        cell.value = v || '';
        const fg = pastelFg(ty);
        const bg = pastelBg(ty);
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: v > 0,
          color: { argb: v > 0 ? hexToArgb(fg) : 'FFCBD5E1' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: v > 0 ? hexToArgb(bg) : baseRowFill },
        };
        cell.border = border;
        cell.numFmt = '0';
      });

      // Grand total
      const gCell = ws.getCell(xlRow, sumCol);
      gCell.value = totalDays;
      gCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
      gCell.alignment = { vertical: 'middle', horizontal: 'center' };
      gCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: totalDays > 0 ? 'FFDBEAFE' : 'FFF1F5F9' },
      };
      gCell.border = borderStrong;
      gCell.numFmt = '0';

      ws.getRow(xlRow).height = 22;
    });

    // Daily absence totals footer
    const footerRow = 4 + rows.length;
    const fLabel = ws.getCell(footerRow, 2);
    fLabel.value = t('timesheet.absentPerDayTotal');
    fLabel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    fLabel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    fLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    fLabel.border = borderStrong;
    ws.mergeCells(footerRow, 2, footerRow, 3);
    visibleDays.forEach((d, i) => {
      const col = 4 + i;
      const dayCount = rows.filter((r) =>
        r.leaves.some((l) => l.startDate <= d.ds && l.endDate >= d.ds && l.status !== 'rejected'),
      ).length;
      const cell = ws.getCell(footerRow, col);
      cell.value = dayCount || '';
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: dayCount ? 'FF0F172A' : 'FFCBD5E1' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: dayCount
            ? 'FFEFF6FF'
            : d.holiday
              ? 'FFFEF3C7'
              : d.isWeekend
                ? 'FFFEE2E2'
                : 'FFFAFBFC',
        },
      };
      cell.border = border;
      cell.numFmt = '0';
    });
    const grandTotal = rows.reduce((acc, r) => acc + r.approvedDays + r.pendingDays, 0);
    const fTotal = ws.getCell(footerRow, totalCol);
    fTotal.value = grandTotal;
    fTotal.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    fTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    fTotal.alignment = { vertical: 'middle', horizontal: 'center' };
    fTotal.border = borderStrong;
    fTotal.numFmt = '0';
    typeCols.forEach((ty, i) => {
      const col = typeStartCol + i;
      const v = rows.reduce((acc, r) => acc + (r.byType.get(ty) ?? 0), 0);
      const cell = ws.getCell(footerRow, col);
      cell.value = v || '';
      const fg = pastelFg(ty);
      const bg = pastelBg(ty);
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: v ? hexToArgb(fg) : 'FFCBD5E1' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: v ? hexToArgb(bg) : 'FFF8FAFC' },
      };
      cell.border = border;
      cell.numFmt = '0';
    });
    const fSum = ws.getCell(footerRow, sumCol);
    fSum.value = grandTotal;
    fSum.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    fSum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    fSum.alignment = { vertical: 'middle', horizontal: 'center' };
    fSum.border = borderStrong;
    fSum.numFmt = '0';
    ws.getRow(footerRow).height = 24;

    // Print setup for grid
    ws.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    };
    ws.headerFooter.oddHeader = `&L&\"Calibri,Bold\"&14${t('timesheet.title', { defaultValue: 'Табель отсутствий' })}&R&\"Calibri,Italic\"&10${format(parseISO(viewStart), 'dd.MM.yyyy')} — ${format(parseISO(viewEnd), 'dd.MM.yyyy')}`;
    ws.headerFooter.oddFooter = `&C${t('timesheet.footerPage')}&R${t('timesheet.footerGeneratedAt', { date: format(now, 'dd.MM.yyyy HH:mm') })}`;

    // ════════════════════════════════════════════════════════════════════════
    // Sheet 3: «Детально» — flat per-leave list with all metadata
    // ════════════════════════════════════════════════════════════════════════
    const detail = wb.addWorksheet(t('timesheet.sheetDetail'), {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    const dHeaders = [
      t('timesheet.rowNumber'),
      t('timesheet.employee'),
      t('timesheet.department'),
      t('timesheet.position'),
      t('timesheet.timeOffType'),
      t('leave.status'),
      t('leave.startDate'),
      t('leave.endDate'),
      t('leave.days'),
      t('leave.reason'),
      t('timesheet.approver'),
      t('timesheet.reviewComment'),
    ];
    dHeaders.forEach((h, i) => {
      const cell = detail.getCell(1, i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      cell.border = borderStrong;
    });
    detail.getRow(1).height = 30;
    const colWidths = [5, 26, 18, 20, 16, 12, 12, 12, 8, 30, 20, 30];
    colWidths.forEach((w, i) => {
      detail.getColumn(i + 1).width = w;
    });

    // Flatten leaves
    const flat: Array<{
      row: number;
      empName: string;
      empDept: string;
      empPos: string;
      leave: (typeof rows)[number]['leaves'][number];
    }> = [];
    rows.forEach((r) => {
      r.leaves.forEach((l) =>
        flat.push({
          row: 0,
          empName: r.emp.name,
          empDept: r.emp.department ?? '',
          empPos: r.emp.position ?? '',
          leave: l,
        }),
      );
    });
    flat.sort(
      (a, b) =>
        a.empName.localeCompare(b.empName) || a.leave.startDate.localeCompare(b.leave.startDate),
    );
    const meta = (status: string): { label: string; color: string } => {
      const sb = STATUS_BADGE[status];
      if (status === 'approved') return { label: t('leaveStatus.approved'), color: '#10B981' };
      if (status === 'pending') return { label: t('leaveStatus.pending'), color: '#F59E0B' };
      if (status === 'rejected') return { label: t('leaveStatus.rejected'), color: '#EF4444' };
      return { label: sb?.labelKey ?? status, color: '#64748B' };
    };
    flat.forEach((f, i) => {
      const xlRow = i + 2;
      const isAlt = i % 2 === 1;
      const l = f.leave;
      const days = overlapDays(l.startDate, l.endDate, viewStart, viewEnd);
      const tc = typeColor(l.type);
      const st = meta(l.status);
      const fill = {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: isAlt ? 'FFF1F5F9' : 'FFFAFBFC' },
      };

      const cells: Array<{ v: unknown; opts: Record<string, unknown> }> = [
        {
          v: i + 1,
          opts: {
            numFmt: '0',
            align: { vertical: 'middle', horizontal: 'center' },
            font: { name: 'Calibri', size: 10, color: { argb: 'FF94A3B8' } },
          },
        },
        {
          v: f.empName,
          opts: {
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle' },
          },
        },
        {
          v: f.empDept,
          opts: {
            font: { name: 'Calibri', size: 10, color: { argb: 'FF475569' } },
            align: { vertical: 'middle' },
          },
        },
        {
          v: f.empPos,
          opts: {
            font: { name: 'Calibri', size: 10, color: { argb: 'FF475569' } },
            align: { vertical: 'middle' },
          },
        },
        {
          v: typeLabel(l.type),
          opts: {
            font: {
              name: 'Calibri',
              size: 10,
              bold: true,
              color: { argb: hexToArgb(pastelFg(l.type)) },
            },
            align: { vertical: 'middle', horizontal: 'center' },
            fill: {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: hexToArgb(pastelBg(l.type)) },
            },
          },
        },
        {
          v: st.label,
          opts: {
            font: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
            align: { vertical: 'middle', horizontal: 'center' },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(st.color) } },
          },
        },
        {
          v: l.startDate,
          opts: {
            numFmt: 'dd.mm.yyyy',
            font: { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: l.endDate,
          opts: {
            numFmt: 'dd.mm.yyyy',
            font: { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: days,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: l.reason ?? '',
          opts: {
            font: { name: 'Calibri', size: 10, color: { argb: 'FF334155' } },
            align: { vertical: 'middle', wrapText: true },
          },
        },
        {
          v: l.reviewerName ?? '',
          opts: {
            font: { name: 'Calibri', size: 10, color: { argb: 'FF334155' } },
            align: { vertical: 'middle' },
          },
        },
        {
          v: l.reviewComment ?? '',
          opts: {
            font: { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } },
            align: { vertical: 'middle', wrapText: true },
          },
        },
      ];
      cells.forEach((c, j) => {
        const cell = detail.getCell(xlRow, j + 1);
        cell.value = c.v as ExcelJS.CellValue;
        const opts = c.opts as { font?: unknown; align?: unknown; fill?: unknown; numFmt?: string };
        if (opts.font) cell.font = opts.font as never;
        if (opts.align) cell.alignment = opts.align as never;
        if (opts.fill) cell.fill = opts.fill as never;
        if (opts.numFmt) cell.numFmt = opts.numFmt;
        cell.border = border;
        if (j === 0 || j === 8)
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isAlt ? 'FFF1F5F9' : 'FFEFF6FF' },
          };
        if (j !== 4 && j !== 5 && j !== 0 && j !== 8) cell.fill = fill;
      });
      detail.getRow(xlRow).height = 20;
    });

    if (flat.length === 0) {
      const r = detail.getRow(2);
      r.height = 24;
      detail.mergeCells(2, 1, 2, dHeaders.length);
      const c = detail.getCell(2, 1);
      c.value = t('timesheet.noLeavesInPeriod');
      c.font = { name: 'Calibri', size: 12, italic: true, color: { argb: 'FF94A3B8' } };
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    // Apply filter to header row
    detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: dHeaders.length } };
    detail.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    };
    detail.headerFooter.oddHeader = `&L&\"Calibri,Bold\"&12${t('timesheet.title', { defaultValue: 'Табель отсутствий' })}${t('timesheet.detailSuffix')}&R&\"Calibri,Italic\"&10${format(parseISO(viewStart), 'dd.MM.yyyy')} — ${format(parseISO(viewEnd), 'dd.MM.yyyy')}`;
    detail.headerFooter.oddFooter = `&C${t('timesheet.footerPage')}`;

    // ════════════════════════════════════════════════════════════════════════
    // Sheet 4: «По типам» — aggregated stats per leave type
    // ════════════════════════════════════════════════════════════════════════
    const byType = wb.addWorksheet(t('timesheet.sheetByTypes'), {
      views: [{ showGridLines: false }],
    });
    byType.getColumn(1).width = 4;
    byType.getColumn(2).width = 28;
    byType.getColumn(3).width = 14;
    byType.getColumn(4).width = 16;
    byType.getColumn(5).width = 16;
    byType.getColumn(6).width = 16;
    byType.getColumn(7).width = 16;
    byType.mergeCells('B2:G2');
    const byTypeTitle = byType.getCell('B2');
    byTypeTitle.value = t('timesheet.byTypeSheetTitle');
    byTypeTitle.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    byTypeTitle.alignment = { vertical: 'middle' };
    byType.getRow(2).height = 28;

    const sHeaders = [
      t('timesheet.rowNumber'),
      t('timesheet.typesLabel'),
      t('timesheet.colorLabel'),
      t('timesheet.daysApprovedCol'),
      t('timesheet.daysPendingCol'),
      t('timesheet.kpiEmployees'),
      t('timesheet.pctOfTotal'),
    ];
    sHeaders.forEach((h, i) => {
      const cell = byType.getCell(4, i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      cell.border = borderStrong;
    });
    byType.getRow(4).height = 24;

    const grandTotalForPct = Math.max(
      1,
      typeCols.reduce((acc, ty) => acc + rows.reduce((a, r) => a + (r.byType.get(ty) ?? 0), 0), 0),
    );
    typeCols.forEach((ty, i) => {
      const xlRow = 5 + i;
      const totalDaysForType = rows.reduce((a, r) => a + (r.byType.get(ty) ?? 0), 0);
      const empCount = rows.filter((r) => (r.byType.get(ty) ?? 0) > 0).length;
      const approvedOnly = rows.reduce((acc, r) => {
        const inRange = r.leaves.filter(
          (l) =>
            l.type === ty &&
            l.status === 'approved' &&
            !(l.endDate < viewStart || l.startDate > viewEnd),
        );
        return (
          acc +
          inRange.reduce((s, l) => s + overlapDays(l.startDate, l.endDate, viewStart, viewEnd), 0)
        );
      }, 0);
      const pendingOnly = rows.reduce((acc, r) => {
        const inRange = r.leaves.filter(
          (l) =>
            l.type === ty &&
            l.status === 'pending' &&
            !(l.endDate < viewStart || l.startDate > viewEnd),
        );
        return (
          acc +
          inRange.reduce((s, l) => s + overlapDays(l.startDate, l.endDate, viewStart, viewEnd), 0)
        );
      }, 0);
      const tc = typeColor(ty);
      const isAlt = i % 2 === 1;
      const rowFill = isAlt ? 'FFF1F5F9' : 'FFFAFBFC';

      const cells: Array<{ v: unknown; opts?: Record<string, unknown> }> = [
        { v: i + 1, opts: { numFmt: '0', align: { vertical: 'middle', horizontal: 'center' } } },
        {
          v: typeLabel(ty),
          opts: {
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle' },
          },
        },
        { v: '' },
        {
          v: approvedOnly,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF047857' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: pendingOnly,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFB45309' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: empCount,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: totalDaysForType / grandTotalForPct,
          opts: {
            numFmt: '0.0%',
            font: { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
      ];
      cells.forEach((c, j) => {
        const cell = byType.getCell(xlRow, j + 1);
        cell.value = c.v as ExcelJS.CellValue;
        if (c.opts?.font) cell.font = c.opts.font as Partial<ExcelJS.Font>;
        if (c.opts?.align) cell.alignment = c.opts.align as Partial<ExcelJS.Alignment>;
        if (c.opts?.numFmt) cell.numFmt = c.opts.numFmt as string;
        if (j === 2) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: hexToArgb(pastelBg(ty)) },
          };
          cell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: hexToArgb(pastelFg(ty)) },
          };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
        }
        cell.border = border;
      });
      byType.getRow(xlRow).height = 22;
    });

    // Totals row
    const totalRow = 5 + typeCols.length;
    const tCells: Array<[number, unknown, string?]> = [
      [1, ''],
      [2, t('timesheet.totalLabel')],
      [3, ''],
      [4, rows.reduce((a, r) => a + r.approvedDays, 0), '0'],
      [5, rows.reduce((a, r) => a + r.pendingDays, 0), '0'],
      [6, rows.length, '0'],
      [7, 1, '0.0%'],
    ];
    tCells.forEach(([col, val, fmt]) => {
      const cell = byType.getCell(totalRow, col);
      cell.value = val as ExcelJS.CellValue;
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
      cell.alignment =
        col === 1 || col === 3
          ? { vertical: 'middle', horizontal: 'center' }
          : { vertical: 'middle', horizontal: col >= 4 ? 'center' : 'left', indent: 1 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      cell.border = borderStrong;
      if (fmt) cell.numFmt = fmt;
    });
    byType.getRow(totalRow).height = 26;

    // Chart: per-type bar
    if (typeCols.length > 0) {
      const chartRow = totalRow + 3;
      byType.mergeCells(chartRow, 1, chartRow, 7);
      const cTitle = byType.getCell(chartRow, 1);
      cTitle.value = t('timesheet.chartByTypeTitle');
      cTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F172A' } };
      cTitle.alignment = { vertical: 'middle' };
      byType.getRow(chartRow).height = 24;

      const dataStartRow = chartRow + 1;
      // write helper columns
      typeCols.forEach((ty, i) => {
        const cell = byType.getCell(dataStartRow + i, 2);
        cell.value = typeLabel(ty);
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } };
      });
      // Visual bar representation (inline data bars) for each type
      const maxDays = Math.max(
        1,
        ...typeCols.map((ty) => rows.reduce((a, r) => a + (r.byType.get(ty) ?? 0), 0)),
      );
      const barMax = 30;
      typeCols.forEach((ty, i) => {
        const xlRow = dataStartRow + i;
        const days = rows.reduce((a, r) => a + (r.byType.get(ty) ?? 0), 0);
        const filled = Math.max(0, Math.round((days / maxDays) * barMax));
        const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barMax - filled));
        const cell = byType.getCell(xlRow, 3);
        cell.value = `${bar} ${days}`;
        const tc2 = typeColor(ty);
        cell.font = { name: 'Consolas', size: 10, color: { argb: hexToArgb(pastelFg(ty)) } };
        cell.alignment = { vertical: 'middle' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: hexToArgb(pastelBg(ty)) },
        };
        cell.border = border;
      });
    }

    byType.pageSetup = {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    };
    byType.headerFooter.oddHeader = `&L&\"Calibri,Bold\"&12Сводная статистика`;
    byType.headerFooter.oddFooter = `&CСтр. &P из &N`;

    // ════════════════════════════════════════════════════════════════════════
    // Sheet 5: «По отделам» — pivot by department
    // ════════════════════════════════════════════════════════════════════════
    const byDept = wb.addWorksheet(t('timesheet.sheetByDepts'), {
      views: [{ showGridLines: false }],
    });
    byDept.getColumn(1).width = 4;
    byDept.getColumn(2).width = 30;
    byDept.getColumn(3).width = 14;
    byDept.getColumn(4).width = 16;
    byDept.getColumn(5).width = 16;
    byDept.getColumn(6).width = 16;
    byDept.getColumn(7).width = 16;
    byDept.mergeCells('B2:G2');
    const deptTitle = byDept.getCell('B2');
    deptTitle.value = t('timesheet.byDeptSheetTitle');
    deptTitle.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    deptTitle.alignment = { vertical: 'middle' };
    byDept.getRow(2).height = 28;

    const dHeaders2 = [
      t('timesheet.rowNumber'),
      t('timesheet.department'),
      t('timesheet.kpiEmployees'),
      t('timesheet.daysApprovedCol'),
      t('timesheet.daysPendingCol'),
      t('timesheet.totalDays'),
      t('timesheet.avgPerPerson'),
    ];
    dHeaders2.forEach((h, i) => {
      const cell = byDept.getCell(4, i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      cell.border = borderStrong;
    });
    byDept.getRow(4).height = 24;

    const deptMap = new Map<
      string,
      { count: Set<string>; approved: number; pending: number; total: number }
    >();
    rows.forEach((r) => {
      const d = r.emp.department || t('timesheet.noDepartment');
      if (!deptMap.has(d)) deptMap.set(d, { count: new Set(), approved: 0, pending: 0, total: 0 });
      const entry = deptMap.get(d)!;
      entry.count.add(r.emp._id);
      entry.approved += r.approvedDays;
      entry.pending += r.pendingDays;
      entry.total += r.approvedDays + r.pendingDays;
    });
    const deptEntries = [...deptMap.entries()].sort((a, b) => b[1].total - a[1].total);
    deptEntries.forEach(([name, data], i) => {
      const xlRow = 5 + i;
      const isAlt = i % 2 === 1;
      const rowFill = isAlt ? 'FFF1F5F9' : 'FFFAFBFC';
      const avg = data.count.size > 0 ? data.total / data.count.size : 0;
      const cells: Array<{ v: unknown; opts?: Record<string, unknown> }> = [
        { v: i + 1, opts: { numFmt: '0', align: { vertical: 'middle', horizontal: 'center' } } },
        {
          v: name,
          opts: {
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle' },
          },
        },
        {
          v: data.count.size,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: data.approved,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF047857' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: data.pending,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFB45309' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
        {
          v: data.total,
          opts: {
            numFmt: '0',
            font: { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } },
          },
        },
        {
          v: avg,
          opts: {
            numFmt: '0.00',
            font: { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } },
            align: { vertical: 'middle', horizontal: 'center' },
          },
        },
      ];
      cells.forEach((c, j) => {
        const cell = byDept.getCell(xlRow, j + 1);
        cell.value = c.v as ExcelJS.CellValue;
        if (c.opts?.font) cell.font = c.opts.font as Partial<ExcelJS.Font>;
        if (c.opts?.align) cell.alignment = c.opts.align as Partial<ExcelJS.Alignment>;
        if (c.opts?.numFmt) cell.numFmt = c.opts.numFmt as string;
        if (!c.opts?.fill)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
        cell.border = border;
      });
      byDept.getRow(xlRow).height = 22;
    });

    const deptTotalRow = 5 + deptEntries.length;
    const tCells2: Array<[number, unknown, string?]> = [
      [1, ''],
      [2, t('timesheet.totalLabel')],
      [3, rows.length, '0'],
      [4, rows.reduce((a, r) => a + r.approvedDays, 0), '0'],
      [5, rows.reduce((a, r) => a + r.pendingDays, 0), '0'],
      [6, rows.reduce((a, r) => a + r.approvedDays + r.pendingDays, 0), '0'],
      [
        7,
        rows.length > 0
          ? rows.reduce((a, r) => a + r.approvedDays + r.pendingDays, 0) / rows.length
          : 0,
        '0.00',
      ],
    ];
    tCells2.forEach(([col, val, fmt]) => {
      const cell = byDept.getCell(deptTotalRow, col);
      cell.value = val as ExcelJS.CellValue;
      cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col === 2 ? 'left' : 'center',
        indent: col === 2 ? 1 : 0,
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      cell.border = borderStrong;
      if (fmt) cell.numFmt = fmt;
    });
    byDept.getRow(deptTotalRow).height = 26;

    byDept.pageSetup = {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    };
    byDept.headerFooter.oddHeader = `&L&\"Calibri,Bold\"&12По отделам`;
    byDept.headerFooter.oddFooter = `&CСтр. &P из &N`;

    // ════════════════════════════════════════════════════════════════════════
    // Download
    // ════════════════════════════════════════════════════════════════════════
    const rawBuf = await wb.xlsx.writeBuffer();
    // Post-process: inject a light Office theme so Excel doesn't fall back to a
    // dark theme in dark mode (which inverts light cell fills to dark).
    const JSZipMod = await import('jszip');
    const zip = await new JSZipMod.default().loadAsync(rawBuf);
    const lightTheme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">
<a:themeElements>
<a:clrScheme name="Office">
<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
<a:dk2><a:srgbClr val="44546A"/></a:dk2>
<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
<a:accent1><a:srgbClr val="4472C4"/></a:accent1>
<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
<a:accent4><a:srgbClr val="FFC000"/></a:accent4>
<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
<a:accent6><a:srgbClr val="70AD47"/></a:accent6>
<a:hlink><a:srgbClr val="0563C1"/></a:hlink>
<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
</a:clrScheme>
<a:fontScheme name="Office">
<a:majorFont>
<a:latin typeface="Calibri Light" panose="020F0302020204030204"/>
<a:ea typeface=""/>
<a:cs typeface=""/>
<a:font script="Cyrillic" typeface="Calibri Light" panose="020F0302020204030204"/>
</a:majorFont>
<a:minorFont>
<a:latin typeface="Calibri" panose="020F0502020204030204"/>
<a:ea typeface=""/>
<a:cs typeface=""/>
<a:font script="Cyrillic" typeface="Calibri" panose="020F0502020204030204"/>
</a:minorFont>
</a:fontScheme>
<a:fmtScheme name="Office">
<a:fillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:fillStyleLst>
<a:lnStyleLst>
<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
</a:lnStyleLst>
<a:effectStyleLst>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
<a:effectStyle><a:effectLst/></a:effectStyle>
</a:effectStyleLst>
<a:bgFillStyleLst>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
</a:bgFillStyleLst>
</a:fmtScheme>
</a:themeElements>
</a:theme>`;
    const themePath = 'xl/theme/theme1.xml';
    if (zip.files[themePath]) {
      zip.file(themePath, lightTheme);
    }
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timesheet_${viewStart}_${viewEnd}_${format(now, 'HHmmss')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    rows,
    visibleDays,
    viewStart,
    viewEnd,
    t,
    typeLabel,
    typeColor,
    search,
    statusSet,
    typeSet,
    deptFilter,
    posFilter,
    levelFilter,
    empTypeFilter,
    onlyWithLeave,
    overlapDays,
    prettifyType,
  ]);

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

              <Button size="sm" variant="outline" onClick={exportExcel} className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" />
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
