'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useParams, useRouter } from 'next/navigation';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useAuthStore } from '@/store/useAuthStore';
import {
  Shield,
  ArrowLeft,
  Ban,
  CheckCircle,
  AlertTriangle,
  Clock,
  MapPin,
  Monitor,
} from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Image from 'next/image';

export default function SecurityAlertDetailClient() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const userId = (params.userId as string) || '';
  const safeUserId = userId && userId !== '' ? (userId as Id<'users'>) : null;

  const [suspendDuration, setSuspendDuration] = useState(24);
  const [suspendReason, setSuspendReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const suspiciousUser = useQuery(
    api.users.queries.getUserById,
    user?.id && safeUserId ? { userId: safeUserId, requesterId: user.id as Id<'users'> } : 'skip',
  );

  const recentAttempts = useQuery(
    api.security.getLoginAttemptsByUser,
    safeUserId ? { userId: safeUserId, limit: 10 } : 'skip',
  );

  const suspendUserMutation = useMutation(api.users.admin.suspendUser);
  const unsuspendUserMutation = useMutation(api.users.admin.unsuspendUser);

  if (!user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <ShieldLoader size="lg" message="Loading security details..." />
      </div>
    );
  }

  const isSuperadmin = user.role === 'superadmin';

  if (!isSuperadmin) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <div className="text-center">
          <Shield className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--destructive)' }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Access Denied
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>Only superadmin can access this page</p>
        </div>
      </div>
    );
  }

  if (!suspiciousUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ShieldLoader size="lg" message="Loading security details..." />
      </div>
    );
  }

  const handleSuspend = async () => {
    if (!safeUserId) return;
    if (!suspendReason.trim()) {
      toast.error('Please provide a reason for suspension');
      return;
    }

    setIsProcessing(true);
    try {
      await suspendUserMutation({
        userId: safeUserId,
        reason: suspendReason,
        duration: suspendDuration,
      });

      toast.success(`User suspended for ${suspendDuration} hours`);
      setSuspendReason('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to suspend user';
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!safeUserId) return;
    setIsProcessing(true);
    try {
      await unsuspendUserMutation({
        userId: safeUserId,
      });

      toast.success(t('toasts.userUnsuspended'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to unsuspend user';
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getRiskLabel = (score?: number) => {
    if (!score) return 'Unknown';
    if (score >= 80) return 'HIGH RISK';
    if (score >= 50) return 'MODERATE';
    return 'LOW';
  };

  const getRiskStyle = (score?: number) => {
    if (!score) return { color: 'var(--text-muted)' };
    if (score >= 80) return { color: 'var(--destructive)' };
    if (score >= 50) return { color: 'var(--warning)' };
    return { color: 'var(--success)' };
  };

  return (
    <div className="min-h-screen p-6" style={{ background: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/superadmin/security')}
            className="flex items-center gap-2 text-sm mb-4 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Security Center
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {t('security.securityAlertDetails')}
              </h1>
              <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
                {t('security.reviewAndManageSuspicious')}
              </p>
            </div>

            {suspiciousUser.isSuspended && (
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--destructive)' }}
              >
                <Ban className="w-5 h-5" />
                <span className="font-semibold">Account Suspended</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div
              className="rounded-xl shadow-sm border p-6"
              style={{ background: 'var(--card-background)', borderColor: 'var(--border)' }}
            >
              <h2
                className="text-xl font-semibold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Shield className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                User Information
              </h2>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {suspiciousUser.avatarUrl ? (
                    <Image
                      src={suspiciousUser.avatarUrl}
                      alt={suspiciousUser.name}
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-full"
                    />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                      style={{
                        background:
                          'linear-gradient(to bottom right, var(--primary), var(--accent))',
                      }}
                    >
                      {suspiciousUser.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {suspiciousUser.name}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {suspiciousUser.email}
                    </p>
                  </div>
                </div>

                <div
                  className="grid grid-cols-2 gap-4 pt-4 border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Role
                    </p>
                    <p
                      className="font-semibold capitalize"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {suspiciousUser.role}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Department
                    </p>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {suspiciousUser.department || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Position
                    </p>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {suspiciousUser.position || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Status
                    </p>
                    <p
                      className="font-semibold"
                      style={{
                        color: suspiciousUser.isActive ? 'var(--success)' : 'var(--destructive)',
                      }}
                    >
                      {suspiciousUser.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                </div>

                {suspiciousUser.isSuspended && (
                  <div
                    className="mt-4 p-4 border rounded-lg"
                    style={{
                      background: 'rgba(239,68,68,0.1)',
                      borderColor: 'rgba(239,68,68,0.3)',
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--destructive)' }}>
                        Suspension Details
                      </p>
                      {suspiciousUser.suspendedReason?.includes('AUTO-BLOCKED') && (
                        <span
                          className="text-xs font-bold text-white px-2 py-1 rounded"
                          style={{ background: 'var(--destructive)' }}
                        >
                          AUTO-BLOCKED
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                      <p>
                        <span className="font-medium">Reason:</span>{' '}
                        {suspiciousUser.suspendedReason}
                      </p>
                      <p>
                        <span className="font-medium">Until:</span>{' '}
                        {new Date(suspiciousUser.suspendedUntil!).toLocaleString()}
                      </p>
                      <p>
                        <span className="font-medium">Suspended at:</span>{' '}
                        {new Date(suspiciousUser.suspendedAt!).toLocaleString()}
                      </p>
                      {suspiciousUser.suspendedReason?.includes('AUTO-BLOCKED') && (
                        <p
                          className="text-xs font-medium mt-2 pt-2 border-t"
                          style={{
                            color: 'var(--destructive)',
                            borderColor: 'rgba(239,68,68,0.3)',
                          }}
                        >
                          ⚡ This user was blocked by the security system due to high-risk activity.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className="rounded-xl shadow-sm border p-6"
              style={{ background: 'var(--card-background)', borderColor: 'var(--border)' }}
            >
              <h2
                className="text-xl font-semibold mb-4 flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <Clock className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                Recent Login Attempts
              </h2>

              {!recentAttempts || recentAttempts.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  No recent login attempts
                </p>
              ) : (
                <div className="space-y-3">
                  {recentAttempts.map((attempt: any) => (
                    <div
                      key={attempt._id}
                      className="p-4 rounded-lg border"
                      style={{
                        background: attempt.success
                          ? 'rgba(16,185,129,0.1)'
                          : 'rgba(239,68,68,0.1)',
                        borderColor: attempt.success
                          ? 'rgba(16,185,129,0.3)'
                          : 'rgba(239,68,68,0.3)',
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {attempt.success ? (
                              <CheckCircle
                                className="w-4 h-4"
                                style={{ color: 'var(--success)' }}
                              />
                            ) : (
                              <AlertTriangle
                                className="w-4 h-4"
                                style={{ color: 'var(--destructive)' }}
                              />
                            )}
                            <span
                              className="font-semibold text-sm"
                              style={{
                                color: attempt.success ? 'var(--success)' : 'var(--destructive)',
                              }}
                            >
                              {attempt.success ? 'Successful Login' : 'Failed Login'}
                            </span>
                            {attempt.riskScore && (
                              <span
                                className="text-xs font-bold"
                                style={getRiskStyle(attempt.riskScore)}
                              >
                                {getRiskLabel(attempt.riskScore)}
                              </span>
                            )}
                          </div>

                          <div
                            className="text-sm space-y-1"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <p className="flex items-center gap-2">
                              <Monitor className="w-3 h-3" />
                              Method:{' '}
                              <span className="font-medium capitalize">{attempt.method}</span>
                            </p>
                            {attempt.ip && (
                              <p className="flex items-center gap-2">
                                <MapPin className="w-3 h-3" />
                                IP: <span className="font-medium">{attempt.ip}</span>
                                {attempt.city && ` (${attempt.city}, ${attempt.country})`}
                              </p>
                            )}
                            {attempt.riskFactors && attempt.riskFactors.length > 0 && (
                              <p
                                className="font-medium mt-2"
                                style={{ color: 'var(--destructive)' }}
                              >
                                Risk Factors: {attempt.riskFactors.join(', ')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {new Date(attempt.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {suspiciousUser.isSuspended ? (
              <div
                className="rounded-xl shadow-sm border p-6"
                style={{ background: 'var(--card-background)', borderColor: 'var(--border)' }}
              >
                <h2
                  className="text-xl font-semibold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--success)' }}
                >
                  <CheckCircle className="w-5 h-5" />
                  Unsuspend Account
                </h2>

                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  This will immediately restore the user&apos;s access to the system.
                </p>

                <button
                  onClick={handleUnsuspend}
                  disabled={isProcessing}
                  className="w-full text-white px-4 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                  style={{ background: isProcessing ? 'var(--border)' : 'var(--success)' }}
                  onMouseEnter={(e) => !isProcessing && (e.currentTarget.style.opacity = '0.9')}
                  onMouseLeave={(e) => !isProcessing && (e.currentTarget.style.opacity = '1')}
                >
                  {isProcessing ? 'Processing...' : 'Unsuspend User'}
                </button>
              </div>
            ) : (
              <div
                className="rounded-xl shadow-sm border p-6"
                style={{ background: 'var(--card-background)', borderColor: 'var(--border)' }}
              >
                <h2
                  className="text-xl font-semibold mb-4 flex items-center gap-2"
                  style={{ color: 'var(--destructive)' }}
                >
                  <Ban className="w-5 h-5" />
                  Suspend Account
                </h2>

                <div className="space-y-4">
                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Suspension Duration (hours)
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="1"
                      value={suspendDuration}
                      onChange={(e) => setSuspendDuration(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent"
                      style={{
                        background: 'var(--input-background)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      User will be auto-unsuspended after this time
                    </p>
                  </div>

                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Reason for Suspension *
                    </label>
                    <textarea
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      placeholder="e.g., Suspicious login activity from unknown location"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent resize-none"
                      style={{
                        background: 'var(--input-background)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      rows={4}
                    />
                  </div>

                  <button
                    onClick={handleSuspend}
                    disabled={isProcessing || !suspendReason.trim()}
                    className="w-full text-white px-4 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                    style={{
                      background:
                        isProcessing || !suspendReason.trim()
                          ? 'var(--border)'
                          : 'var(--destructive)',
                    }}
                    onMouseEnter={(e) =>
                      !(isProcessing || !suspendReason.trim()) &&
                      (e.currentTarget.style.opacity = '0.9')
                    }
                    onMouseLeave={(e) =>
                      !(isProcessing || !suspendReason.trim()) &&
                      (e.currentTarget.style.opacity = '1')
                    }
                  >
                    {isProcessing ? 'Processing...' : 'Suspend User'}
                  </button>
                </div>
              </div>
            )}

            <div
              className="rounded-xl border p-6"
              style={{ background: 'rgba(37,99,235,0.1)', borderColor: 'rgba(37,99,235,0.3)' }}
            >
              <h3 className="font-semibold mb-3" style={{ color: 'var(--primary)' }}>
                Quick Presets
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSuspendDuration(1);
                    setSuspendReason('Temporary suspension for investigation (1 hour)');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{ background: 'var(--card-background)', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(37,99,235,0.2)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'var(--card-background)')
                  }
                >
                  1 hour (investigation)
                </button>
                <button
                  onClick={() => {
                    setSuspendDuration(24);
                    setSuspendReason('Suspicious activity detected - 24 hour suspension');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{ background: 'var(--card-background)', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(37,99,235,0.2)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'var(--card-background)')
                  }
                >
                  24 hours (suspicious)
                </button>
                <button
                  onClick={() => {
                    setSuspendDuration(168);
                    setSuspendReason('Security breach - 1 week suspension pending review');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                  style={{ background: 'var(--card-background)', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(37,99,235,0.2)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'var(--card-background)')
                  }
                >
                  1 week (security breach)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
