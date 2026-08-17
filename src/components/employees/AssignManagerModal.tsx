'use client';
import Image from 'next/image';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import type { User as UserType } from '@/store/useAuthStore';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  X,
  Search,
  UserCheck,
  UserCog,
  Crown,
  User,
  Car,
  ChevronRight,
  Building2,
  CheckCircle2,
  Loader2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';

// ── Role config ─────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin: { icon: Crown, color: '#2563eb', bg: 'rgba(44,140,213,0.1)', label: 'Admin' },
  supervisor: {
    icon: UserCheck,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    label: 'Supervisor',
  },
  employee: { icon: User, color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Employee' },
  driver: { icon: Car, color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', label: 'Driver' },
};
type RoleKey = keyof typeof ROLE_CONFIG;

function roleConfig(role: string) {
  return ROLE_CONFIG[role as RoleKey] ?? ROLE_CONFIG.employee;
}

interface _PotentialManager {
  _id: Id<'users'>;
  name: string;
  email: string;
  role: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
}

interface AssignManagerModalProps {
  employeeId: Id<'users'>;
  employeeName: string;
  currentSupervisorId?: Id<'users'> | null;
  organizationId: Id<'organizations'>;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AssignManagerModal({
  employeeId,
  employeeName,
  currentSupervisorId,
  organizationId,
  open,
  onClose,
  onSuccess,
}: AssignManagerModalProps) {
  const { t } = useTranslation();
  const currentUser = useAuthStore(useShallow((state: { user: UserType | null }) => state.user));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<Id<'users'> | null>(
    currentSupervisorId ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [avatarErrors, setAvatarErrors] = useState<Set<string>>(new Set());

  // Focus search input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Fetch potential managers
  const potentialManagers = useQuery(
    api.reporting.getPotentialManagers,
    open
      ? {
          organizationId,
          searchQuery: searchQuery || undefined,
          excludeUserId: employeeId,
        }
      : 'skip',
  );

  // Fetch current reporting line for the employee (to show hierarchy)
  const reportingLine = useQuery(
    api.reporting.getReportingLine,
    open ? { userId: employeeId, organizationId } : 'skip',
  );

  // Mutation
  const assignManager = useMutation(api.reporting.assignManager);

  // Build list of candidates: if no search, show current supervisor + managers by role hierarchy.
  // Deliberately no "selected first" re-sort: picking a manager must not move it
  // to the top of the list — the selection is shown in place (radio + highlight).
  const candidates = useMemo(() => {
    if (!potentialManagers) return [];
    const roleOrder = { admin: 0, supervisor: 1, employee: 2, driver: 3 } as const;
    return [...potentialManagers].sort(
      (a, b) =>
        (roleOrder[a.role as keyof typeof roleOrder] ?? 99) -
        (roleOrder[b.role as keyof typeof roleOrder] ?? 99),
    );
  }, [potentialManagers]);

  // Find selected manager object for UI (footer text)
  const selectedManager = useMemo(
    () =>
      candidates.find((m: any) => m._id === selectedSupervisorId) as _PotentialManager | undefined,
    [candidates, selectedSupervisorId],
  );

  // Close on Escape key for accessibility and tests
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleAssign = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (!currentUser?.id) {
        toast.error(t('common.error', 'Authentication error'));
        return;
      }
      await assignManager({
        employeeId,
        supervisorId: selectedSupervisorId ?? undefined,
      });
      toast.success(
        selectedSupervisorId
          ? `${t('employees.managerAssigned', 'Manager assigned successfully')}`
          : `${t('employees.managerRemoved', 'Manager removed successfully')}`,
      );
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('employees.managerAssignFailed', 'Failed to assign manager'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  // ── Render ─────────────────────────────────────────────────────────────
  const content = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            data-backdrop
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div
              className="relative px-6 pt-6 pb-4 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(44,140,213,0.1)' }}
                  >
                    <UserCog className="w-5 h-5 text-(--brand-text)" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {t('employees.assignManager', 'Assign Manager')}
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {t('employees.assignManagerFor', 'Set manager for {{name}}', {
                        name: employeeName,
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── Current Reporting Line ─────────────────────────────── */}
            {reportingLine && reportingLine.ancestors.length > 0 && (
              <div
                className="px-6 py-3 border-b"
                style={{ background: 'rgba(44,140,213,0.03)', borderColor: 'var(--border)' }}
              >
                <p
                  className="text-xs font-medium mb-2 flex items-center gap-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Users className="w-3 h-3" />
                  {t('employees.currentReportingLine', 'Current reporting line')}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {reportingLine.ancestors.map((anc, idx) => (
                    <span key={anc._id} className="flex items-center gap-1">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: roleConfig(anc.role).bg,
                          color: roleConfig(anc.role).color,
                        }}
                      >
                        {anc.name}
                      </span>
                      {idx < reportingLine.ancestors.length - 1 && (
                        <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </span>
                  ))}
                  <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-(--brand-quiet) text-(--brand-text)">
                    {employeeName}
                  </span>
                </div>
              </div>
            )}

            {/* ── Search ──────────────────────────────────────────────── */}
            <div className="px-6 pt-4 pb-2">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t(
                    'employees.searchManager',
                    'Search by name, email, or department...',
                  )}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-all focus:ring-2"
                  style={{
                    background: 'var(--background)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-100"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* ── Manager List ────────────────────────────────────────── */}
            <div className="px-6 py-2 max-h-[320px] overflow-y-auto">
              {/* Clear selection (remove manager) */}
              {currentSupervisorId && (
                <motion.button
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedSupervisorId(null)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed mb-2 transition-all hover:opacity-80"
                  style={{
                    borderColor: selectedSupervisorId === null ? '#ef4444' : 'var(--border)',
                    background:
                      selectedSupervisorId === null ? 'rgba(239,68,68,0.05)' : 'transparent',
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{
                      background:
                        selectedSupervisorId === null
                          ? 'rgba(239,68,68,0.1)'
                          : 'rgba(100,100,100,0.1)',
                    }}
                  >
                    <X
                      className="w-4 h-4"
                      style={{
                        color: selectedSupervisorId === null ? '#ef4444' : 'var(--text-muted)',
                      }}
                    />
                  </div>
                  <div className="text-left">
                    <p
                      className="text-sm font-medium"
                      style={{
                        color: selectedSupervisorId === null ? '#ef4444' : 'var(--text-primary)',
                      }}
                    >
                      {selectedSupervisorId === null
                        ? t('employees.removeManager', 'Remove manager')
                        : t('employees.clickToRemove', 'Click to remove current manager')}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {t(
                        'employees.employeeWillHaveNoManager',
                        'Employee will have no manager assigned',
                      )}
                    </p>
                  </div>
                </motion.button>
              )}

              {/* Loading state */}
              {potentialManagers === undefined && (
                <div className="flex items-center justify-center py-12">
                  <ShieldLoader size="sm" variant="inline" />
                </div>
              )}

              {/* Empty state */}
              {potentialManagers && candidates.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(100,100,100,0.1)' }}
                  >
                    <Search className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t('employees.noManagersFound', 'No managers found')}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('employees.tryDifferentSearch', 'Try a different search query')}
                  </p>
                </div>
              )}

              {/* Candidates list */}
              {potentialManagers && (
                <div className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {candidates.map((manager, idx) => {
                      const roleConf = roleConfig(manager.role);
                      const RoleIcon = roleConf.icon;
                      const isSelected = selectedSupervisorId === manager._id;
                      const isCurrent = manager._id === currentSupervisorId;

                      return (
                        <motion.button
                          data-candidate={manager._id}
                          key={manager._id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: idx * 0.02 }}
                          onClick={() => setSelectedSupervisorId(manager._id)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                          style={{
                            borderColor: isSelected ? '#2563eb' : 'var(--border)',
                            background: isSelected ? 'rgba(44,140,213,0.05)' : 'transparent',
                            boxShadow: isSelected ? '0 0 0 1px rgba(44,140,213,0.3)' : 'none',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected)
                              e.currentTarget.style.background = 'var(--background-subtle)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {/* Avatar */}
                          <div className="relative shrink-0">
                            <div
                              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold"
                              style={{
                                background: `linear-gradient(135deg, ${roleConf.color}, ${roleConf.color}88)`,
                              }}
                            >
                              {manager.avatarUrl && !avatarErrors.has(manager._id) ? (
                                <Image
                                  src={manager.avatarUrl}
                                  alt={manager.name}
                                  width={64}
                                  height={64}
                                  unoptimized
                                  className="w-full h-full object-cover"
                                  onError={() =>
                                    setAvatarErrors((prev) => new Set(prev).add(manager._id))
                                  }
                                />
                              ) : (
                                getInitials(manager.name)
                              )}
                            </div>
                            {/* Selection indicator */}
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-(--brand) rounded-full flex items-center justify-center"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                              </motion.div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className="text-sm font-semibold truncate"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {manager.name}
                              </p>
                              {isCurrent && (
                                <Badge className="text-[10px] py-0 px-1.5 bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline) shrink-0">
                                  {t('common.current', 'Current')}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded"
                                style={{ background: roleConf.bg, color: roleConf.color }}
                              >
                                <RoleIcon className="w-2.5 h-2.5" />
                                {t(`roles.${manager.role}`, roleConf.label)}
                              </span>
                              {manager.position && (
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {manager.position}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              {manager.department && (
                                <span
                                  className="text-xs flex items-center gap-1"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  <Building2 className="w-3 h-3" />
                                  {manager.department}
                                </span>
                              )}
                              <span
                                className="text-xs truncate"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {manager.email}
                              </span>
                            </div>
                          </div>

                          {/* Radio indicator */}
                          <div
                            className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all"
                            style={{
                              borderColor: isSelected ? '#2563eb' : 'var(--border)',
                            }}
                          >
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-2.5 h-2.5 rounded-full bg-(--brand)"
                              />
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <div
              className="px-6 py-4 border-t flex items-center justify-between gap-3"
              style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {selectedSupervisorId
                  ? `${selectedManager?.name ?? ''} will be set as the manager.`
                  : currentSupervisorId
                    ? t('employees.managerWillBeRemoved', 'Current manager will be removed')
                    : t('employees.selectManagerHint', 'Select a manager from the list above')}
              </p>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={onClose}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleAssign}
                  disabled={isSubmitting || selectedSupervisorId === currentSupervisorId}
                  className="btn-gradient text-white"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t('common.saving', 'Saving...')}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      {selectedSupervisorId
                        ? t('employees.assignManager', 'Assign Manager')
                        : t('employees.removeManager', 'Remove')}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Rendered inline (no portal) on purpose: the modal is opened from inside the
  // employee sheet, which is a Radix Dialog. A portaled node lives outside the
  // dialog's content tree, so Radix treats every pointer-down inside the modal as
  // an outside click and dismisses the sheet underneath it. Rendering inline
  // keeps the modal inside the sheet's React tree (the same pattern
  // EditEmployeeModal uses), so interacting with it no longer closes the sheet.
  // Inside the sheet, `fixed` is contained by `.spark-sheet`'s transform, so the
  // overlay covers the panel; on the full-page profile there is no transformed
  // ancestor and it covers the viewport as before.
  return content;
}

export default AssignManagerModal;
