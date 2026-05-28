'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useRouter } from 'next/navigation';
import { logger } from '../logger';

interface WithOnboardingCheckProps {
  children: React.ReactNode;
}

export function withOnboardingCheck<P extends object>(WrappedComponent: React.ComponentType<P>) {
  return function WithOnboardingCheck(props: P) {
    const { user, needsOnboarding } = useAuthStore();
    const router = useRouter();
    const isOnboardingPage =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/onboarding');

    // If user needs onboarding and not already on onboarding page
    if (user && needsOnboarding && !isOnboardingPage) {
      // Redirect immediately
      if (typeof window !== 'undefined') {
        logger.log('[withOnboardingCheck] 🚨 Redirecting to onboarding');
        router.push('/onboarding/select-organization');
      }

      // Show loader during redirect
      return (
        <div className="flex h-screen items-center justify-center bg-(--background)">
          <ShieldLoader size="lg" />
        </div>
      );
    }

    // Render wrapped component
    return <WrappedComponent {...props} />;
  };
}
