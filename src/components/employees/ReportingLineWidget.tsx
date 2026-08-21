'use client';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { motion } from '@/lib/cssMotion';
import {
  ChevronDown,
  Crown,
  UserCheck,
  User,
  Car,
  Shield,
  Mail,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

const ROLE_ICONS: Record<string, LucideIcon> = {
  admin: Crown,
  supervisor: UserCheck,
  employee: User,
  driver: Car,
  superadmin: Shield,
};

const ROLE_COLORS: Record<string, string> = {
  admin: '#2563eb',
  supervisor: '#f59e0b',
  employee: '#10b981',
  driver: '#06b6d4',
  superadmin: '#9333ea',
};

interface ReportingLineWidgetProps {
  userId: Id<'users'>;
  organizationId?: Id<'organizations'>;
  onAssignManager?: () => void;
  canEdit?: boolean;
}

export function ReportingLineWidget({
  userId,
  organizationId,
  onAssignManager,
  canEdit,
}: ReportingLineWidgetProps) {
  const { t } = useTranslation();

  const reportingLine = useQuery(api.reporting.getReportingLine, {
    userId,
    organizationId,
  });

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  if (reportingLine === undefined) {
    return (
      <Card>
        <CardContent className="p-6">
          <ShieldLoader size="sm" variant="inline" />
        </CardContent>
      </Card>
    );
  }

  if (!reportingLine) return null;

  const { subject, ancestors, directReports } = reportingLine;
  const hasChain = ancestors.length > 0;
  const hasReports = directReports.length > 0;

  // Build the full chain: [ancestors..., subject, ...directReports]
  // Actually, let's show the chain from top to bottom
  const chain = [...ancestors, subject];

  return (
    <Card className="overflow-hidden border-(--brand-outline)">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(44,140,213,0.1)' }}
            >
              <Crown className="w-4 h-4 text-(--brand-text)" />
            </div>
            {t('employees.reportingLine', 'Reporting Line')}
          </CardTitle>
          {canEdit && onAssignManager && (
            <button
              onClick={onAssignManager}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
              style={{
                background: 'rgba(44,140,213,0.1)',
                color: '#2563eb',
              }}
            >
              <UserCheck className="w-3.5 h-3.5" />
              {t('employees.changeManager', 'Change')}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        {!hasChain && !hasReports ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(100,100,100,0.08)' }}
            >
              <User className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('employees.noManagerAssigned', 'No manager assigned')}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('employees.noReportingLine', 'This employee has no reporting structure')}
            </p>
            {canEdit && onAssignManager && (
              <button
                onClick={onAssignManager}
                className="mt-2 flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-all hover:opacity-80"
                style={{
                  background: 'rgba(44,140,213,0.1)',
                  color: '#2563eb',
                }}
              >
                <UserCheck className="w-3.5 h-3.5" />
                {t('employees.assignManager', 'Assign Manager')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {/* Chain of command */}
            {chain.map((person, idx) => {
              const isSubject = idx === chain.length - 1;
              const roleIcon = ROLE_ICONS[person.role] ?? User;
              const roleColor = ROLE_COLORS[person.role] ?? '#666';
              const RoleIcon = roleIcon;

              return (
                <motion.div
                  key={person._id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.06 }}
                >
                  <div className="relative flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-(--background-subtle) group">
                    {/* Vertical connector line */}
                    {idx < chain.length - 1 && (
                      <div
                        className="absolute left-[26px] top-12 w-0.5 h-[calc(100%-16px)]"
                        style={{ background: 'var(--border)' }}
                      />
                    )}

                    {/* Avatar */}
                    <div
                      className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white text-sm font-bold"
                      style={{
                        background: isSubject
                          ? 'linear-gradient(135deg, #2563eb, #0ea5e9)'
                          : `linear-gradient(135deg, ${roleColor}, ${roleColor}88)`,
                        boxShadow: isSubject ? '0 0 0 3px rgba(44,140,213,0.2)' : 'none',
                      }}
                    >
                      {person.avatarUrl ? (
                        <Image
                          src={person.avatarUrl}
                          alt={person.name}
                          width={64}
                          height={64}
                          unoptimized
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        getInitials(person.name)
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2">
                        <EmployeeHoverCard userId={person._id as string} name={person.name}>
                          <p
                            className="font-semibold text-sm truncate cursor-pointer hover:underline hover:underline-offset-2"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {person.name}
                          </p>
                        </EmployeeHoverCard>
                        {isSubject && (
                          <Badge className="text-[10px] py-0 px-1.5 bg-(--brand-quiet) text-(--brand-text) border-(--brand-outline) shrink-0">
                            {t('employees.current', 'Current')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            background: `${roleColor}15`,
                            color: roleColor,
                          }}
                        >
                          <RoleIcon className="w-2.5 h-2.5" />
                          {t(`roles.${person.role}`)}
                        </span>
                        {person.position && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {person.position}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {person.department && (
                          <span
                            className="text-xs flex items-center gap-1"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Building2 className="w-3 h-3" />
                            {person.department}
                          </span>
                        )}
                        <span
                          className="text-xs flex items-center gap-1"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Mail className="w-3 h-3" />
                          {person.email}
                        </span>
                      </div>
                    </div>

                    {/* Connector arrow (except for subject) */}
                    {!isSubject && (
                      <div className="shrink-0 pt-3">
                        <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {/* Direct Reports Section */}
            {hasReports && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center"
                    style={{ background: 'rgba(16,185,129,0.1)' }}
                  >
                    <UserCheck className="w-3 h-3 text-(--success-text)" />
                  </div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {t('employees.directReports', 'Direct Reports')} ({directReports.length})
                  </p>
                </div>

                <div className="space-y-1.5">
                  {directReports.map((report, idx) => {
                    const roleColor = ROLE_COLORS[report.role] ?? '#666';

                    return (
                      <motion.div
                        key={report._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (chain.length + idx) * 0.04 }}
                        className="flex items-center gap-3 p-2.5 rounded-xl transition-colors hover:bg-(--background-subtle)"
                      >
                        <div
                          className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white text-xs font-bold"
                          style={{
                            background: `linear-gradient(135deg, ${roleColor}, ${roleColor}88)`,
                          }}
                        >
                          {report.avatarUrl ? (
                            <Image
                              src={report.avatarUrl}
                              alt={report.name}
                              width={64}
                              height={64}
                              unoptimized
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            getInitials(report.name)
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <EmployeeHoverCard userId={report._id as string} name={report.name}>
                            <p
                              className="text-sm font-medium truncate cursor-pointer hover:underline hover:underline-offset-2"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {report.name}
                            </p>
                          </EmployeeHoverCard>
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {report.position || report.role}
                            </span>
                            {report.department && (
                              <>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  ·
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {report.department}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Badge
                          className="text-[10px] py-0 px-1.5 shrink-0"
                          variant="outline"
                          style={{
                            background: `${ROLE_COLORS[report.role] ?? '#666'}10`,
                            color: ROLE_COLORS[report.role] ?? '#666',
                            borderColor: `${ROLE_COLORS[report.role] ?? '#666'}30`,
                          }}
                        >
                          <User className="w-2.5 h-2.5 mr-1" />
                          {t(`employeeTypes.${report.employeeType}`, report.employeeType)}
                        </Badge>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No direct reports */}
            {!hasReports && (
              <div
                className="mt-3 pt-3 border-t border-dashed"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2 py-2 px-1">
                  <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t('employees.noDirectReports', 'No direct reports')}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ReportingLineWidget;
