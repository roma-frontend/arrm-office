'use client';

import { useTranslation } from 'react-i18next';
import React from 'react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Zap } from 'lucide-react';

interface FocusModeIndicatorProps {
  enabled: boolean;
  workHoursStart?: string;
  workHoursEnd?: string;
}

export default function FocusModeIndicator({
  enabled,
  workHoursStart = '09:00',
  workHoursEnd = '18:00',
}: FocusModeIndicatorProps) {
  const { t } = useTranslation();
  const [isWithinWorkHours, setIsWithinWorkHours] = React.useState(false);

  React.useEffect(() => {
    const checkWorkHours = () => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setIsWithinWorkHours(currentTime >= workHoursStart && currentTime <= workHoursEnd);
    };

    checkWorkHours();
    const interval = setInterval(checkWorkHours, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [workHoursStart, workHoursEnd]);

  const isActive = enabled && isWithinWorkHours;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 right-6 z-50"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-linear-to-r from-purple-500 to-pink-500 text-white shadow-lg">
            <Zap className="w-4 h-4 animate-pulse" />
            <span className="text-sm font-medium">{t('productivity.focusModeActive')}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
