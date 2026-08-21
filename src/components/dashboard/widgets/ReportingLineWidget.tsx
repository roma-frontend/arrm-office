'use client';

/* eslint-disable @next/next/no-img-element */

import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { Network, ChevronUp, Users } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';

type Person = {
  _id: string;
  name: string;
  avatarUrl?: string;
  position?: string;
  department?: string;
};

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
    );
  }
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-(--purple-quiet) text-(--purple-text) flex items-center justify-center text-xs font-semibold shrink-0">
      {initials}
    </div>
  );
}

function PersonRow({ person, muted }: { person: Person; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-(--background-subtle) transition-colors">
      <Avatar name={person.name} avatarUrl={person.avatarUrl} />
      <div className="flex-1 min-w-0">
        <EmployeeHoverCard userId={person._id} name={person.name}>
          <p className="text-sm font-medium text-(--text-primary) truncate cursor-pointer hover:underline hover:underline-offset-2">
            {person.name}
          </p>
        </EmployeeHoverCard>
        {(person.position || person.department) && (
          <p
            className={`text-xs truncate ${muted ? 'text-(--text-muted)' : 'text-(--text-muted)'}`}
          >
            {person.position || person.department}
          </p>
        )}
      </div>
    </div>
  );
}

export const ReportingLineWidget = memo(function ReportingLineWidget() {
  const { t } = useTranslation();
  const data = useQuery(api.dashboard.getReportingLine, {});

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="w-5 h-5 text-(--purple-text)" />
          {t('dashboardWidgets.reportingLine', 'Reporting Line')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-(--background-subtle) animate-pulse rounded-lg" />
            ))}
          </div>
        ) : data === null ? (
          <div className="text-center py-8">
            <Network className="w-12 h-12 text-(--text-muted) mx-auto mb-3 opacity-40" />
            <p className="text-sm text-(--text-muted)">
              {t('dashboardWidgets.noReportingData', 'No reporting data available')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Manager chain — nearest manager first */}
            {data.managers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-1 flex items-center gap-1">
                  <ChevronUp className="w-3.5 h-3.5" />
                  {t('dashboardWidgets.reportsTo', 'Reports to')}
                </p>
                <div className="space-y-1">
                  {data.managers.map((m) => (
                    <PersonRow key={m._id} person={m} muted />
                  ))}
                </div>
              </div>
            )}

            {/* Direct reports */}
            <div>
              <p className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {t('dashboardWidgets.directReports', 'Direct reports')}
                {data.directReports.length > 0 && (
                  <span className="ml-1 text-(--text-muted)">({data.directReports.length})</span>
                )}
              </p>
              {data.directReports.length === 0 ? (
                <p className="text-sm text-(--text-muted) px-2 py-1">
                  {t('dashboardWidgets.noDirectReports', 'No direct reports')}
                </p>
              ) : (
                <div className="space-y-1">
                  {data.directReports.slice(0, 8).map((r) => (
                    <PersonRow key={r._id} person={r} />
                  ))}
                </div>
              )}
            </div>

            {data.managers.length === 0 && data.directReports.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-(--text-muted)">
                  {t(
                    'dashboardWidgets.notInHierarchy',
                    'You are not linked in the org hierarchy yet',
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default ReportingLineWidget;
