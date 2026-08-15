/**
 * Company Events Management Page
 * Admin interface for managing company events and viewing conflicts
 */

'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/date-format';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calendar,
  Plus,
  AlertCircle,
  Users,
  RefreshCw,
  Edit,
  Trash2,
  Search,
  Clock,
  Bell,
  X,
  Filter,
} from 'lucide-react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import { CreateEventWizard } from '@/components/events/CreateEventWizard';
import { LeaveConflictAlerts } from '@/components/events/LeaveConflictAlerts';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
} from '@/components/ui/sheet';
import { logger } from '@/lib/logger';

type Priority = 'high' | 'medium' | 'low';

interface CompanyEvent {
  _id: Id<'companyEvents'>;
  name: string;
  description?: string;
  startDate: number;
  endDate: number;
  priority?: Priority;
  eventType: string;
  location?: string;
  requiredDepartments?: string[];
  creatorName?: string;
  _creationTime?: number;
  isAllDay?: boolean;
  [key: string]: unknown;
}
const PRIORITY_CONFIG: Record<
  Priority,
  { color: string; bg: string; labelKey: string; icon: string }
> = {
  high: {
    color: 'text-(--danger-text)',
    bg: 'bg-(--danger-quiet) dark:bg-(--danger-quiet)',
    labelKey: 'events.priority.high',
    icon: '🔴',
  },
  medium: {
    color: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet) dark:bg-(--warning-quiet)',
    labelKey: 'events.priority.medium',
    icon: '🟡',
  },
  low: {
    color: 'text-(--brand-text)',
    bg: 'bg-(--brand-quiet) dark:bg-(--brand-quiet)',
    labelKey: 'events.priority.low',
    icon: '🔵',
  },
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  meeting: '🏢',
  conference: '🎤',
  training: '📚',
  holiday: '🎉',
  celebration: '🎊',
  team_building: '🎯',
  deadline: '⏰',
  other: '📌',
};

const formatDate = (ts: number) => {
  const lang = i18n.language || 'en';
  const dfLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const d = new Date(ts);
  return format(d, 'MMM d, yyyy', { locale: dfLocale });
};

const daysUntil = (ts: number) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(ts);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

