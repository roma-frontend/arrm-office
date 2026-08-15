'use client';

import { Car } from 'lucide-react';
import ModuleSeoPage from '@/components/features/ModuleSeoPage';

export default function DriversPageClient() {
  return (
    <ModuleSeoPage
      module="drivers"
      icon={<Car className="w-6 h-6" />}
      color="#f97316"
      gradient="linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(251,146,60,0.06) 100%)"
    />
  );
}
