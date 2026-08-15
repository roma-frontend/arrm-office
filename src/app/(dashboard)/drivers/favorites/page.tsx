'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMainRef } from '@/hooks/useMainRef';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TripDetailsModal } from '@/components/drivers/modals';
import type { TripSchedule } from '@/components/drivers/modals/TripDetailsModal';
import { toast } from 'sonner';
import { motion } from '@/lib/cssMotion';
import { Heart, ChevronLeft, Shield, Search, Car, Users, MapPin, Star } from 'lucide-react';

// Isolate Convex API refs to avoid deep type instantiation
const removeFavoriteApi = api.drivers.driver_registration.removeFavoriteDriver;

interface DriverData {
  _id: string;
  userName: string;
  userAvatar?: string;
  userPosition?: string;
  rating: number;
  totalTrips: number;
  isOnShift?: boolean;
  vehicleInfo: {
    model: string;
    capacity: number;
    plateNumber: string;
  };
}

export default function FavoritesPage() {
  const { t } = useTranslation();
  const _router = useRouter();
  const mainRef = useMainRef();
  const { user, isAuthenticated } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TripSchedule | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const userId = user?.id as Id<'users'> | undefined;
  const orgId = user?.organizationId as Id<'organizations'> | undefined;

  // Superadmins browse one organization at a time, so the favourites list has to
  // follow the org selector rather than the superadmin's own organization.
  const selectedOrgId = useSelectedOrganization();
  const effectiveOrgId = (selectedOrgId ?? undefined) as Id<'organizations'> | undefined;

  const removeFavorite = useMutation(removeFavoriteApi);

  const favoriteDrivers = useQuery(
    api.drivers.requests_queries.getFavoriteDrivers,
    userId ? (effectiveOrgId ? { organizationId: effectiveOrgId } : {}) : 'skip',
  );

  const drivers = useMemo((): DriverData[] => {
    if (!favoriteDrivers || favoriteDrivers.length === 0) return [];
    const base = favoriteDrivers
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .map((d) => ({
        _id: d._id as string,
        userName: d.userName ?? 'Unknown',
        userAvatar: d.userAvatar,
        userPosition: d.userPosition,
        rating: d.rating ?? 5.0,
        totalTrips: d.totalTrips ?? 0,
        isOnShift: d.isOnShift,
        vehicleInfo: d.vehicleInfo ?? { model: 'Unknown', capacity: 4, plateNumber: 'N/A' },
      }));
    if (!searchQuery) return base;
    return base.filter((d) => d.userName.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [favoriteDrivers, searchQuery]);

  const handleRemoveFavorite = useCallback(
    async (driverId: string) => {
      if (!userId || !orgId) return;
      try {
        await removeFavorite({ driverId: driverId as Id<'drivers'> });
        toast.success(t('driver.removedFromFavorites', 'Removed from favorites'));
      } catch (e) {
        const message = e instanceof Error ? e.message : t('driver.failed', 'Failed');
        toast.error(message);
      }
    },
    [userId, orgId, removeFavorite, t],
  );

  const handleBook = useCallback(
    (driverId: string) => {
      const driver = drivers.find((d) => d._id === driverId);
      if (!driver) return;
      const mainEl = mainRef.current;
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setSelectedRequest({
        type: 'trip',
        status: 'scheduled',
        startTime: Date.now(),
        endTime: Date.now() + 3600000,
        tripInfo: {
          from: driver.userName,
          to: driver.userPosition || '',
        },
        userName: driver.userName,
      });
      setShowTripDetails(true);
    },
    [drivers, mainRef],
  );

  if (!isAuthenticated) {
    _router.push('/login');
    return null;
  }

  return (
    <div className="max-w-350 mx-auto p-0 md:p-6 space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl hover:bg-muted/50"
              onClick={() => _router.push('/drivers')}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-(--danger-quiet)">
                <Heart className="w-5 h-5 text-(--danger-text)" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {t('driver.favorites.title', 'Favorite Drivers')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t('driver.favorites.subtitle', 'Your preferred drivers for quick booking')}
                </p>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="text-xs h-7 px-3 rounded-full">
            <Shield className="w-3 h-3 mr-1" />
            {drivers.length} {t('driver.favorites.count', 'saved')}
          </Badge>
        </motion.div>
      </div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('driver.favorites.search', 'Search by name...')}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </motion.div>

      {/* Content */}
      {drivers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col items-center justify-center py-20 text-center"
        >
          <div className="p-6 rounded-2xl bg-muted/30 mb-4">
            <Heart className="w-16 h-16 text-muted-foreground/30" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {searchQuery
              ? t('driver.favorites.noResults', 'No drivers found')
              : t('driver.favorites.empty', 'No favorites yet')}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {searchQuery
              ? t('driver.favorites.noResultsDesc', 'Try a different search term')
              : t(
                  'driver.favorites.emptyDesc',
                  'Click the heart icon on any driver to add them to your favorites',
                )}
          </p>
          {!searchQuery && (
            <Button
              onClick={() => _router.push('/drivers')}
              className="rounded-xl gap-2 bg-linear-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm hover:shadow-md transition-all"
            >
              <Car className="w-4 h-4" />
              {t('driver.favorites.browseDrivers', 'Browse Drivers')}
            </Button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map((driver, index) => (
            <motion.div
              key={driver._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * index }}
            >
              <Card className="group relative overflow-hidden border border-border/50 bg-card/50 hover:border-border hover:shadow-lg transition-all duration-300">
                {/* Gradient top border */}
                <div className="absolute top-0 left-0 right-0 h-0.75 bg-linear-to-r from-(--danger-solid) via-primary/50 to-(--danger-solid) opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <CardContent className="pt-6">
                  <div className="flex flex-col items-start gap-4">
                    {/* Avatar */}
                    <div className="relative">
                      <Avatar className="w-12 h-12 ring-2 ring-transparent group-hover:ring-(--danger-text) transition-all duration-300">
                        {driver.userAvatar && <AvatarImage src={driver.userAvatar} />}
                        <AvatarFallback className="text-xs">
                          {driver.userName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      {driver.isOnShift && (
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-(--success-solid) border-2 border-card animate-pulse" />
                      )}
                    </div>

                    {/* Driver Info */}
                    <div className="flex-1 w-full">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-foreground group-hover:text-(--danger-text) transition-colors duration-200">
                            {driver.userName}
                          </h3>
                          {driver.userPosition && (
                            <p className="text-sm text-muted-foreground">{driver.userPosition}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg hover:bg-(--danger-quiet) hover:text-(--danger-text) transition-all"
                          onClick={() => handleRemoveFavorite(driver._id)}
                        >
                          <Heart className="w-4 h-4 fill-red-500 text-(--danger-text)" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        <Star className="w-4 h-4 fill-yellow-500 text-(--warning-text)" />
                        <span className="text-sm font-medium text-(--warning-text)">
                          {driver.rating.toFixed(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({driver.totalTrips} {t('driver.trips', 'trips')})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vehicle Info */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30">
                      <Car className="w-4 h-4 text-primary" />
                      <span>{driver.vehicleInfo.model}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30">
                      <Users className="w-4 h-4 text-primary" />
                      <span>
                        {driver.vehicleInfo.capacity} {t('driver.seats', 'seats')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-muted/30">
                      <MapPin className="w-4 h-4 text-primary" />
                      <span className="font-mono text-xs">{driver.vehicleInfo.plateNumber}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      onClick={() => handleBook(driver._id)}
                      className="flex-1 rounded-xl bg-linear-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm hover:shadow-md transition-all font-medium text-sm"
                    >
                      {t('driver.book', 'Book')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Trip Details Modal */}
      {showTripDetails &&
        selectedRequest &&
        createPortal(
          <div
            className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md"
            style={{ pointerEvents: 'auto' }}
            onClick={() => {
              setShowTripDetails(false);
              setSelectedRequest(null);
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl h-[85vh]"
              style={{ pointerEvents: 'auto' }}
            >
              <TripDetailsModal
                schedule={selectedRequest}
                currentTime={currentTime}
                onClose={() => {
                  setShowTripDetails(false);
                  setSelectedRequest(null);
                }}
                userId={userId!}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
