'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import { CHART_PALETTE_LIGHT } from '@/lib/chart-theme';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Table,
  Download,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Eye,
  Calendar,
  Users,
  FileText,
  Activity,
  Layout,
  Settings2,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import type { Id } from '@/convex/_generated/dataModel';
import { ReportWidgetChart } from '@/components/analytics/ReportWidgetChart';
import { fetchReportSeries, downloadReportCSV } from '@/components/analytics/reportExport';

// Time-window presets (in days). `undefined` ⇒ all-time.
const RANGE_OPTIONS: { value: string; days?: number }[] = [
  { value: 'last7', days: 7 },
  { value: 'last30', days: 30 },
  { value: 'lastQuarter', days: 90 },
  { value: 'thisYear', days: 365 },
  { value: 'all' },
];

// ── Types ──
type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'table' | 'metric';
type MetricField =
  | 'employees'
  | 'leaves'
  | 'attendance'
  | 'tasks'
  | 'payroll'
  | 'performance'
  | 'recruitment';

interface ReportWidget {
  id: string;
  type: ChartType;
  title: string;
  metric: MetricField;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  groupBy: 'department' | 'team' | 'role' | 'location' | 'none';
  color: string;
}

const CHART_TYPES: { type: ChartType; icon: typeof BarChart3; label: string; gradient: string }[] =
  [
    { type: 'bar', icon: BarChart3, label: 'Bar Chart', gradient: 'from-blue-500 to-blue-600' },
    {
      type: 'line',
      icon: TrendingUp,
      label: 'Line Chart',
      gradient: 'from-emerald-500 to-teal-600',
    },
    { type: 'pie', icon: PieChart, label: 'Pie Chart', gradient: 'from-violet-500 to-purple-600' },
    { type: 'area', icon: Activity, label: 'Area Chart', gradient: 'from-cyan-500 to-blue-600' },
    { type: 'table', icon: Table, label: 'Data Table', gradient: 'from-slate-500 to-slate-600' },
    { type: 'metric', icon: Layout, label: 'Metric Card', gradient: 'from-rose-500 to-pink-600' },
  ];

const METRIC_FIELDS: { value: MetricField; icon: typeof Users; label: string }[] = [
  { value: 'employees', icon: Users, label: 'Employees' },
  { value: 'leaves', icon: Calendar, label: 'Leave & Absence' },
  { value: 'attendance', icon: Activity, label: 'Attendance' },
  { value: 'tasks', icon: FileText, label: 'Tasks & OKRs' },
  { value: 'payroll', icon: FileText, label: 'Payroll' },
  { value: 'performance', icon: TrendingUp, label: 'Performance' },
  { value: 'recruitment', icon: Users, label: 'Recruitment' },
];

/** Swatches offered in the widget colour picker. Mirrors the chart palette so a
 *  user-picked colour always belongs to the same family as the auto-assigned
 *  series colours. */
const COLORS = [...CHART_PALETTE_LIGHT, '#84cc16', '#14b8a6'];

const getDefaultWidget = (): ReportWidget => ({
  id: `widget-${Date.now()}`,
  type: 'bar' as const,
  title: 'New Report',
  metric: 'employees' as const,
  period: 'monthly' as const,
  groupBy: 'department' as const,
  color: COLORS[0] as string,
});

const STORAGE_KEY = 'hr:report-builder:v1';

interface SavedReport {
  reportName: string;
  rangeValue: string;
  widgets: ReportWidget[];
}

