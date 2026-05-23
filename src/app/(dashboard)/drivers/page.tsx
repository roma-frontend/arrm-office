'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMainRef } from '@/hooks/useMainRef';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import { useTranslation } from 'react-i18next';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { DriverBookingPage } from '@/components/drivers/sections';
import { RequestDriverWizard } from '@/components/drivers/RequestDriverWizard';
import {
  RegisterDriverModal,
  SelectDriverModal,
  DriverCalendarDialog,
  TripDetailsModal,
} from '@/components/drivers/modals';
import { toast } from 'sonner';

interface VehicleInfo {
  model: string;
  plateNumber: string;
  capacity: number;
  color?: string;
  year?: number;
}

interface _DriverRecord {
  _id: Id<'drivers'>;
  userName: string;
  userAvatar?: string;
  userPosition?: string;
  rating: number;
  totalTrips: number;
  isOnShift?: boolean;
  isAvailable: boolean;
  vehicleInfo: VehicleInfo;
}

interface TripRequest {
  _id: Id<'driverRequests'>;
  status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'completed';
  startTime: number;
  endTime: number;
  tripInfo?: {
    from: string;
    to: string;
    purpose: string;
    passengerCount: number;
    notes?: string;
  };
  assignedDriver?: {
    userName: string;
  };
}

interface _RecurringTrip {
  _id: Id<'recurringTrips'>;
  isActive: boolean;
  driverName?: string;
  driverVehicle?: VehicleInfo;
  tripInfo?: {
    from: string;
    to: string;
    purpose: string;
    passengerCount: number;
    notes?: string;
  };
  schedule: {
    daysOfWeek: number[];
    startTime: string;
    endTime: string;
  };
  userId: Id<'users'>;
  driverId: Id<'drivers'>;
  organizationId: Id<'organizations'>;
  createdAt: number;
  updatedAt: number;
}

