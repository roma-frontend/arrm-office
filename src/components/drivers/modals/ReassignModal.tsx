'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Users, Car, Search, CheckCircle2, X, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ReassignModalProps {
  currentDriverName: string;
  currentDriverAvatar?: string;
  availableDrivers: Array<{
    _id: string;
    userName: string;
    avatarUrl?: string;
    rating?: number;
    vehicleInfo?: string;
    isAvailable?: boolean;
  }>;
  onReassign: (driverId: string) => Promise<void>;
  onClose: () => void;
}

export function ReassignModal({
  currentDriverName,
  currentDriverAvatar,
  availableDrivers,
  onReassign,
  onClose,
}: ReassignModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredDrivers = availableDrivers.filter((driver) =>
    driver.userName?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleReassign = async () => {
    if (!selectedDriverId) return;
    setIsSubmitting(true);
    try {
      await onReassign(selectedDriverId);
      onClose();
    } catch (error) {
      console.error('Failed to reassign:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-lg bg-(--card) rounded-2xl border border-(--border) shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {t('driver.reassignDriver', 'Reassign Driver')}
              </h2>
              <p className="text-white/80 text-sm mt-0.5">
                {t('driver.reassignDesc', 'Choose a new driver for this trip')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Current Driver */}
          <div className="p-4 rounded-xl bg-(--background-subtle) border border-(--border)">
            <p className="text-xs font-medium text-(--text-muted) mb-2">
              {t('driver.currentDriver', 'Current Driver')}
            </p>
            <div className="flex items-center gap-3">
              <Avatar className="w-10 h-10">
                {currentDriverAvatar && <AvatarImage src={currentDriverAvatar} />}
                <AvatarFallback className="text-xs">
                  {currentDriverName
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{currentDriverName}</p>
              </div>
              <X className="w-4 h-4 text-(--text-muted)" />
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="p-2 rounded-full bg-(--primary)/10">
              <CheckCircle2 className="w-5 h-5 text-(--primary)" />
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted)" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('driver.searchDrivers', 'Search drivers...')}
              className="pl-10 border-(--border) bg-(--input)"
            />
          </div>

          {/* Available Drivers */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            <AnimatePresence>
              {filteredDrivers.map((driver) => (
                <motion.button
                  key={driver._id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onClick={() => setSelectedDriverId(driver._id)}
                  className={`w-full p-3 rounded-xl border transition-all duration-200 text-left ${
                    selectedDriverId === driver._id
                      ? 'border-(--primary) bg-(--primary)/5 shadow-sm'
                      : 'border-(--border) bg-(--background-subtle) hover:border-(--primary)/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        {driver.avatarUrl && <AvatarImage src={driver.avatarUrl} />}
                        <AvatarFallback className="text-xs">
                          {driver.userName
                            ?.split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      {driver.isAvailable && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-(--card)" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{driver.userName}</p>
                      {driver.vehicleInfo && (
                        <p className="text-xs text-(--text-muted) flex items-center gap-1">
                          <Car className="w-3 h-3" />
                          {driver.vehicleInfo}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {driver.rating && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {driver.rating.toFixed(1)}
                        </Badge>
                      )}
                      {selectedDriverId === driver._id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-5 h-5 rounded-full bg-(--primary) flex items-center justify-center"
                        >
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {filteredDrivers.length === 0 && (
            <div className="text-center py-6 text-(--text-muted)">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('driver.noDriversFound', 'No drivers found')}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>
              {t('driver.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleReassign}
              disabled={!selectedDriverId || isSubmitting}
              className="flex-1 gap-2"
            >
              <Users className="w-4 h-4" />
              {isSubmitting
                ? t('driver.reassigning', 'Reassigning...')
                : t('driver.reassign', 'Reassign')}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