export default function ReportBuilder() {
  const { t } = useTranslation();
  const convex = useConvex();
  const orgId = useSelectedOrganization() as Id<'organizations'> | null;

  const [widgets, setWidgets] = useState<ReportWidget[]>([getDefaultWidget()]);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [reportName, setReportName] = useState('Untitled Report');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [rangeValue, setRangeValue] = useState('last30');
  const [exporting, setExporting] = useState(false);

  // Restore a previously saved report from localStorage (once, on mount).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedReport;
      if (saved.widgets?.length) {
        setWidgets(saved.widgets);
        setReportName(saved.reportName ?? 'Untitled Report');
        setRangeValue(saved.rangeValue ?? 'last30');
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Resolve the active time-window (in days) from the selected preset.
  const rangeDays = useMemo(
    () => RANGE_OPTIONS.find((r) => r.value === rangeValue)?.days,
    [rangeValue],
  );

  const addWidget = () => {
    setWidgets((prev) => [...prev, getDefaultWidget()]);
  };

  const removeWidget = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    if (selectedWidget === id) setSelectedWidget(null);
  };

  const updateWidget = (id: string, updates: Partial<ReportWidget>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates } : w)));
  };

  const handleSave = () => {
    if (typeof window === 'undefined') return;
    const payload: SavedReport = { reportName, rangeValue, widgets };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    toast.success(t('reportBuilder.saved', 'Report saved'));
  };

  const handleExport = async () => {
    if (widgets.length === 0) return;
    setExporting(true);
    try {
      const blocks = await Promise.all(
        widgets.map(async (w) => ({
          title: w.title,
          metric: w.metric,
          groupBy: w.groupBy,
          result: await fetchReportSeries(convex, {
            ...(orgId ? { organizationId: orgId } : {}),
            metric: w.metric,
            groupBy: w.groupBy,
            ...(rangeDays ? { rangeDays } : {}),
          }),
        })),
      );
      downloadReportCSV(reportName, blocks);
      toast.success(t('reportBuilder.exported', 'Report exported'));
    } catch {
      toast.error(t('reportBuilder.exportFailed', 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const totalWidgets = widgets.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <BarChart3 className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              className="text-xl font-bold text-(--text-primary) bg-transparent border-none outline-none focus:border-b focus:border-blue-500/50"
              placeholder="Report Name"
            />
            <p className="text-sm text-(--text-muted)">
              {totalWidgets} {t('reportBuilder.widgets', 'widgets')} ·{' '}
              {t('reportBuilder.autoRefresh', 'Auto-refresh')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className="gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            {previewMode ? t('common.edit', 'Edit') : t('reportBuilder.preview', 'Preview')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || totalWidgets === 0}
            className="gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? t('common.exporting', 'Exporting…') : t('common.exportCSV', 'Export')}
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {t('common.save', 'Save')}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-(--card) border border-(--border)">
        <Button variant="ghost" size="sm" onClick={addWidget} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          {t('reportBuilder.addWidget', 'Add Widget')}
        </Button>
        <div className="w-px h-6 bg-(--border)" />
        <div className="flex items-center gap-1 text-xs text-(--text-muted)">
          <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'text-emerald-500' : ''}`} />
          {t('reportBuilder.autoRefresh', 'Auto-refresh')}
          <Switch
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
            className="ml-1 scale-75"
          />
        </div>
        <div className="w-px h-6 bg-(--border)" />
        <select
          value={rangeValue}
          onChange={(e) => setRangeValue(e.target.value)}
          className="text-xs bg-transparent border-none text-(--text-muted) outline-none cursor-pointer"
        >
          <option value="last7">{t('reportBuilder.last7Days', 'Last 7 days')}</option>
          <option value="last30">{t('reportBuilder.last30Days', 'Last 30 days')}</option>
          <option value="lastQuarter">{t('reportBuilder.lastQuarter', 'Last quarter')}</option>
          <option value="thisYear">{t('reportBuilder.thisYear', 'This year')}</option>
          <option value="all">{t('reportBuilder.allTime', 'All time')}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Widget selector sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
            <Layout className="w-4 h-4" />
            {t('reportBuilder.widgets', 'Widgets')}
          </h3>
          {widgets.map((widget, i) => (
            <div
              key={widget.id}
              onClick={() => setSelectedWidget(widget.id)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedWidget === widget.id
                  ? 'border-blue-500/50 bg-blue-500/5 shadow-sm'
                  : 'border-(--border) bg-(--card) hover:border-(--border)/80 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="w-3.5 h-3.5 text-(--text-muted) cursor-grab" />
                  <span className="text-xs text-(--text-muted)">#{i + 1}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWidget(widget.id);
                  }}
                  className="opacity-0 hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
              <p className="text-sm font-medium text-(--text-primary) truncate">{widget.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px]">
                  {widget.type}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {widget.metric}
                </Badge>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addWidget} className="w-full gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            {t('reportBuilder.addWidget', 'Add Widget')}
          </Button>
        </div>

        {/* Main canvas */}
        <div className="lg:col-span-3 space-y-4">
          {selectedWidget && !previewMode ? (
            <Card className="p-5 border border-(--border) bg-(--card)">
              <h3 className="font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-emerald-500" />
                {t('reportBuilder.widgetSettings', 'Widget Settings')}
              </h3>
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="text-sm font-medium text-(--text-primary) block mb-1.5">
                    {t('reportBuilder.widgetTitle', 'Widget Title')}
                  </label>
                  <input
                    value={widgets.find((w) => w.id === selectedWidget)?.title || ''}
                    onChange={(e) => updateWidget(selectedWidget, { title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-(--background) border border-(--border) text-sm text-(--text-primary) outline-none focus:border-blue-500/50"
                  />
                </div>

                {/* Chart type */}
                <div>
                  <label className="text-sm font-medium text-(--text-primary) block mb-1.5">
                    {t('reportBuilder.chartType', 'Chart Type')}
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {CHART_TYPES.map((chart) => {
                      const Icon = chart.icon;
                      const isActive =
                        widgets.find((w) => w.id === selectedWidget)?.type === chart.type;
                      return (
                        <button
                          key={chart.type}
                          onClick={() => updateWidget(selectedWidget, { type: chart.type })}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs transition-all ${
                            isActive
                              ? 'border-blue-500/50 bg-blue-500/5 text-blue-600'
                              : 'border-(--border) bg-(--background) text-(--text-muted) hover:border-(--border)/80'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="truncate max-w-full">{chart.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Metric & Period */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-(--text-primary) block mb-1.5">
                      {t('reportBuilder.metric', 'Metric')}
                    </label>
                    <select
                      value={widgets.find((w) => w.id === selectedWidget)?.metric || 'employees'}
                      onChange={(e) =>
                        updateWidget(selectedWidget, { metric: e.target.value as MetricField })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-(--background) border border-(--border) text-sm text-(--text-primary) outline-none focus:border-blue-500/50"
                    >
                      {METRIC_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-(--text-primary) block mb-1.5">
                      {t('reportBuilder.period', 'Period')}
                    </label>
                    <select
                      value={widgets.find((w) => w.id === selectedWidget)?.period || 'monthly'}
                      onChange={(e) =>
                        updateWidget(selectedWidget, {
                          period: e.target.value as ReportWidget['period'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-(--background) border border-(--border) text-sm text-(--text-primary) outline-none focus:border-blue-500/50"
                    >
                      <option value="daily">{t('reportBuilder.daily', 'Daily')}</option>
                      <option value="weekly">{t('reportBuilder.weekly', 'Weekly')}</option>
                      <option value="monthly">{t('reportBuilder.monthly', 'Monthly')}</option>
                      <option value="quarterly">{t('reportBuilder.quarterly', 'Quarterly')}</option>
                      <option value="yearly">{t('reportBuilder.yearly', 'Yearly')}</option>
                    </select>
                  </div>
                </div>

                {/* Group by */}
                <div>
                  <label className="text-sm font-medium text-(--text-primary) block mb-1.5">
                    {t('reportBuilder.groupBy', 'Group By')}
                  </label>
                  <select
                    value={widgets.find((w) => w.id === selectedWidget)?.groupBy || 'department'}
                    onChange={(e) =>
                      updateWidget(selectedWidget, {
                        groupBy: e.target.value as ReportWidget['groupBy'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-(--background) border border-(--border) text-sm text-(--text-primary) outline-none focus:border-blue-500/50"
                  >
                    <option value="department">
                      {t('reportBuilder.department', 'Department')}
                    </option>
                    <option value="team">{t('reportBuilder.team', 'Team')}</option>
                    <option value="role">{t('reportBuilder.role', 'Role')}</option>
                    <option value="location">{t('reportBuilder.location', 'Location')}</option>
                    <option value="none">{t('reportBuilder.none', 'None')}</option>
                  </select>
                </div>

                {/* Color */}
                <div>
                  <label className="text-sm font-medium text-(--text-primary) block mb-1.5">
                    {t('reportBuilder.accentColor', 'Accent Color')}
                  </label>
                  <div className="flex gap-2">
                    {COLORS.map((color) => {
                      const isActive =
                        widgets.find((w) => w.id === selectedWidget)?.color === color;
                      return (
                        <button
                          key={color}
                          onClick={() => updateWidget(selectedWidget, { color })}
                          className={`w-7 h-7 rounded-lg transition-all ${
                            isActive
                              ? 'ring-2 ring-offset-2 ring-offset-(--background) ring-blue-500 scale-110'
                              : ''
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Live preview of the widget being edited */}
                {(() => {
                  const w = widgets.find((x) => x.id === selectedWidget);
                  if (!w) return null;
                  return (
                    <div className="pt-2">
                      <label className="text-sm font-medium text-(--text-primary) block mb-1.5">
                        {t('reportBuilder.livePreview', 'Live Preview')}
                      </label>
                      <ReportWidgetChart
                        type={w.type}
                        metric={w.metric}
                        groupBy={w.groupBy}
                        color={w.color}
                        height={240}
                        {...(orgId ? { organizationId: orgId } : {})}
                        {...(rangeDays ? { rangeDays } : {})}
                      />
                    </div>
                  );
                })()}
              </div>
            </Card>
          ) : (
            /* Preview mode or empty state */
            <div className="grid grid-cols-1 gap-4">
              {previewMode ? (
                widgets.map((widget) => (
                  <Card key={widget.id} className="p-6 border border-(--border) bg-(--card)">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-(--text-primary)">{widget.title}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {widget.metric} · {widget.groupBy}
                      </Badge>
                    </div>
                    <ReportWidgetChart
                      type={widget.type}
                      metric={widget.metric}
                      groupBy={widget.groupBy}
                      color={widget.color}
                      height={220}
                      {...(orgId ? { organizationId: orgId } : {})}
                      {...(rangeDays ? { rangeDays } : {})}
                    />
                  </Card>
                ))
              ) : (
                <Card className="p-12 border border-(--border) bg-(--card) text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 text-(--text-muted)" />
                  <h3 className="text-lg font-semibold text-(--text-primary) mb-2">
                    {t('reportBuilder.noWidgetSelected', 'No Widget Selected')}
                  </h3>
                  <p className="text-sm text-(--text-muted) mb-4">
                    {t(
                      'reportBuilder.selectWidgetHint',
                      'Select a widget from the sidebar or add a new one',
                    )}
                  </p>
                  <div className="flex justify-center gap-2">
                    {CHART_TYPES.slice(0, 4).map((chart) => {
                      const Icon = chart.icon;
                      return (
                        <Badge key={chart.type} variant="outline" className="gap-1 py-1.5">
                          <Icon className="w-3 h-3" />
                          {chart.label}
                        </Badge>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
