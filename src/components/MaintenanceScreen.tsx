'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { Wrench, Clock, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/date-format';

export function MaintenanceScreen({ forceShow = false }: { forceShow?: boolean }) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [countdownTime, setCountdownTime] = useState<string>('');

  // Get organizationId from user store, URL params, or localStorage
  const userOrgId = user?.organizationId;
  const urlOrgId =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('org') : null;
  const storedOrgId =
    typeof window !== 'undefined' ? localStorage.getItem('lastOrganizationId') : null;
  const organizationId = userOrgId || urlOrgId || storedOrgId;

  // Store organization ID on mount for use after logout
  useEffect(() => {
    if (userOrgId && typeof window !== 'undefined') {
      localStorage.setItem('lastOrganizationId', userOrgId);
    }
  }, [userOrgId]);

  // Fetch maintenance mode status
  const maintenance = useQuery(
    api.admin.getMaintenanceMode,
    organizationId ? { organizationId: organizationId as Id<'organizations'> } : 'skip',
  );

  // Update countdown timer
  useEffect(() => {
    if (!maintenance?.isActive) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const startTime = maintenance.startTime;
      const endTime =
        maintenance.endTime ||
        startTime +
          (maintenance.estimatedDuration
            ? calculateDuration(maintenance.estimatedDuration)
            : 3600000);

      if (now >= endTime) {
        setCountdownTime('Обслуживание завершено...');
        clearInterval(interval);
      } else {
        const remaining = endTime - now;
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        if (hours > 0) {
          setCountdownTime(`${hours}ч ${minutes}м`);
        } else if (minutes > 0) {
          setCountdownTime(`${minutes}м ${seconds}с`);
        } else {
          setCountdownTime(`${seconds}с`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    maintenance?.isActive,
    maintenance?.startTime,
    maintenance?.endTime,
    maintenance?.estimatedDuration,
  ]);

  const isForcedMaintenancePage =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('maintenance') === 'true';
  const now = Date.now();
  const maintenanceStarted =
    maintenance?.isActive && maintenance?.startTime && now >= maintenance.startTime;
  const shouldShow =
    forceShow ||
    isForcedMaintenancePage ||
    (maintenanceStarted && user && user.role !== 'superadmin');

  // Reset opacity in case useMaintenanceAutoLogout set it to 0 before redirect
  useEffect(() => {
    if (shouldShow) {
      document.documentElement.style.transition = 'none';
      document.documentElement.style.opacity = '1';
    }
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  const maintenanceIcon = maintenance?.icon || '🔧';
  const maintenanceTitle = maintenance?.title || 'Техническое обслуживание';
  const maintenanceMessage =
    maintenance?.message || 'Система находится на техническом обслуживании. Пожалуйста, подождите.';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        overflowY: 'auto',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#f1f5f9',
      }}
    >
      {/* Animated background gradient */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '25%',
            width: 384,
            height: 384,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(249,115,22,0.15), transparent)',
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: '25%',
            width: 384,
            height: 384,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(239,68,68,0.15), transparent)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      {/* Main content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          maxWidth: 512,
          margin: '0 auto',
          padding: '48px 24px',
          textAlign: 'center',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Icon with animation */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              animation: 'bounce 2s infinite',
            }}
          >
            {maintenanceIcon}
          </div>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16, color: '#ffffff' }}>
          Техническое обслуживание
        </h1>

        {/* Maintenance message */}
        <div
          style={{
            marginBottom: 24,
            padding: 24,
            borderRadius: 12,
            borderLeft: '4px solid #f97316',
            background: 'rgba(255,255,255,0.05)',
            textAlign: 'left',
          }}
        >
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.6,
              marginBottom: 12,
              color: '#ffffff',
              fontWeight: 600,
            }}
          >
            {maintenanceTitle}
          </p>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>{maintenanceMessage}</p>
        </div>

        {/* Maintenance details */}
        {maintenance?.startTime && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 32,
              width: '100%',
            }}
          >
            <div style={{ padding: 16, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  color: '#94a3b8',
                }}
              >
                <Clock style={{ width: 16, height: 16 }} />
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                  }}
                >
                  Начало
                </span>
              </div>
              <p style={{ fontWeight: 600, color: '#ffffff' }}>
                {formatDateTime(maintenance.startTime, i18n.language, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            <div style={{ padding: 16, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                  color: '#94a3b8',
                }}
              >
                <Wrench style={{ width: 16, height: 16 }} />
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                  }}
                >
                  Длительность
                </span>
              </div>
              <p style={{ fontWeight: 600, color: '#ffffff' }}>
                {maintenance.estimatedDuration || 'Не указана'}
              </p>
            </div>
          </div>
        )}

        {/* Countdown timer */}
        {countdownTime && (
          <div
            style={{
              marginBottom: 32,
              padding: 24,
              borderRadius: 12,
              background: 'rgba(249,115,22,0.1)',
              border: '1px solid rgba(249,115,22,0.3)',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 8,
                color: '#f97316',
              }}
            >
              <Clock style={{ width: 20, height: 20 }} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Оставшееся время
              </span>
            </div>
            <p style={{ fontSize: 32, fontWeight: 700, color: '#f97316' }}>{countdownTime}</p>
          </div>
        )}

        {/* Info message */}
        <div
          style={{
            marginBottom: 32,
            padding: 16,
            borderRadius: 8,
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.3)',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#60a5fa',
            }}
          >
            <Eye style={{ width: 16, height: 16 }} />
            <p style={{ fontSize: 14 }}>
              Система на обслуживании. Страница обновится автоматически.
            </p>
          </div>
        </div>

        {/* Contact info */}
        <div style={{ color: '#94a3b8', fontSize: 14 }}>
          <p>Спасибо за терпение</p>
          <p style={{ marginTop: 8, fontSize: 12 }}>
            Если у вас есть вопросы, обратитесь к администратору
          </p>
        </div>

        {/* Sign Out button */}
        <div style={{ marginTop: 32 }}>
          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              background: 'linear-gradient(to right, #f97316, #ea580c)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Выход
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}

function calculateDuration(duration: string | undefined): number {
  if (!duration) return 3600000;
  const match = duration.match(/(\d+)/);
  const amount = match ? parseInt(match[1] || '1') : 1;
  if (duration.includes('hour')) return amount * 3600000;
  if (duration.includes('minute')) return amount * 60000;
  return 3600000;
}
