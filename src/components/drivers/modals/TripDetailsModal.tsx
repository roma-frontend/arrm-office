'use client';

import { motion } from '@/lib/cssMotion';
import {
  Car,
  Clock,
  MapPin,
  Users,
  Star,
  Navigation2,
  MessageSquare,
  PhoneCall,
  AlertCircle,
  X,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useState, useRef, useEffect } from 'react';

interface TripDetailsModalProps {
  schedule: TripSchedule | null;
  currentTime: number;
  onClose: () => void;
  onRate?: (rating: number) => void;
  onReassign?: () => void;
  onMessage?: () => void;
  onCall?: () => void;
  userId: string;
  isAdmin?: boolean;
}

export interface TripSchedule {
  type: string;
  status: string;
  startTime: number;
  endTime: number;
  userName?: string;
  userAvatar?: string;
  tripInfo?: {
    from?: string;
    to?: string;
    purpose?: string;
    passengerPhone?: string;
    passengerCount?: number;
    distanceKm?: number;
    notes?: string;
  };
}

export function TripDetailsModal({
  schedule,
  onClose,
  onRate,
  onReassign,
  onMessage,
  onCall,
}: TripDetailsModalProps & { isAdmin?: boolean }) {
  const { t, i18n } = useTranslation();
  const [showMapMenu, setShowMapMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMapMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const dateFnsLocale = i18n.language === 'ru' ? ru : i18n.language === 'hy' ? hy : enUS;

  if (!schedule) return null;

  const isTrip = schedule.type === 'trip';
  const statusTranslations: Record<string, string> = {
    scheduled: t('driver.status.scheduled', 'Scheduled'),
    pending: t('driver.status.pending', 'Pending'),
    approved: t('driver.status.approved', 'Approved'),
    rejected: t('driver.status.rejected', 'Rejected'),
    in_progress: t('driver.status.in_progress', 'In Progress'),
    completed: t('driver.status.completed', 'Completed'),
    cancelled: t('driver.status.cancelled', 'Cancelled'),
  };

  const openInMap = (provider: string) => {
    if (!schedule.tripInfo?.from || !schedule.tripInfo?.to) return;
    const from = encodeURIComponent(schedule.tripInfo.from);
    const to = encodeURIComponent(schedule.tripInfo.to);
    let url = '';
    switch (provider) {
      case 'google':
        url = `https://www.google.com/maps/dir/?api=1&origin=${from}&destination=${to}`;
        break;
      case 'yandex':
        // Use /route/ endpoint for explicit addresses, not rtext which uses geolocation
        url = `https://yandex.ru/maps/?pt=${from}&l=map&z=12&text=${to}`;
        break;
      case 'apple':
        url = `https://maps.apple.com/?saddr=${from}&daddr=${to}&dirflg=d`;
        break;
      case 'waze':
        url = `https://waze.com/ul?from=${from}&to=${to}&navigate=yes`;
        break;
      case '2gis':
        url = `https://2gis.ru/directions/points/${from}|${to}`;
        break;
    }
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      setShowMapMenu(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-[85vh] flex flex-col"
    >
      <div className="rounded-2xl shadow-2xl overflow-clip w-full h-full flex flex-col">
        {/* Header with gradient */}
        <div
          className={`relative p-6 shrink-0 ${
            isTrip ? 'btn-gradient' : 'bg-linear-to-r from-amber-500 to-orange-500'
          }`}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start justify-between pr-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                {isTrip ? (
                  <Car className="w-6 h-6 text-white" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {isTrip
                    ? t('driver.tripDetails', 'Trip Details')
                    : t('driver.timeBlock', 'Time Block')}
                </h2>
                <p className="text-white/80 text-sm mt-1">
                  {format(new Date(schedule.startTime), 'EEEE, MMMM dd, yyyy', {
                    locale: dateFnsLocale,
                  })}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm">
                {isTrip ? t('driver.trip', 'Trip') : t('driver.blocked', 'Blocked')}
              </Badge>
              <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm">
                {statusTranslations[schedule.status] || schedule.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Content - Scrollable area */}
        <div className="bg-(--card) flex-1 overflow-y-auto min-h-0 p-6 space-y-5">
          {isTrip && schedule.tripInfo && (
            <>
              {/* Route */}
              <div className="rounded-xl bg-muted/30 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Navigation2 className="w-4 h-4 text-(--primary)" />
                    <span className="text-sm font-semibold text-foreground">
                      {t('driver.route', 'Route')}
                    </span>
                  </div>
                  <div className="relative" ref={menuRef}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMapMenu(!showMapMenu)}
                      className="gap-1.5 h-8 text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {t('driver.openInMap', 'Open in Map')}
                      </span>
                      <span className="sm:hidden">{t('driver.mapTitle', 'Map')}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${showMapMenu ? 'rotate-180' : ''}`}
                      />
                    </Button>
                    {showMapMenu && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-(--card) border border-(--border) rounded-lg shadow-lg z-50 overflow-hidden">
                        <div className="px-3 py-2 text-xs font-semibold text-(--text-muted) border-b border-(--border)">
                          {t('driver.selectMapApp', 'Select Map App')}
                        </div>
                        <button
                          onClick={() => openInMap('google')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-(--background-subtle) flex items-center gap-2 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          {t('driver.navigator.google', 'Google Maps')}
                        </button>
                        <button
                          onClick={() => openInMap('yandex')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-(--background-subtle) flex items-center gap-2 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          {t('driver.navigator.yandex', 'Yandex Maps')}
                        </button>
                        <button
                          onClick={() => openInMap('apple')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-(--background-subtle) flex items-center gap-2 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-(--text-4)" />
                          {t('driver.navigator.apple', 'Apple Maps')}
                        </button>
                        <button
                          onClick={() => openInMap('waze')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-(--background-subtle) flex items-center gap-2 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-cyan-500" />
                          {t('driver.navigator.waze', 'Waze')}
                        </button>
                        <button
                          onClick={() => openInMap('2gis')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-(--background-subtle) flex items-center gap-2 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          {t('driver.navigator.2gis', '2GIS')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t('driver.pickup', 'Pickup')}
                      </p>
                      <p className="text-sm font-medium text-foreground mt-0.5">
                        {schedule.tripInfo.from}
                      </p>
                    </div>
                  </div>
                  <div className="ml-1.5 border-l-2 border-dashed border-border/40 h-6" />
                  <div className="flex items-start gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t('driver.dropoff', 'Dropoff')}
                      </p>
                      <p className="text-sm font-medium text-foreground mt-0.5">
                        {schedule.tripInfo.to}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Passenger Info */}
              {schedule.userName && (
                <div className="rounded-xl bg-muted/30 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-(--primary)" />
                    <span className="text-sm font-semibold text-foreground">
                      {t('driver.passenger', 'Passenger')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      {schedule.userAvatar && <AvatarImage src={schedule.userAvatar} />}
                      <AvatarFallback className="text-xs">
                        {schedule.userName
                          ?.split(' ')
                          .map((n: string) => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{schedule.userName}</p>
                      {schedule.tripInfo.passengerPhone && (
                        <p className="text-xs text-muted-foreground">
                          {schedule.tripInfo.passengerPhone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Trip Details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-(--primary)" />
                    <p className="text-xs text-muted-foreground">{t('driver.time', 'Time')}</p>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {format(new Date(schedule.startTime), 'HH:mm', { locale: dateFnsLocale })} -{' '}
                    {format(new Date(schedule.endTime), 'HH:mm', { locale: dateFnsLocale })}
                  </p>
                </div>
                {schedule.tripInfo.distanceKm && (
                  <div className="rounded-xl bg-muted/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-(--primary)" />
                      <p className="text-xs text-muted-foreground">
                        {t('driver.distance', 'Distance')}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {schedule.tripInfo.distanceKm} km
                    </p>
                  </div>
                )}
              </div>

              {/* Purpose */}
              {schedule.tripInfo.purpose && (
                <div className="rounded-xl bg-muted/30 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Car className="w-4 h-4 text-(--primary)" />
                    <span className="text-sm font-semibold text-foreground">
                      {t('driver.purpose', 'Purpose')}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{schedule.tripInfo.purpose}</p>
                </div>
              )}

              {/* Passenger Count */}
              {schedule.tripInfo.passengerCount && (
                <div className="rounded-xl bg-muted/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-(--primary)" />
                    <p className="text-xs text-muted-foreground">
                      {t('driver.passengers', 'Passengers')}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-foreground">
                    {schedule.tripInfo.passengerCount}
                  </p>
                </div>
              )}

              {/* Notes */}
              {schedule.tripInfo.notes && (
                <div className="rounded-xl bg-muted/30 p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-(--primary)" />
                    <span className="text-sm font-semibold text-foreground">
                      {t('driver.notes', 'Notes')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{schedule.tripInfo.notes}</p>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4 pb-2">
            {onMessage && (
              <Button variant="outline" size="sm" onClick={onMessage} className="gap-2">
                <MessageSquare className="w-4 h-4" />
                {t('driver.message', 'Message')}
              </Button>
            )}
            {onCall && (
              <Button variant="outline" size="sm" onClick={onCall} className="gap-2">
                <PhoneCall className="w-4 h-4" />
                {t('driver.call', 'Call')}
              </Button>
            )}
            {onRate && schedule.status === 'completed' && (
              <Button variant="outline" size="sm" onClick={() => onRate(5)} className="gap-2">
                <Star className="w-4 h-4" />
                {t('driver.rate', 'Rate')}
              </Button>
            )}
            {onReassign && (
              <Button variant="outline" size="sm" onClick={onReassign} className="gap-2">
                <Users className="w-4 h-4" />
                {t('driver.reassign', 'Reassign')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