export default function CompanyEventsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CompanyEvent | null>(null);
  const [activeTab, setActiveTab] = useState<'events' | 'conflicts'>('events');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const { user: authUser } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const isSuperadmin = authUser?.role === 'superadmin'; // cspell:disable-line
  const effectiveOrgId = isSuperadmin && selectedOrgId ? selectedOrgId : authUser?.organizationId; // cspell:disable-line

  const events = useQuery(
    api.events.getCompanyEvents,
    effectiveOrgId ? { organizationId: effectiveOrgId as Id<'organizations'> } : 'skip',
  );
  const pendingLeaves = useQuery(
    api.leaves.getLeavesForOrganization,
    effectiveOrgId ? { organizationId: effectiveOrgId as Id<'organizations'> } : 'skip',
  );

  const updateEvent = useMutation(api.events.updateCompanyEvent);
  const deleteEvent: typeof updateEvent = useMutation(api.events.deleteCompanyEvent);
  const checkConflicts = useMutation(api.events.checkLeaveConflictsManual);

  const isAdmin = authUser?.role === 'admin' || authUser?.role === 'superadmin';

  const stats = useMemo(() => {
    if (!events) return null;
    const now = new Date().setHours(0, 0, 0, 0);
    const upcoming = events.filter((e) => e.startDate >= now);
    const highPriority = upcoming.filter((e) => e.priority === 'high');
    const thisMonth = upcoming.filter((e) => daysUntil(e.startDate) <= 30);
    return {
      total: events.length,
      upcoming: upcoming.length,
      highPriority: highPriority.length,
      thisMonth: thisMonth.length,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    let list = [...events];
    list.sort((a, b) => a.startDate - b.startDate);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.requiredDepartments?.some((d: string) => d.toLowerCase().includes(q)),
      );
    }
    if (filterPriority !== 'all') {
      list = list.filter((e) => e.priority === filterPriority);
    }
    if (filterType !== 'all') {
      list = list.filter((e) => e.eventType === filterType);
    }
    return list;
  }, [events, searchQuery, filterPriority, filterType]);

  const handleCheckConflicts = async () => {
    let totalConflicts = 0;
    const pendingList = (pendingLeaves ?? []).filter((l) => l.status === 'pending');
    for (const leave of pendingList) {
      try {
        const result = await checkConflicts({
          leaveRequestId: leave._id,
          userId: leave.userId,
          startDate: new Date(leave.startDate).getTime(),
          endDate: new Date(leave.endDate).getTime(),
          organizationId: effectiveOrgId as Id<'organizations'>,
        });
        totalConflicts += result.conflictsFound;
      } catch (e) {
        logger.error('Conflict check failed:', e);
      }
    }
    if (totalConflicts > 0) {
      toast.success(
        t('events.conflictsFound', 'Found {{count}} conflict(s)! Check Conflict Alerts tab.', {
          count: totalConflicts,
        }),
        {
          description: t('events.leavesChecked', '{{count}} leave requests checked', {
            count: pendingList.length,
          }),
          duration: 5000,
        },
      );
    } else {
      toast.info(t('events.noConflicts', 'No conflicts found'), {
        description: t('events.allClear', 'All leave requests are clear'),
        duration: 3000,
      });
    }
    setActiveTab('conflicts');
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-(--danger-text)" />
          <h2 className="text-xl font-semibold">{t('common.accessDenied', 'Access Denied')}</h2>
          <p className="text-muted-foreground">
            {t('events.adminOnly', 'Only administrators can manage company events')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t('events.title', 'Company Events')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              {t('events.subtitle', 'Manage events and review leave conflicts')}
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto flex-col sm:flex-row">
            <Button
              variant="outline"
              onClick={handleCheckConflicts}
              className="gap-2 w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">
                {t('events.checkConflicts', 'Check Conflicts')}
              </span>
              <span className="sm:hidden">{t('events.checkConflictsShort', 'Conflicts')}</span>
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center btn-gradient text-white font-medium shadow-md hover:shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">{t('events.createEvent', 'Create Event')}</span>
              <span className="sm:hidden">{t('events.createEventShort', 'Create')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            {
              label: t('events.stats.totalEvents', 'Total Events'),
              value: stats.total,
              icon: Calendar,
              color: 'text-(--brand-text)',
            },
            {
              label: t('events.stats.upcoming', 'Upcoming'),
              value: stats.upcoming,
              icon: Clock,
              color: 'text-(--success-text)',
            },
            {
              label: t('events.stats.highPriority', 'High Priority'),
              value: stats.highPriority,
              icon: AlertCircle,
              color: 'text-(--danger-text)',
            },
            {
              label: t('events.stats.thisMonth', 'This Month'),
              value: stats.thisMonth,
              icon: Bell,
              color: 'text-(--warning-text)',
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn('p-2.5 rounded-xl bg-(--background-subtle)', stat.color)}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="w-full mb-4 gap-2 bg-transparent p-0 h-auto grid grid-cols-2">
        {[
          { key: 'events' as const, label: t('events.eventsTab', 'Events'), icon: Calendar },
          {
            key: 'conflicts' as const,
            label: t('events.conflictAlertsTab', 'Conflicts'),
            icon: AlertCircle,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all',
              activeTab === tab.key
                ? 'bg-(--brand) text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground bg-[var(--background-subtle)]',
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.key === 'conflicts' && pendingLeaves && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
                {(pendingLeaves ?? []).filter((l) => l.status === 'pending').length}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Events Tab Content */}
      {activeTab === 'events' && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('events.searchPlaceholder', 'Search events...')}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-full sm:w-36">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder={t('events.filters.priority', 'Priority')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('events.filters.allPriorities', 'All Priorities')}
                  </SelectItem>
                  <SelectItem value="high">🔴 {t('events.priority.high', 'High')}</SelectItem>
                  <SelectItem value="medium">🟡 {t('events.priority.medium', 'Medium')}</SelectItem>
                  <SelectItem value="low">🔵 {t('events.priority.low', 'Low')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder={t('events.filters.type', 'Type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('events.filters.allTypes', 'All Types')}</SelectItem>
                  {Object.entries(EVENT_TYPE_ICONS).map(([key, icon]) => (
                    <SelectItem key={key} value={key}>
                      {icon} {t(`events.type.${key}`, key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(filterPriority !== 'all' || filterType !== 'all' || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterPriority('all');
                    setFilterType('all');
                  }}
                >
                  {t('events.resetFilters', 'Reset')}
                </Button>
              )}
            </div>
          </div>

          {/* Events List */}
          {!events ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <ShieldLoader size="sm" variant="inline" />
              </CardContent>
            </Card>
          ) : filteredEvents.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">
                  {searchQuery || filterPriority !== 'all' || filterType !== 'all'
                    ? t('events.noResults', 'No events match your filters')
                    : t('events.noEvents', 'No events created yet')}
                </p>
                <Button variant="link" onClick={() => setShowCreateModal(true)}>
                  {t('events.createFirst', 'Create your first event')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredEvents.map((event) => {
                  const days = daysUntil(event.startDate);
                  const priorityCfg =
                    event.priority === 'high'
                      ? PRIORITY_CONFIG.high
                      : event.priority === 'low'
                        ? PRIORITY_CONFIG.low
                        : PRIORITY_CONFIG.medium;
                  const typeIcon = EVENT_TYPE_ICONS[event.eventType] || '📌';
                  const isPast = days < 0;

                  return (
                    <motion.div
                      key={event._id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card
                        className={cn(
                          'group hover:shadow-md transition-all duration-200 cursor-pointer',
                          isPast ? 'opacity-60' : '',
                        )}
                        onClick={() => router.push(`/events/${event._id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            {/* Date Badge */}
                            <div className="shrink-0 w-14 text-center">
                              <div
                                className={cn(
                                  'text-lg font-bold',
                                  isPast ? 'text-muted-foreground' : priorityCfg.color,
                                )}
                              >
                                {new Date(event.startDate).getDate()}
                              </div>
                              <div className="text-[10px] uppercase text-muted-foreground">
                                {formatDateTime(event.startDate, i18n.language, {
                                  month: 'short',
                                })}
                              </div>
                              {!isPast && days <= 3 && (
                                <Badge variant="destructive" className="mt-1 text-[9px] px-1 py-0">
                                  {days === 0 ? t('common.today', 'Today') : `${days}d`}
                                </Badge>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-lg">{typeIcon}</span>
                                <h3 className="font-semibold text-base truncate">{event.name}</h3>
                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                  {priorityCfg.icon} {t(priorityCfg.labelKey)}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                                {event.description || t('events.noDescription', 'No description')}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(event.startDate)}
                                  {t('events.dateRangeSeparator', ' — ')}
                                  {formatDate(event.endDate)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {event.requiredDepartments?.slice(0, 3).join(', ')}
                                  {event.requiredDepartments?.length > 3 &&
                                    ` ${t('events.more', '+ more')}`}
                                </span>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEvent(event);
                                  setShowEditModal(true);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      t('events.confirmDelete', 'Delete event "{{name}}"?', {
                                        name: event.name,
                                      }),
                                    )
                                  ) {
                                    try {
                                      await deleteEvent({ eventId: event._id });
                                      toast.success(t('events.eventDeleted', 'Event deleted'));
                                    } catch (error) {
                                      logger.error(
                                        'Delete failed:',
                                        error instanceof Error ? error.message : 'Unknown error',
                                      );
                                      toast.error(
                                        error instanceof Error
                                          ? error.message
                                          : t('events.deleteFailed', 'Failed to delete event'),
                                      );
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-(--danger-text)" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {/* Conflicts Tab Content */}
      {activeTab === 'conflicts' && (
        <LeaveConflictAlerts organizationId={effectiveOrgId as Id<'organizations'>} />
      )}

      {/* Create Event Dialog */}
      <Sheet open={showCreateModal} onOpenChange={setShowCreateModal}>
        <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle className="text-lg md:text-xl">
              {t('events.createEvent', 'Create Event')}
            </SheetTitle>
          </SheetHeader>
          <SheetBody>
            <CreateEventWizard
              organizationId={effectiveOrgId as Id<'organizations'>}
              onComplete={() => {
                setShowCreateModal(false);
                toast.success(t('events.eventCreated', 'Event created successfully'));
              }}
              onCancel={() => setShowCreateModal(false)}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Edit Event Dialog */}
      <Sheet
        open={showEditModal}
        onOpenChange={(open) => {
          setShowEditModal(open);
          if (!open) {
            setSelectedEvent(null);
          } else if (selectedEvent) {
            setEditName(selectedEvent.name);
            setEditDescription(selectedEvent.description || '');
            if (selectedEvent.startDate) {
              const startDateStr = new Date(selectedEvent.startDate).toISOString().split('T')[0];
              if (startDateStr) setEditStartDate(startDateStr);
            }
            if (selectedEvent.endDate) {
              const endDateStr = new Date(selectedEvent.endDate).toISOString().split('T')[0];
              if (endDateStr) setEditEndDate(endDateStr);
            }
          }
        }}
      >
        <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Edit className="w-5 h-5" />
              {t('events.editEvent', 'Edit Event')}
            </SheetTitle>
          </SheetHeader>
          {selectedEvent && (
            <SheetBody className="space-y-5">
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  {t('events.eventName', 'Event Name')}{' '}
                  <span className="text-(--danger-text)">*</span>
                </Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('events.eventNamePlaceholder', 'Event name...')}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  {t('events.description', 'Description')}
                </Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  placeholder={t('events.briefDescriptionPlaceholder', 'Brief description...')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    {t('events.startDate', 'Start Date')}{' '}
                    <span className="text-(--danger-text)">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    {t('events.endDate', 'End Date')}{' '}
                    <span className="text-(--danger-text)">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  {t('admin.editPriority', 'Priority')}
                </Label>
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {[
                    { key: 'high', label: t('events.priority.high', 'High'), icon: '🔴' },
                    { key: 'medium', label: t('events.priority.medium', 'Medium'), icon: '🟡' },
                    { key: 'low', label: t('events.priority.low', 'Low'), icon: '🔵' },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setSelectedEvent({
                          ...selectedEvent,
                          priority: key as 'high' | 'medium' | 'low',
                        })
                      }
                      className={`p-3 rounded-lg border-2 transition-all text-center ${
                        (selectedEvent.priority || 'medium') === key
                          ? 'border-(--primary) bg-(--primary)/5'
                          : 'border-(--border) hover:border-(--border-strong)'
                      }`}
                    >
                      <div className="text-2xl mb-1">{icon}</div>
                      <div className="text-sm font-medium">{label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <SheetFooter>
                <Button variant="outline" onClick={() => setShowEditModal(false)}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  className="btn-gradient text-white"
                  onClick={async () => {
                    try {
                      await updateEvent({
                        eventId: selectedEvent._id,
                        name: editName,
                        description: editDescription,
                        startDate: new Date(editStartDate).getTime(),
                        endDate: new Date(editEndDate).getTime(),
                        priority: (selectedEvent.priority || 'medium') as 'high' | 'medium' | 'low',
                      });
                      setShowEditModal(false);
                      toast.success(t('events.eventUpdated', 'Event updated successfully'));
                    } catch (error) {
                      logger.error(
                        'Update failed:',
                        error instanceof Error ? error.message : 'Unknown error',
                      );
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : t('events.updateFailed', 'Failed to update event'),
                      );
                    }
                  }}
                >
                  {t('common.save', 'Save Changes')}
                </Button>
              </SheetFooter>
            </SheetBody>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
