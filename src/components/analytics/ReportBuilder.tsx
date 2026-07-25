'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f43f5e',
  '#84cc16',
  '#14b8a6',
  '#d946ef',
];

const getDefaultWidget = (): ReportWidget => ({
  id: `widget-${Date.now()}`,
  type: 'bar' as const,
  title: 'New Report',
  metric: 'employees' as const,
  period: 'monthly' as const,
  groupBy: 'department' as const,
  color: COLORS[0] as string,
});

export default function ReportBuilder() {
  const { t } = useTranslation();
  const [widgets, setWidgets] = useState<ReportWidget[]>([getDefaultWidget()]);
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [reportName, setReportName] = useState('Untitled Report');
  const [autoRefresh, setAutoRefresh] = useState(true);

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
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {t('common.exportCSV', 'Export')}
          </Button>
          <Button variant="default" size="sm" className="gap-1.5">
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
        <select className="text-xs bg-transparent border-none text-(--text-muted) outline-none cursor-pointer">
          <option>{t('reportBuilder.last7Days', 'Last 7 days')}</option>
          <option>{t('reportBuilder.last30Days', 'Last 30 days')}</option>
          <option>{t('reportBuilder.lastQuarter', 'Last quarter')}</option>
          <option>{t('reportBuilder.thisYear', 'This year')}</option>
          <option>{t('reportBuilder.customRange', 'Custom range')}</option>
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
                        updateWidget(selectedWidget, { period: e.target.value as any })
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
                      updateWidget(selectedWidget, { groupBy: e.target.value as any })
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
                        {widget.type} · {widget.period}
                      </Badge>
                    </div>
                    {/* Mock chart preview */}
                    <div className="h-48 rounded-xl bg-(--background-subtle) border border-(--border) flex items-center justify-center">
                      <div className="text-center">
                        {widget.type === 'bar' && (
                          <BarChart3 className="w-10 h-10 mx-auto mb-2 text-(--text-muted)" />
                        )}
                        {widget.type === 'line' && (
                          <TrendingUp className="w-10 h-10 mx-auto mb-2 text-(--text-muted)" />
                        )}
                        {widget.type === 'pie' && (
                          <PieChart className="w-10 h-10 mx-auto mb-2 text-(--text-muted)" />
                        )}
                        <p className="text-sm text-(--text-muted)">
                          {t(
                            'reportBuilder.previewPlaceholder',
                            'Chart preview — connect data source',
                          )}
                        </p>
                        <Badge variant="outline" className="mt-2 text-[10px]">
                          {widget.metric} by {widget.groupBy}
                        </Badge>
                      </div>
                    </div>
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
