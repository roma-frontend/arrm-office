'use client';

import React, { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  History,
  Repeat,
  Eye,
  Star,
  Car,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import i18n from 'i18next';
import { motion } from '@/lib/cssMotion';

interface Request {
  _id: string;
  status: string;
  startTime?: number;
  tripInfo?: {
    from: string;
    to: string;
  };
  assignedDriver?: {
    userName: string;
  };
}

interface RecurringTrip {
  _id: string;
  isActive: boolean;
  days: number[];
  startTime: string;
  endTime: string;
  tripInfo: {
    from: string;
    to: string;
  };
}

interface MyRequestsSectionProps {
  activeRequests: Request[];
  historyRequests: Request[];
  recurringTrips: RecurringTrip[];
  onViewDetails: (request: Request) => void;
  onRate: (request: Request) => void;
  onEdit: (request: Request) => void;
  onDelete: (request: Request) => void;
  onCancel: (request: Request) => void;
  onToggleRecurring: (trip: RecurringTrip) => void;
  onDeleteRecurring: (trip: RecurringTrip) => void;
  onRequestDriver: () => void;
}

const statusLabel = (status: string, t: (key: string, fallback: string) => string) => {
  const labels: Record<string, string> = {
    pending: t('driver.status.pending', 'Pending'),
    approved: t('driver.status.approved', 'Approved'),
    completed: t('driver.status.completed', 'Completed'),
    cancelled: t('driver.status.cancelled', 'Cancelled'),
  };
  return labels[status] || status;
};

const RequestItem = memo(function RequestItem({
  request,
  onViewDetails,
  onRate,
  onEdit,
  onDelete,
  onCancel,
}: {
  request: Request;
  onViewDetails: () => void;
  onRate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;
  const statusColors: Record<string, string> = {
    completed: 'bg-green-500',
    pending: 'bg-amber-500',
    approved: 'bg-blue-500',
    cancelled: 'bg-gray-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="p-4 rounded-xl border border-(--border) bg-(--card) hover:border-(--primary)/30 transition-all duration-300 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className={`w-2 h-2 rounded-full mt-2 shrink-0 ${statusColors[request.status] || 'bg-gray-400'}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-medium text-sm truncate">
                {request.tripInfo?.from} → {request.tripInfo?.to}
              </p>
              <Badge
                variant={
                  request.status === 'completed'
                    ? 'default'
                    : request.status === 'pending'
                      ? 'secondary'
                      : 'outline'
                }
                className="text-xs"
              >
                {statusLabel(request.status, t)}
              </Badge>
            </div>
            {request.startTime && (
              <p className="text-xs text-(--text-muted)">
                {format(new Date(request.startTime), 'MMM dd, HH:mm', { locale: dateFnsLocale })}
              </p>
            )}
            {request.assignedDriver && (
              <p className="text-xs text-(--text-muted) mt-1 flex items-center gap-1">
                <Car className="w-3 h-3" />
                {request.assignedDriver.userName}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onViewDetails}
            className="gap-1.5 rounded-lg hover:bg-blue-500/10 hover:text-blue-500 transition-all duration-200 group"
          >
            <Eye className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
          </Button>
          {request.status === 'completed' && onRate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRate}
              className="rounded-lg hover:bg-yellow-500/10 hover:text-yellow-500 transition-all duration-200 group"
            >
              <Star className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
            </Button>
          )}
          {request.status === 'pending' && onEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="rounded-lg hover:bg-purple-500/10 hover:text-purple-500 transition-all duration-200 group"
            >
              <Pencil className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
            </Button>
          )}
          {request.status === 'pending' && onCancel && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              className="rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-all duration-200 group"
            >
              <XCircle className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-all duration-200 group"
            >
              <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
});

const RecurringTripItem = memo(function RecurringTripItem({
  trip,
  onToggle,
  onDelete,
}: {
  trip: RecurringTrip;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const dayNames = [
    t('weekdays.mon', 'Mon'),
    t('weekdays.tue', 'Tue'),
    t('weekdays.wed', 'Wed'),
    t('weekdays.thu', 'Thu'),
    t('weekdays.fri', 'Fri'),
    t('weekdays.sat', 'Sat'),
    t('weekdays.sun', 'Sun'),
  ];
  const activeDays = trip.days.map((d) => dayNames[d - 1]).join(', ');

  return (
    <div className="p-4 rounded-xl border border-(--border) bg-(--card)">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Repeat className="w-4 h-4 text-(--primary)" />
            <p className="font-medium text-sm">
              {trip.tripInfo.from} → {trip.tripInfo.to}
            </p>
            <Badge variant={trip.isActive ? 'default' : 'secondary'} className="text-xs">
              {trip.isActive
                ? t('driver.status.active', 'Active')
                : t('driver.status.inactive', 'Inactive')}
            </Badge>
          </div>
          <p className="text-xs text-(--text-muted)">
            {activeDays} · {trip.startTime} - {trip.endTime}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={onToggle}
            className="rounded-lg hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30 transition-all duration-200 group"
          >
            <CheckCircle className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-all duration-200 group"
          >
            <Trash2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
          </Button>
        </div>
      </div>
    </div>
  );
});

export const MyRequestsSection = memo(function MyRequestsSection({
  activeRequests,
  historyRequests,
  recurringTrips,
  onViewDetails,
  onRate,
  onEdit,
  onDelete,
  onCancel,
  onToggleRecurring,
  onDeleteRecurring,
}: MyRequestsSectionProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('active');

  return (
    <Card className="mb-6 sm:mb-8 border-(--border)">
      <CardHeader>
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-(--primary)" />
            {t('driver.myRequests', 'My Driver Requests')}
          </CardTitle>
          <CardDescription>
            {t('driver.myRequestsDesc', 'View and manage your requests')}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger
              value="active"
              className="gap-2 flex items-center justify-center data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Clock className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('driver.active', 'Active')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="gap-2 flex items-center justify-center data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <History className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('driver.history', 'History')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="recurring"
              className="gap-2 flex items-center justify-center data-[state=active]:bg-[#3b82f6] data-[state=active]:text-white"
            >
              <Repeat className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('driver.recurring', 'Recurring')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3">
            {activeRequests.length > 0 ? (
              activeRequests.map((request) => (
                <RequestItem
                  key={request._id}
                  request={request}
                  onViewDetails={() => onViewDetails(request)}
                  onEdit={() => onEdit(request)}
                  onCancel={() => onCancel(request)}
                  onDelete={() => onDelete(request)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-(--text-muted)">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('driver.noActiveRequests', 'No active requests')}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {historyRequests.length > 0 ? (
              historyRequests.map((request) => (
                <RequestItem
                  key={request._id}
                  request={request}
                  onViewDetails={() => onViewDetails(request)}
                  onRate={() => onRate(request)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-(--text-muted)">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('driver.noHistory', 'No history yet')}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="recurring" className="space-y-3">
            {recurringTrips.length > 0 ? (
              recurringTrips.map((trip) => (
                <RecurringTripItem
                  key={trip._id}
                  trip={trip}
                  onToggle={() => onToggleRecurring(trip)}
                  onDelete={() => onDeleteRecurring(trip)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-(--text-muted)">
                <Repeat className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('driver.noRecurringTrips', 'No recurring trips')}</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
});
