/**
 * AvailableDriversSection - Section with driver search, filters, and cards
 */

'use client';

import React, { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CarFront, Search, Filter, SortAsc, Heart } from 'lucide-react';
import { DriverCard } from '../cards/DriverCard';
import { NoDriversEmptyState } from '../empty-states/NoDriversEmptyState';

interface Driver {
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

interface AvailableDriversSectionProps {
  drivers: Driver[];
  favoriteIds: Set<string>;
  searchQuery: string;
  capacityFilter: number | null;
  sortBy: 'rating' | 'name' | 'availability';
  onSearchChange: (value: string) => void;
  onCapacityChange: (value: number | null) => void;
  onSortChange: (value: 'rating' | 'name' | 'availability') => void;
  onBook: (driverId: string) => void;
  onCalendar: (driverId: string) => void;
  onToggleFavorite: (driverId: string) => void;
  onRequestDriver: () => void;
}

export const AvailableDriversSection = memo(function AvailableDriversSection({
  drivers,
  favoriteIds,
  searchQuery,
  capacityFilter,
  sortBy,
  onSearchChange,
  onCapacityChange,
  onSortChange,
  onBook,
  onCalendar,
  onToggleFavorite,
  onRequestDriver,
}: AvailableDriversSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const filteredDrivers = useMemo(() => {
    let filtered = [...drivers];

    if (searchQuery) {
      filtered = filtered.filter((d) =>
        d.userName?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (capacityFilter) {
      filtered = filtered.filter((d) => d.vehicleInfo.capacity >= capacityFilter);
    }

    filtered.sort((a, b) => {
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'name') return (a.userName ?? '').localeCompare(b.userName ?? '');
      if (sortBy === 'availability') return (b.isOnShift ? 1 : 0) - (a.isOnShift ? 1 : 0);
      return 0;
    });

    return filtered;
  }, [drivers, searchQuery, capacityFilter, sortBy]);

  return (
    <Card className="mb-6 sm:mb-8 border-(--border)">
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <CarFront className="w-4 h-4 sm:w-5 sm:h-5 text-(--primary)" />
                  <span className="hidden sm:inline">
                    {t('driver.availableDrivers', 'Available Drivers')}
                  </span>
                  <span className="sm:hidden">{t('driver.availableDrivers', 'Drivers')}</span>
                </CardTitle>
                <CardDescription className="hidden sm:block">
                  {t('driver.availableDriversDesc', 'Browse and book drivers')}
                </CardDescription>
              </div>
              {favoriteIds.size > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/drivers/favorites')}
                  className="gap-1.5 h-8 text-xs rounded-xl hover:bg-(--danger-quiet) hover:text-(--danger-text) transition-all p-1.5 sm:p-0"
                >
                  <Heart className="w-3.5 h-3.5 fill-red-500 text-(--danger-text)" />
                  <span className="hidden sm:inline">
                    {t('driver.favorites.title', 'Favorites')}
                  </span>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-(--danger-quiet) text-(--danger-text) text-[10px] font-bold">
                    {favoriteIds.size}
                  </span>
                </Button>
              )}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
              <Input
                placeholder={t('driver.searchDriver', 'Search driver...')}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 w-full"
                style={{ borderRadius: '1rem', background: 'var(--background-subtle)' }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-(--text-muted)" />
            <Select
              value={String(capacityFilter ?? 0)}
              onValueChange={(v) => onCapacityChange(v === '0' ? null : Number(v))}
            >
              <SelectTrigger
                className="w-full sm:w-[140px] h-8 text-xs"
                style={{ borderRadius: '0.75rem' }}
              >
                <SelectValue placeholder={t('driver.minSeats', 'Min seats')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t('driver.anyCapacity', 'Any capacity')}</SelectItem>
                <SelectItem value="2">{t('driver.seats2Plus', '2+ seats')}</SelectItem>
                <SelectItem value="4">{t('driver.seats4Plus', '4+ seats')}</SelectItem>
                <SelectItem value="6">{t('driver.seats6Plus', '6+ seats')}</SelectItem>
                <SelectItem value="8">{t('driver.seats8Plus', '8+ seats')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={onSortChange}>
              <SelectTrigger
                className="w-full sm:w-[130px] h-8 text-xs"
                style={{ borderRadius: '0.75rem' }}
              >
                <SortAsc className="w-3 h-3 mr-1 hidden sm:inline" />
                <SelectValue placeholder={t('driver.sortBy', 'Sort by')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rating">{t('driver.byRating', 'By Rating')}</SelectItem>
                <SelectItem value="name">{t('driver.byName', 'By Name')}</SelectItem>
                <SelectItem value="availability">
                  {t('driver.byAvailability', 'By Availability')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredDrivers.length > 0 ? (
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 drivers-stagger">
            {filteredDrivers.map((driver) => (
              <DriverCard
                key={driver._id}
                driver={driver}
                isFavorite={favoriteIds.has(driver._id)}
                onBook={onBook}
                onCalendar={onCalendar}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <NoDriversEmptyState
            onAction={onRequestDriver}
            actionLabel={t('driver.requestDriver', 'Request Driver')}
          />
        )}
      </CardContent>
    </Card>
  );
});
