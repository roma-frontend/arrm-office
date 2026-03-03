'use client';

import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useTranslation } from "react-i18next";

export default function Loading() {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <ShieldLoader 
        size="xl" 
        message="Loading your workspace..."
      />
    </div>
  );
}
