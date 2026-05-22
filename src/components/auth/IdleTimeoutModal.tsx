'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useAuthStore } from '@/store/useAuthStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, Clock, LogOut, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export function IdleTimeoutModal() {
  const { t } = useTranslation();
  const router = useRouter();
  const { logout: authLogout, user } = useAuthStore();
  const [showModal, setShowModal] = useState(false);

  const handleIdle = useCallback(() => {
    setShowModal(true);
  }, []);

  const handleActive = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      authLogout();
      toast.success(t('idleModal.loggedOut', 'Session ended successfully'));
      router.push('/login');
    } catch {
      toast.error(t('idleModal.logoutFailed', 'Failed to end session'));
    }
  }, [authLogout, router, t]);

  const handleExtendSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/refresh-session', { method: 'POST' });
      if (res.ok) {
        setShowModal(false);
        toast.success(t('idleModal.sessionExtended', 'Session extended successfully'));
      } else {
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  }, [handleLogout, t]);

  const { showWarning, countdownSeconds, extendSession, isLoggedOut } = useIdleTimer({
    idleTimeout: 15 * 60 * 1000,
    warningDuration: 2 * 60 * 1000,
    onIdle: handleIdle,
    onActive: handleActive,
    onLogout: handleLogout,
  });

  useEffect(() => {
    if (showWarning) {
      setShowModal(true);
    }
  }, [showWarning]);

  if (!showModal) return null;

  const isCountingDown = countdownSeconds > 0;
  const minutes = Math.floor(countdownSeconds / 60);
  const seconds = countdownSeconds % 60;

  return (
    <Dialog open={showModal} onOpenChange={(open) => !open && !isCountingDown && extendSession()}>
      <DialogContent className="sm:max-w-md" aria-describedby="idle-modal-description">
        <DialogHeader className="space-y-4">
          <div
            className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center border ${
              isCountingDown
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-blue-500/10 border-blue-500/30'
            }`}
          >
            {isCountingDown ? (
              <Clock className="w-8 h-8 text-amber-500 animate-pulse" />
            ) : (
              <Shield className="w-8 h-8 text-blue-500" />
            )}
          </div>
          <DialogTitle className="text-center text-xl font-semibold text-(--text-primary)">
            {isCountingDown
              ? t('idleModal.sessionExpiring', 'Session Expiring Soon')
              : t('idleModal.sessionExpired', 'Session Expired')}
          </DialogTitle>
          <DialogDescription
            id="idle-modal-description"
            className="text-center text-(--text-muted) space-y-2"
          >
            {isCountingDown ? (
              <>
                <p>
                  {t(
                    'idleModal.expiringMessage',
                    'You have been inactive for a while. Your session will expire in:',
                  )}
                </p>
                <div className="text-3xl font-mono font-bold text-amber-500 py-2">
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
                <p className="text-sm text-(--text-muted)">
                  {t('idleModal.expiringHint', 'Extend your session or you will be logged out.')}
                </p>
              </>
            ) : (
              <>
                <p>
                  {t(
                    'idleModal.expiredMessage',
                    'Your session has expired due to inactivity. Please log in again to continue.',
                  )}
                </p>
                {user?.name && (
                  <p className="text-sm text-(--text-secondary)">
                    {t('idleModal.welcomeBack', 'Welcome back, {{name}}', {
                      name: user.name.split(' ')[0],
                    })}
                  </p>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-4">
          {isCountingDown ? (
            <>
              <Button
                onClick={extendSession}
                className="w-full btn-gradient text-white font-medium py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('idleModal.extendSession', 'Extend Session')}
              </Button>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full border-(--border) text-(--text-secondary) hover:bg-(--background-subtle) hover:text-(--text-primary) font-medium py-2.5 rounded-xl transition-all duration-200"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t('idleModal.logoutNow', 'Logout Now')}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => router.push('/login')}
              className="w-full btn-gradient text-white font-medium py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('idleModal.loginAgain', 'Log In Again')}
            </Button>
          )}
        </div>

        <div className="pt-2 text-center">
          <p className="text-xs text-(--text-muted)">
            {t(
              'idleModal.securityNote',
              'For your security, inactive sessions are automatically terminated.',
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