export default function DriversPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const mainRef = useMainRef();
  const { user, isAuthenticated } = useAuthStore();
  const { selectedOrgId: storeSelectedOrgId } = useOrgSelectorStore();

  // ═══════════════════════════════════════════════════════════════════════════
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY, IN SAME ORDER, EVERY RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. State hooks
  const [searchQuery, setSearchQuery] = useState('');
  const [capacityFilter, setCapacityFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'rating' | 'name' | 'availability'>('rating');
  const [showRequestWizard, setShowRequestWizard] = useState(false);
  const [showSelectDriverModal, setShowSelectDriverModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedDriverCandidate, setSelectedDriverCandidate] = useState<{
    _id: Id<'users'>;
    name: string;
    email: string;
    phone?: string;
  } | null>(null);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TripRequest | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const userId = user?.id as Id<'users'> | undefined;
  const orgId = user?.organizationId as Id<'organizations'> | undefined;
  const isSuperadmin = user?.role === 'superadmin';

  const effectiveOrgId = isSuperadmin
    ? (storeSelectedOrgId as Id<'organizations'> | undefined)
    : orgId;

  // For superadmin: show all drivers if no org selected, otherwise filter by org
  // For regular users: always use their org
  const shouldFilterByOrg = isSuperadmin ? !!storeSelectedOrgId : !!orgId;

  // 2. Mutation hooks
  const addFavorite = useMutation(api.drivers.driver_registration.addFavoriteDriver);
  const removeFavorite = useMutation(api.drivers.driver_registration.removeFavoriteDriver);
  const registerAsDriver = useMutation(api.drivers.driver_registration.registerAsDriver);

  // 3. Effect hooks
  useEffect(() => {
    if (!isAuthenticated) router.push('/login');
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && user && !orgId) router.push('/onboarding/select-organization');
  }, [isAuthenticated, user, orgId, router]);

  // 4. Query hooks
  const driverRecord = useQuery(
    api.drivers.queries.getDriverByUserId,
    userId && orgId ? { userId } : 'skip',
  );

  // Query drivers - if no org filter, returns all drivers
  const availableDrivers = useQuery(
    api.drivers.queries.getAvailableDrivers,
    shouldFilterByOrg ? { organizationId: effectiveOrgId } : {},
  );

  const myRequests = useQuery(
    api.drivers.requests_queries.getMyRequests,
    userId ? { userId } : 'skip',
  );

  const favoriteDrivers = useQuery(
    api.drivers.requests_queries.getFavoriteDrivers,
    userId ? { userId } : 'skip',
  );

  // Optimistic favorite IDs state - initialized from query when available
  const [optimisticFavoriteIds, setOptimisticFavoriteIds] = useState<Set<string>>(() => {
    // This will be updated by the effect below when data loads
    return new Set();
  });

  const recurringTrips = useQuery(
    api.drivers.recurring_trips.getRecurringTrips,
    userId ? { userId } : 'skip',
  );

  // Get all employees with driver role for registration
  const driverCandidates = useQuery(
    api.users.queries.getUsersByRole,
    shouldFilterByOrg ? { organizationId: effectiveOrgId, role: 'driver' } : { role: 'driver' },
  );

  // Sync optimistic state with server data when it loads
  useEffect(() => {
    if (favoriteDrivers && favoriteDrivers.length > 0) {
      const serverIds = new Set(favoriteDrivers.filter(Boolean).map((fav) => String(fav!._id)));
      setOptimisticFavoriteIds(serverIds);
    }
  }, [favoriteDrivers]);

  // 5. Redirect effect
  useEffect(() => {
    if (driverRecord && user?.role !== 'admin' && user?.role !== 'superadmin') {
      router.replace('/drivers/dashboard');
    }
  }, [driverRecord, router, user?.role]);

  // 6. Memo hooks (MUST be before early returns!)
  const favoriteIds = useMemo(() => optimisticFavoriteIds, [optimisticFavoriteIds]);

  const drivers = useMemo(
    () =>
      (availableDrivers ?? []).filter(Boolean).map((d) => ({
        _id: String((d as { _id: string })._id),
        userName: (d as { userName: string }).userName,
        userAvatar: (d as { userAvatar?: string }).userAvatar,
        userPosition: (d as { userPosition?: string }).userPosition,
        rating: (d as { rating?: number }).rating ?? 5.0,
        totalTrips: (d as { totalTrips?: number }).totalTrips ?? 0,
        isOnShift: (d as { isOnShift?: boolean }).isOnShift,
        vehicleInfo: (d as { vehicleInfo?: VehicleInfo }).vehicleInfo ?? {
          model: 'Unknown',
          capacity: 4,
          plateNumber: 'N/A',
        },
      })),
    [availableDrivers],
  );

  const activeRequests = useMemo(
    () =>
      (myRequests ?? []).filter(
        (r) =>
          (r as { status: string }).status === 'pending' ||
          (r as { status: string }).status === 'approved',
      ),
    [myRequests],
  );

  const historyRequests = useMemo(
    () =>
      (myRequests ?? []).filter(
        (r) =>
          (r as { status: string }).status === 'completed' ||
          (r as { status: string }).status === 'cancelled',
      ),
    [myRequests],
  );

  const recurringData = useMemo(
    () =>
      (recurringTrips ?? []).map((trip) => ({
        _id: String((trip as { _id: string })._id),
        isActive: (trip as { isActive: boolean }).isActive ?? true,
        days: (trip as { schedule: { daysOfWeek: number[] } }).schedule?.daysOfWeek ?? [
          1, 2, 3, 4, 5,
        ],
        startTime: (trip as { schedule: { startTime: string } }).schedule?.startTime ?? '08:00',
        endTime: (trip as { schedule: { endTime: string } }).schedule?.endTime ?? '09:00',
        tripInfo: {
          from: (trip as { tripInfo?: { from?: string } }).tripInfo?.from ?? 'Unknown',
          to: (trip as { tripInfo?: { to?: string } }).tripInfo?.to ?? 'Unknown',
        },
      })),
    [recurringTrips],
  );

  const stats = useMemo(
    () => ({
      availableDrivers: (availableDrivers ?? []).filter(
        (d) => (d as { isAvailable?: boolean }).isAvailable,
      ).length,
      pendingRequests: (myRequests ?? []).filter(
        (r) => (r as { status: string }).status === 'pending',
      ).length,
      totalTrips: (myRequests ?? []).filter((r) => (r as { status: string }).status === 'approved')
        .length,
    }),
    [availableDrivers, myRequests],
  );

  // 7. Effect for scroll blocking when wizard, calendar, or trip details are open
  useEffect(() => {
    if (showRequestWizard || showTripDetails || showCalendarDialog) {
      const mainEl = mainRef.current;
      const scrollY = mainEl ? mainEl.scrollTop : window.scrollY;

      document.body.style.overflow = 'hidden';
      if (mainEl) {
        mainEl.style.overflow = 'hidden';
        mainEl.style.paddingRight = '0px';
      }

      return () => {
        document.body.style.overflow = '';
        if (mainEl) {
          mainEl.style.overflow = '';
          mainEl.style.paddingRight = '';
          mainEl.scrollTo({ top: scrollY, behavior: 'instant' });
        }
      };
    }
  }, [showRequestWizard, showTripDetails, showCalendarDialog]);

  // 8. Callback hooks (MUST be before early returns!)
  const handleBook = useCallback(
    (id: string) => {
      setSelectedDriverId(id);
      setShowRequestWizard(true);
      const mainEl = mainRef.current;
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [mainRef],
  );

  const handleViewRequestDetails = useCallback(
    (request: any) => {
      setSelectedRequest(request);
      setShowTripDetails(true);
      const mainEl = mainRef.current;
      if (mainEl) {
        mainEl.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [mainRef],
  );

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      if (!userId) return;

      // Need organization to add/remove favorites
      if (!effectiveOrgId && isSuperadmin) {
        toast.error(t('driver.selectOrgForFavorite', 'Select an organization first'));
        return;
      }

      // Optimistic update
      const wasFavorite = optimisticFavoriteIds.has(id);
      const newSet = new Set(optimisticFavoriteIds);
      if (wasFavorite) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      setOptimisticFavoriteIds(newSet);

      try {
        if (wasFavorite) {
          await removeFavorite({ userId, driverId: id as Id<'drivers'> });
          toast.success(t('driver.removedFromFavorites', 'Removed from favorites'));
        } else {
          await addFavorite({
            organizationId: effectiveOrgId,
            userId,
            driverId: id as Id<'drivers'>,
          });
          toast.success(t('driver.addedToFavorites', 'Added to favorites'));
        }
      } catch (e: unknown) {
        setOptimisticFavoriteIds(optimisticFavoriteIds);
        toast.error(e instanceof Error ? e.message : t('driver.failed', 'Failed'));
      }
    },
    [userId, effectiveOrgId, isSuperadmin, optimisticFavoriteIds, addFavorite, removeFavorite, t],
  );

  const handleRequestDriver = useCallback(() => {
    setSelectedDriverId(null);
    setShowRequestWizard(true);
  }, []);

  const handleOpenRegisterModal = useCallback(() => {
    setShowSelectDriverModal(true);
  }, []);

  const handleSelectDriver = useCallback(
    (driver: { _id: Id<'users'>; name: string; email: string; phone?: string }) => {
      setSelectedDriverCandidate(driver);
      setShowSelectDriverModal(false);
      setShowRegisterModal(true);
    },
    [],
  );

  const handleRegisterSubmit = useCallback(
    async (data: {
      vehicleMake: string;
      vehicleModel: string;
      vehicleYear: string;
      vehicleColor: string;
      licensePlate: string;
      maxPassengers: number;
      vehicleType: string;
      notes?: string;
      availability: {
        monday: boolean;
        tuesday: boolean;
        wednesday: boolean;
        thursday: boolean;
        friday: boolean;
        saturday: boolean;
        sunday: boolean;
      };
      maxTripsPerDay?: number;
    }) => {
      if (!userId || !effectiveOrgId || !selectedDriverCandidate) return;
      try {
        await registerAsDriver({
          userId: selectedDriverCandidate._id,
          organizationId: effectiveOrgId,
          adminId: userId, // Admin is registering the driver
          vehicleInfo: {
            model: data.vehicleMake || '',
            year: data.vehicleYear ? parseInt(data.vehicleYear) : 2024,
            color: data.vehicleColor || '',
            plateNumber: data.licensePlate || '',
            capacity: data.maxPassengers || 4,
          },
          workingHours: {
            startTime: '09:00',
            endTime: '18:00',
            workingDays: [1, 2, 3, 4, 5],
          },
          maxTripsPerDay: data.maxTripsPerDay || 3,
        });
        toast.success(t('driver.registered', 'Registered as driver!'));
        setShowRegisterModal(false);
        setSelectedDriverCandidate(null);
      } catch (e: unknown) {
        toast.error(
          e instanceof Error ? e.message : t('driver.failedToRegister', 'Failed to register'),
        );
      }
    },
    [userId, effectiveOrgId, selectedDriverCandidate, registerAsDriver, t],
  );

  const noOp = useCallback(() => {}, []);
  const closeModal = useCallback(() => {
    setShowRequestWizard(false);
    setSelectedDriverId(null);
  }, []);
  const closeRegisterModal = useCallback(() => setShowRegisterModal(false), []);

  // ═══════════════════════════════════════════════════════════════════════════
  // NOW EARLY RETURNS ARE SAFE (all hooks are above)
  // ═══════════════════════════════════════════════════════════════════════════

  // Use effect to set current time once (avoids impure function in render)
  const [currentTime] = useState(() => Date.now());
  const tripModalTime = currentTime;

  // Superadmin can view without org selected (shows all drivers)
  // Regular users must have org
  if (
    !isAuthenticated ||
    !userId ||
    (!shouldFilterByOrg && !isSuperadmin) ||
    driverRecord === undefined ||
    availableDrivers === undefined ||
    myRequests === undefined ||
    favoriteDrivers === undefined ||
    recurringTrips === undefined
  ) {
    return (
      <div className="flex items-center justify-center h-full min-h-100">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  if (driverRecord && user?.role !== 'admin' && user?.role !== 'superadmin') {
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <DriverBookingPage
        drivers={drivers}
        activeRequests={activeRequests}
        historyRequests={historyRequests}
        recurringTrips={recurringData}
        favoriteIds={favoriteIds}
        stats={stats}
        searchQuery={searchQuery}
        capacityFilter={capacityFilter}
        sortBy={sortBy}
        onSearchChange={setSearchQuery}
        onCapacityChange={setCapacityFilter}
        onSortChange={setSortBy}
        onBook={handleBook}
        onCalendar={(id: string) => {
          setSelectedDriverId(id);
          setShowCalendarDialog(true);
        }}
        onToggleFavorite={handleToggleFavorite}
        onRequestDriver={handleRequestDriver}
        onViewRequestDetails={handleViewRequestDetails}
        onRateRequest={noOp}
        onEditRequest={noOp}
        onDeleteRequest={noOp}
        onCancelRequest={noOp}
        onToggleRecurring={noOp}
        onDeleteRecurring={noOp}
        onRegisterAsDriver={handleOpenRegisterModal}
        canRegisterDrivers={user?.role === 'admin'}
      />

      {showRequestWizard &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-(--card) rounded-2xl border border-(--border) shadow-2xl">
              <div className="p-6 border-b border-(--border) flex items-center justify-between">
                <h2 className="text-xl font-bold">{t('driver.requestDriver', 'Request Driver')}</h2>
                <button
                  onClick={closeModal}
                  className="p-2 rounded-lg hover:bg-(--background-subtle) transition-colors"
                >
                  ✕
                </button>
              </div>
              <RequestDriverWizard userId={userId!} onComplete={closeModal} onCancel={closeModal} />
            </div>
          </div>,
          document.body,
        )}

      {showSelectDriverModal && (
        <SelectDriverModal
          candidates={(driverCandidates ?? []).map((c) => ({
            _id: c._id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            department: c.department,
            position: c.position,
          }))}
          onSelect={handleSelectDriver}
          onClose={() => setShowSelectDriverModal(false)}
        />
      )}

      {showRegisterModal && selectedDriverCandidate && (
        <RegisterDriverModal
          userName={selectedDriverCandidate.name}
          userEmail={selectedDriverCandidate.email}
          userPhone={selectedDriverCandidate.phone}
          onSubmit={handleRegisterSubmit}
          onClose={closeRegisterModal}
        />
      )}

      {showCalendarDialog && effectiveOrgId && (
        <div className="fixed inset-0 z-[9999]">
          <DriverCalendarDialog
            open={showCalendarDialog}
            onClose={() => setShowCalendarDialog(false)}
            driverId={selectedDriverId}
            organizationId={effectiveOrgId}
            role={user?.role as 'admin' | 'driver'}
          />
        </div>
      )}

      {showTripDetails &&
        selectedRequest &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
            onClick={() => {
              setShowTripDetails(false);
              setSelectedRequest(null);
            }}
          >
            <div
              className="w-full max-w-3xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: '85vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <TripDetailsModal
                schedule={{
                  type: 'trip',
                  status: selectedRequest.status,
                  startTime: selectedRequest.startTime || tripModalTime,
                  endTime: selectedRequest.startTime
                    ? selectedRequest.startTime + 3600000
                    : tripModalTime + 3600000,
                  tripInfo: selectedRequest.tripInfo || {},
                  userName: selectedRequest.assignedDriver?.userName,
                }}
                currentTime={tripModalTime}
                onClose={() => {
                  setShowTripDetails(false);
                  setSelectedRequest(null);
                }}
                userId={userId!}
                isAdmin={user?.role === 'admin' || user?.role === 'superadmin'}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
