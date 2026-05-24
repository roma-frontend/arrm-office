'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Shield, Timer } from 'lucide-react';
import { SmartBanner } from '@/components/ui/SmartBanner';
import { useAuthStore } from '@/store/useAuthStore';

interface DashboardBannersProps {
  /** Leave balances from Convex user data */
  paidLeaveBalance?: number;
  sickLeaveBalance?: number;
  familyLeaveBalance?: number;
  /** User's createdAt timestamp — to detect first-time login */
  userCreatedAt?: number;
  /** Last login timestamp */
  lastLoginAt?: number;
}

export function DashboardBanners({
  paidLeaveBalance,
  sickLeaveBalance,
  familyLeaveBalance,
  userCreatedAt,
  lastLoginAt,
}: DashboardBannersProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();

  // ── 1. Success banner after login ─────────────────────────────────────────
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const justLoggedIn = sessionStorage.getItem('just_logged_in');
      if (justLoggedIn === 'true') {
        setShowLoginSuccess(true);
        sessionStorage.removeItem('just_logged_in');
      }
    }
  }, []);

  // ── 2. Suspicious login warning ───────────────────────────────────────────
  const [showSuspiciousLogin, setShowSuspiciousLogin] = useState(false);
  const [suspiciousDetails, setSuspiciousDetails] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const suspicious = sessionStorage.getItem('suspicious_login');
      if (suspicious) {
        setShowSuspiciousLogin(true);
        setSuspiciousDetails(suspicious);
        sessionStorage.removeItem('suspicious_login');
      }
    }
  }, []);

  // ── 3. Session expiry countdown ───────────────────────────────────────────
  const [showSessionExpiry, setShowSessionExpiry] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(5);

  useEffect(() => {
    // Check session expiry every 60 seconds
    const checkSession = () => {
      if (typeof window === 'undefined') return;
      const cookieStr = document.cookie;
      const sessionCookie = cookieStr.split('; ').find((c) => c.startsWith('session_expiry='));

      if (sessionCookie) {
        const expiryStr = sessionCookie.split('=')[1];
        if (!expiryStr) return;
        const expiry = parseInt(expiryStr, 10);
        const remaining = expiry - Date.now();
        const minutesLeft = Math.ceil(remaining / 60000);

        if (minutesLeft <= 5 && minutesLeft > 0) {
          setSessionMinutes(minutesLeft);
          setShowSessionExpiry(true);
        } else {
          setShowSessionExpiry(false);
        }
      }
    };

    checkSession();
    const interval = setInterval(checkSession, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleExtendSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/refresh-session', { method: 'POST' });
      if (res.ok) {
        setShowSessionExpiry(false);
      }
    } catch {
      // If refresh fails, session will expire naturally
    }
  }, []);

  // ── 4. Welcome banner for new employees ───────────────────────────────────
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !userCreatedAt) return;

    // Show welcome if account created within last 24 hours
    // AND user hasn't dismissed it before
    const ageMs = Date.now() - userCreatedAt;
    const isNewUser = ageMs < 24 * 60 * 60 * 1000;
    const dismissed = localStorage.getItem('welcome_banner_dismissed');

    if (isNewUser && !dismissed) {
      setShowWelcome(true);
    }
  }, [userCreatedAt]);

  const handleDismissWelcome = useCallback(() => {
    setShowWelcome(false);
    localStorage.setItem('welcome_banner_dismissed', 'true');
  }, []);

  // ── 5. Leave balance warning ──────────────────────────────────────────────
  const lowBalances: string[] = [];
  if (paidLeaveBalance !== undefined && paidLeaveBalance <= 2) {
    lowBalances.push(t('dashboard.paidLeaveBalance', { count: paidLeaveBalance }));
  }
  if (sickLeaveBalance !== undefined && sickLeaveBalance <= 2) {
    lowBalances.push(t('dashboard.sickLeaveBalance', { count: sickLeaveBalance }));
  }
  if (familyLeaveBalance !== undefined && familyLeaveBalance <= 1) {
    lowBalances.push(t('dashboard.familyLeaveBalance', { count: familyLeaveBalance }));
  }
  const showLeaveWarning = lowBalances.length > 0;

  // Don't render anything if no banners are active
  if (
    !showLoginSuccess &&
    !showSuspiciousLogin &&
    !showSessionExpiry &&
    !showWelcome &&
    !showLeaveWarning
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* 1. Login success — green */}
      {showLoginSuccess && (
        <SmartBanner
          type="success"
          message={t('banners.welcomeBack', { name: user?.name?.split(' ')[0] || '' })}
          suggestion={t('banners.productiveDay', 'Have a productive day ahead!')}
          autoDismiss={5000}
          onDismiss={() => setShowLoginSuccess(false)}
        />
      )}

      {/* 2. Suspicious login — warning/orange */}
      {showSuspiciousLogin && (
        <SmartBanner
          type="warning"
          message={t('banners.unusualLogin', 'Unusual login activity detected')}
          suggestion={
            suspiciousDetails ||
            t(
              'banners.loginWarning',
              'This login was from a new device or location. If this was not you, change your password immediately.',
            )
          }
          icon={<Shield className="w-5 h-5 text-amber-500" />}
          action={{
            label: t('banners.reviewSecurity', 'Review security settings'),
            onClick: () => router.push('/settings'),
          }}
          onDismiss={() => setShowSuspiciousLogin(false)}
        />
      )}

      {/* 3. Session expiry countdown — orange */}
      {showSessionExpiry && (
        <SmartBanner
          type="warning"
          message={t('banners.sessionExpires', {
            minutes: sessionMinutes,
            plural: sessionMinutes > 1 ? 's' : '',
          })}
          suggestion={t(
            'banners.saveWork',
            'Save your work and extend your session to avoid losing changes.',
          )}
          icon={<Timer className="w-5 h-5 text-amber-500" />}
          dismissable={false}
          action={{
            label: t('banners.extendSession', 'Extend session'),
            onClick: handleExtendSession,
          }}
        />
      )}

      {/* 4. Welcome banner for new employees — purple */}
      {showWelcome && (
        <SmartBanner
          type="purple"
          message={t(
            'banners.welcomeTeam',
            'Welcome to the team! We are excited to have you here.',
          )}
          suggestion={t(
            'banners.exploreDashboard',
            'Start by exploring the dashboard, setting up your profile, and checking your leave balances.',
          )}
          action={{
            label: t('banners.setUpProfile', 'Set up your profile'),
            onClick: () => router.push('/settings'),
          }}
          onDismiss={handleDismissWelcome}
        />
      )}

      {/* 5. Leave balance warning — orange */}
      {showLeaveWarning && (
        <SmartBanner
          type="warning"
          message={t('banners.leaveBalanceLow', 'Your leave balance is running low')}
          suggestion={lowBalances.join(' / ')}
          action={{
            label: t('banners.viewLeaveHistory', 'View leave history'),
            onClick: () => router.push('/leaves'),
          }}
          autoDismiss={15000}
        />
      )}
    </div>
  );
}
