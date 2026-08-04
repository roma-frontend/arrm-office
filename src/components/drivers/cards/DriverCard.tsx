'use client';

import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Car, Users, MapPin, Star, Calendar, Heart } from 'lucide-react';

interface DriverCardProps {
  driver: {
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
  };
  isFavorite: boolean;
  onBook: (driverId: string) => void;
  onCalendar: (driverId: string) => void;
  onToggleFavorite: (driverId: string) => void;
}

export const DriverCard = memo(function DriverCard({
  driver,
  isFavorite,
  onBook,
  onCalendar,
  onToggleFavorite,
}: DriverCardProps) {
  const { t } = useTranslation();
  const initials =
    driver.userName
      ?.split(' ')
      .map((n: string) => n[0])
      .join('') ?? '?';

  return (
    <Card className="drivers-card-hover relative overflow-hidden border-(--border) group">
      {/* Gradient top border on hover */}
      <div className="absolute top-0 left-0 right-0 h-0.75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <CardContent className="pt-6 relative z-10">
        <div className="flex flex-col items-start gap-4">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="w-12 h-12 ring-2 ring-transparent group-hover:ring-(--primary)/30 transition-all duration-300">
              {driver.userAvatar && <AvatarImage src={driver.userAvatar} />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            {driver.isOnShift && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-(--card) drivers-dot-pulse" />
            )}
          </div>

          {/* Driver Info */}
          <div className="flex-1">
            <h3 className="font-semibold group-hover:text-(--primary) transition-colors duration-200">
              {driver.userName}
            </h3>
            {driver.userPosition && (
              <p className="text-sm text-(--text-muted)">{driver.userPosition}</p>
            )}
            <div className="flex items-center gap-1 mt-2">
              <Star className="w-4 h-4 fill-yellow-500 text-yellow-500 drivers-icon-target" />
              <span className="text-sm font-medium text-yellow-500">
                {driver.rating.toFixed(1)}
              </span>
              <span className="text-xs text-(--text-muted)">
                ({driver.totalTrips} {t('driver.trips', 'trips')})
              </span>
            </div>
          </div>
        </div>

        {/* Vehicle Info */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-(--background-subtle)/50">
            <Car className="w-4 h-4 text-(--primary)" />
            <span>{driver.vehicleInfo.model}</span>
          </div>
          <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-(--background-subtle)/50">
            <Users className="w-4 h-4 text-(--primary)" />
            <span>
              {driver.vehicleInfo.capacity} {t('driver.seats', 'seats')}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-(--background-subtle)/50">
            <MapPin className="w-4 h-4 text-(--primary)" />
            <span className="font-mono">{driver.vehicleInfo.plateNumber}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-4 ">
          <Button
            size="sm"
            onClick={() => onBook(driver._id)}
            className="flex-1 drivers-btn-hover btn-gradient text-white font-medium shadow-md hover:shadow-lg"
          >
            {t('driver.book', 'Book')}
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCalendar(driver._id)}
              // Icon-only button: it needs an accessible name, and the testid
              // gives the e2e suite a selector that survives translation.
              aria-label={t('driver.viewCalendar', 'View Calendar')}
              data-testid="driver-calendar-button"
            >
              <Calendar className="w-4 h-4 text-blue-400" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => driver._id && onToggleFavorite(driver._id)}
              className="relative"
            >
              <Heart
                key={String(isFavorite)}
                className={`w-4 h-4 transition-all duration-200 ${
                  isFavorite
                    ? 'fill-red-500 text-red-500 scale-110'
                    : 'text-muted-foreground scale-100'
                }`}
              />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
