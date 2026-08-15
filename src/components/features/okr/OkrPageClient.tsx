'use client';

import { Target } from 'lucide-react';
import ModuleSeoPage from '@/components/features/ModuleSeoPage';

export default function OkrPageClient() {
  return (
    <ModuleSeoPage
      module="okr"
      icon={<Target className="w-6 h-6" />}
      color="#f59e0b"
      gradient="linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(251,191,36,0.06) 100%)"
    />
  );
}
