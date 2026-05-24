/**
 * Driver Request Modal
 *
 * Allows users to request a driver for a specific date/time
 * from the calendar view
 */

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
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
import { toast } from 'sonner';
import { Car, MapPin, Clock, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { DriverMap } from '@/components/drivers/DriverMap';
import { PlaceAutocomplete } from '@/components/drivers/PlaceAutocomplete';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface DriverRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date;
}

export function DriverRequestModal({ open, onOpenChange, selectedDate }: DriverRequestModalProps) {
  const { t } = useTranslation();
  const currentUser = useQuery(api.users.queries.getCurrentUser, { email: undefined });
  const userId =
    currentUser?._id && currentUser._id !== '' ? (currentUser._id as Id<'users'>) : null;
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? currentUser?.organizationId) as
    | Id<'organizations'>
    | undefined;

  const availableDrivers = useQuery(
    api.drivers.queries.getAvailableDrivers,
    organizationId ? { organizationId } : 'skip',
  );

  const requestDriver = useMutation(api.drivers.requests_mutations.requestDriver);

  const [leaveWarning, setLeaveWarning] = useState<{
    type: string;
    message: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
  } | null>(null);

  const [selectedDriver, setSelectedDriver] = useState<Id<'drivers'> | ''>('');
  const [tripInfo, setTripInfo] = useState({
    from: '',
    to: '',
    purpose: '',
    passengerCount: 1,
    notes: '',
  });
  const [pickupCoords, setPickupCoords] = useState<
    { lat: number; lng: number; address?: string } | undefined
  >();
  const [dropoffCoords, setDropoffCoords] = useState<
    { lat: number; lng: number; address?: string } | undefined
  >();
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');

  // Get alternative drivers when current driver is on leave
  const alternativeDrivers = useQuery(
    api.drivers.queries.getAlternativeDrivers,
    selectedDriver && startTime && endTime && leaveWarning
      ? {
          organizationId: organizationId!,
          startTime: new Date(startTime).getTime(),
          endTime: new Date(endTime).getTime(),
          excludeDriverId: selectedDriver as Id<'drivers'>,
        }
      : 'skip',
  );

  // Geocode search state
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [pickupResults, setPickupResults] = useState<
    { lat: number; lng: number; display_name: string }[]
  >([]);
  const [dropoffResults, setDropoffResults] = useState<
    { lat: number; lng: number; display_name: string }[]
  >([]);
  const [showPickupResults, setShowPickupResults] = useState(false);
  const [showDropoffResults, setShowDropoffResults] = useState(false);
  const pickupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const geocodeSearch = useCallback(
    async (query: string): Promise<{ lat: number; lng: number; display_name: string }[]> => {
      if (query.length < 3) {
        logger.log('[geocode] Query too short:', query);
        return [];
      }
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
        logger.log('[geocode] Searching:', url);
        const res = await fetch(url, {
          headers: { 'Accept-Language': 'en,ru' },
        });
        if (!res.ok) {
          console.error('[geocode] HTTP error:', res.status);
          return [];
        }
        const data = await res.json();
        logger.log('[geocode] Results:', data.length, data);
        if (data.length === 0) {
          logger.log('[geocode] No results found');
          return [];
        }
        return data.map((item: any) => ({
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          display_name: item.display_name,
        }));
      } catch (err) {
        console.error('[geocode] Error:', err);
        return [];
      }
    },
    [],
  );

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-geocode-input]')) {
        setShowPickupResults(false);
        setShowDropoffResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePickupInputChange = (value: string) => {
    setPickupQuery(value);
    setTripInfo((prev) => ({ ...prev, from: value }));
    setPickupCoords(undefined);
    if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current);
    if (value.length >= 3) {
      pickupTimerRef.current = setTimeout(async () => {
        const results = await geocodeSearch(value);
        setPickupResults(results);
        setShowPickupResults(results.length > 0);
      }, 400);
    } else {
      setPickupResults([]);
      setShowPickupResults(false);
    }
  };

  const handleDropoffInputChange = (value: string) => {
    setDropoffQuery(value);
    setTripInfo((prev) => ({ ...prev, to: value }));
    setDropoffCoords(undefined);
    if (dropoffTimerRef.current) clearTimeout(dropoffTimerRef.current);
    if (value.length >= 3) {
      dropoffTimerRef.current = setTimeout(async () => {
        const results = await geocodeSearch(value);
        setDropoffResults(results);
        setShowDropoffResults(results.length > 0);
      }, 400);
    } else {
      setDropoffResults([]);
      setShowDropoffResults(false);
    }
  };

  const selectPickupResult = (result: { lat: number; lng: number; display_name: string }) => {
    logger.log('[selectPickupResult]', result);
    setPickupCoords({ lat: result.lat, lng: result.lng, address: result.display_name });
    setTripInfo((prev) => ({ ...prev, from: result.display_name }));
    setPickupQuery(result.display_name);
    setPickupResults([]);
    setShowPickupResults(false);
    // Map will auto-center via DriverMap useEffect when pickupCoords changes
  };

  const selectDropoffResult = (result: { lat: number; lng: number; display_name: string }) => {
    logger.log('[selectDropoffResult]', result);
    setDropoffCoords({ lat: result.lat, lng: result.lng, address: result.display_name });
    setTripInfo((prev) => ({ ...prev, to: result.display_name }));
    setDropoffQuery(result.display_name);
    setDropoffResults([]);
    setShowDropoffResults(false);
    // Map will auto-center via DriverMap useEffect when dropoffCoords changes
  };

  // Handle location selection from map
  const handleLocationSelect = (
    location: { lat: number; lng: number; address?: string },
    type: 'pickup' | 'dropoff',
  ) => {
    if (type === 'pickup') {
      setPickupCoords(location);
      setTripInfo((prev) => ({ ...prev, from: location.address || prev.from }));
      setPickupQuery(location.address || '');
      setShowPickupResults(false);
    } else {
      setDropoffCoords(location);
      setTripInfo((prev) => ({ ...prev, to: location.address || prev.to }));
      setDropoffQuery(location.address || '');
      setShowDropoffResults(false);
    }
  };

  // Pre-fill time when selectedDate changes
  React.useEffect(() => {
    if (selectedDate && open) {
      // Set start time to 9:00 AM on selected date
      const start = new Date(selectedDate);
      start.setHours(9, 0, 0, 0);

      // Set end time to 6:00 PM on selected date
      const end = new Date(selectedDate);
      end.setHours(18, 0, 0, 0);

      setStartTime(start.toISOString().slice(0, 16));
      setEndTime(end.toISOString().slice(0, 16));
    }
  }, [selectedDate, open]);

  // Check if driver is on leave when driver or time changes
  const isDriverOnLeave = useQuery(
    api.drivers.queries.isDriverOnLeave,
    selectedDriver && startTime && endTime
      ? {
          driverId: selectedDriver as Id<'drivers'>,
          startTime: new Date(startTime).getTime(),
          endTime: new Date(endTime).getTime(),
        }
      : 'skip',
  );

  const isCheckingLeave = selectedDriver && startTime && endTime && isDriverOnLeave === undefined;

  React.useEffect(() => {
    if (isDriverOnLeave?.onLeave && isDriverOnLeave.leave) {
      setLeaveWarning({
        type: 'driver_on_leave',
        message: `Водитель находится в отпуске с ${isDriverOnLeave.leave.startDate} по ${isDriverOnLeave.leave.endDate}`,
        leaveType: isDriverOnLeave.leave.type,
        startDate: isDriverOnLeave.leave.startDate,
        endDate: isDriverOnLeave.leave.endDate,
        reason: isDriverOnLeave.leave.reason,
      });
    } else {
      setLeaveWarning(null);
    }
  }, [isDriverOnLeave]);

  const handleSubmit = async () => {
    if (!userId || !organizationId) {
      toast.error(t('toasts.pleaseLogin'));
      return;
    }

    if (!selectedDriver) {
      toast.error(t('toasts.pleaseSelectDriver'));
      return;
    }

    if (!startTime || !endTime) {
      toast.error(t('toasts.pleaseSelectTime'));
      return;
    }

    if (!tripInfo.from || !tripInfo.to) {
      toast.error(t('toasts.pleaseFillLocations'));
      return;
    }

    // Double check: also check isDriverOnLeave directly, not just leaveWarning
    if (isDriverOnLeave?.onLeave || leaveWarning) {
      const leaveInfo = isDriverOnLeave?.leave || leaveWarning;
      toast.error(
        t('driver.driverOnLeaveBlock', 'Невозможно заказать водителя: он находится в отпуске'),
        {
          description:
            (leaveInfo as any).message ||
            `Отпуск с ${(leaveInfo as any).startDate} по ${(leaveInfo as any).endDate}`,
          duration: 6000,
        },
      );
      return;
    }

    try {
      const result = await requestDriver({
        organizationId,
        requesterId: userId,
        driverId: selectedDriver as Id<'drivers'>,
        startTime: new Date(startTime).getTime(),
        endTime: new Date(endTime).getTime(),
        tripInfo: {
          ...tripInfo,
          pickupCoords: pickupCoords ? { lat: pickupCoords.lat, lng: pickupCoords.lng } : undefined,
          dropoffCoords: dropoffCoords
            ? { lat: dropoffCoords.lat, lng: dropoffCoords.lng }
            : undefined,
        },
      });

      // Handle error from server (driver on leave)
      if (result?.error) {
        toast.error(
          t('driver.driverOnLeaveBlock', 'Невозможно заказать водителя: он находится в отпуске'),
          {
            description: result.error.message,
            duration: 6000,
          },
        );
        return;
      }

      toast.success(t('driver.requestSubmitted', 'Driver request submitted!'));
      onOpenChange(false);

      // Reset form
      setSelectedDriver('');
      setTripInfo({
        from: '',
        to: '',
        purpose: '',
        passengerCount: 1,
        notes: '',
      });
      setPickupCoords(undefined);
      setDropoffCoords(undefined);
    } catch (error: any) {
      toast.error(
        error.message || t('driver.failedToRequestDriver', 'Не удалось запросить водителя'),
      );
    }
  };

  if (!currentUser)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5" />
            {t('driver.requestDriver', 'Request Driver')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4" style={{ overflow: 'visible' }}>
          {/* Select Driver */}
          <div>
            <Label>{t('driver.selectDriver', 'Select Driver')}</Label>
            <Select
              value={selectedDriver}
              onValueChange={(v: Id<'drivers'> | '') => setSelectedDriver(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('driver.chooseDriver', 'Choose a driver')} />
              </SelectTrigger>
              <SelectContent>
                {availableDrivers?.filter(Boolean).map((driver: any) => (
                  <SelectItem key={driver!._id} value={driver!._id}>
                    {driver!.userName} - {driver!.vehicleInfo.model} (
                    {driver!.vehicleInfo.plateNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableDrivers && availableDrivers.length === 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {t('driver.noDriversFound', 'No drivers available')}
              </p>
            )}
          </div>

          {/* Leave Warning Alert */}
          {leaveWarning && (
            <Alert variant="warning" className="border-amber-500 bg-amber-50 dark:bg-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-200">
                {t('driver.driverOnLeave', 'Driver on leave')}
              </AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <p className="font-semibold mb-2">
                  ⛔ {t('driver.bookingUnavailable', 'Booking unavailable')}
                </p>
                {t('driver.onLeaveFrom', 'On leave from')} {leaveWarning.startDate}{' '}
                {t('driver.to', 'to')} {leaveWarning.endDate}
                <div className="mt-2 text-sm">
                  <strong>{t('driver.leaveType', 'Leave type')}:</strong>{' '}
                  {leaveWarning.leaveType === 'paid'
                    ? t('leave.types.paid', 'Paid')
                    : leaveWarning.leaveType === 'sick'
                      ? t('leave.types.sick', 'Sick')
                      : leaveWarning.leaveType === 'family'
                        ? t('leave.types.family', 'Family')
                        : leaveWarning.leaveType === 'unpaid'
                          ? t('leave.types.unpaid', 'Unpaid')
                          : leaveWarning.leaveType}
                </div>
                {leaveWarning.reason && (
                  <div className="text-sm mt-1">
                    <strong>{t('driver.reason', 'Reason')}:</strong> {leaveWarning.reason}
                  </div>
                )}
                {/* Alternative Drivers */}
                {alternativeDrivers && alternativeDrivers.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {t('driver.alternativeDrivers', 'Доступные водители:')}
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {alternativeDrivers.map((driver: any) => (
                        <div
                          key={driver._id}
                          className="flex items-center justify-between p-2 rounded-md bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={driver.userAvatar} />
                              <AvatarFallback>{driver.userName?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="text-sm">
                              <p className="font-medium text-amber-900 dark:text-amber-100">
                                {driver.userName}
                              </p>
                              <p className="text-xs text-amber-700 dark:text-amber-300">
                                {driver.vehicleInfo?.model} • {driver.vehicleInfo?.plateNumber}
                                {driver.vehicleInfo?.capacity &&
                                  ` • ${driver.vehicleInfo.capacity} ${t('driver.seats', 'мест')}`}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900"
                            onClick={() => {
                              setSelectedDriver(driver._id);
                              toast.success(
                                `${t('driver.driverSelected', 'Выбран водитель')}: ${driver.userName}`,
                              );
                            }}
                          >
                            {t('driver.select', 'Выбрать')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(!alternativeDrivers || alternativeDrivers.length === 0) && (
                  <p className="text-sm mt-3 text-amber-800 dark:text-amber-200">
                    💡{' '}
                    {t(
                      'driver.noAlternativeDrivers',
                      'Нет доступных водителей. Измените даты бронирования или обратитесь к администратору.',
                    )}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Trip Details */}
          <div className="space-y-3">
            {/* Pickup */}
            <div>
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-500" />
                {t('driver.pickupLocation', 'Pickup Location')}
              </Label>
              <PlaceAutocomplete
                value={pickupQuery || tripInfo.from}
                onChange={(val) => {
                  setPickupQuery(val);
                  setTripInfo((prev) => ({ ...prev, from: val }));
                  setPickupCoords(undefined);
                }}
                onSelect={(place) => {
                  setPickupCoords({ lat: place.lat, lng: place.lng, address: place.address });
                  setTripInfo((prev) => ({ ...prev, from: place.address }));
                  setPickupQuery(place.address);
                }}
                placeholder={t('driver.fromPlaceholder', 'e.g., Office')}
              />
            </div>

            {/* Dropoff */}
            <div>
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                {t('driver.dropoffLocation', 'Dropoff Location')}
              </Label>
              <PlaceAutocomplete
                value={dropoffQuery || tripInfo.to}
                onChange={(val) => {
                  setDropoffQuery(val);
                  setTripInfo((prev) => ({ ...prev, to: val }));
                  setDropoffCoords(undefined);
                }}
                onSelect={(place) => {
                  setDropoffCoords({ lat: place.lat, lng: place.lng, address: place.address });
                  setTripInfo((prev) => ({ ...prev, to: place.address }));
                  setDropoffQuery(place.address);
                }}
                placeholder={t('driver.toPlaceholder', 'e.g., Airport')}
              />
            </div>
          </div>

          {/* Map for location selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {t('driver.selectOnMap', 'Select on Map')}
              </Label>
              <Badge variant="secondary" className="text-xs">
                Click to pick location
              </Badge>
            </div>
            <div className="rounded-lg overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600">
              <DriverMap
                pickupLocation={tripInfo.from}
                dropoffLocation={tripInfo.to}
                pickupCoords={pickupCoords}
                dropoffCoords={dropoffCoords}
                height="300px"
                zoom={13}
                interactive={true}
                onLocationSelect={handleLocationSelect}
              />
            </div>
          </div>

          {/* Purpose */}
          <div>
            <Label>{t('driver.tripPurpose', 'Trip Purpose')}</Label>
            <Input
              value={tripInfo.purpose}
              onChange={(e) => setTripInfo({ ...tripInfo, purpose: e.target.value })}
              placeholder={t('driver.purposePlaceholder', 'e.g., Airport transfer, Client meeting')}
            />
          </div>

          {/* Time Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('driver.startTime', 'Start Time')}
              </Label>
              <Input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('driver.endTime', 'End Time')}
              </Label>
              <Input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {/* Passengers */}
          <div>
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t('driver.passengerCount', 'Passengers')}
            </Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={tripInfo.passengerCount}
              onChange={(e) =>
                setTripInfo({ ...tripInfo, passengerCount: parseInt(e.target.value) || 1 })
              }
            />
          </div>

          {/* Notes */}
          <div>
            <Label>
              {t('driver.notes', 'Notes')} ({t('optional', 'Optional')})
            </Label>
            <Textarea
              value={tripInfo.notes}
              onChange={(e) => setTripInfo({ ...tripInfo, notes: e.target.value })}
              placeholder={t('driver.notesPlaceholder', 'Additional information for the driver...')}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={Boolean(leaveWarning) || Boolean(isCheckingLeave)}
            >
              {isCheckingLeave
                ? t('driver.checking', 'Проверка...')
                : leaveWarning
                  ? t('driver.driverOnLeave', 'Водитель в отпуске')
                  : t('driver.submitRequest', 'Submit Request')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
