'use client';

import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useOrgSelectorStore } from '@/store/useOrgSelectorStore';
import { Building2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

interface OrgSelectorProps {
  collapsed?: boolean;
}

export function OrganizationSelector({ collapsed = false }: OrgSelectorProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const store = useOrgSelectorStore();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const selectedOrgId = store.selectedOrgId;
  const setSelectedOrgId = store.setSelectedOrgId;
  const isSuperadmin = user?.role === 'superadmin';

  // Fetch all organizations for superadmin, or just user's org
  const organizations = useQuery(
    api.organizations.getAllOrganizations,
    mounted && isSuperadmin ? {} : 'skip',
  );

  if (!mounted || !isSuperadmin) return null;

  const orgs = organizations ?? [];
  const selectedOrg = orgs.find((org: any) => org._id === selectedOrgId);

  return (
    <div style={{ borderColor: 'var(--sidebar-border)' }}>
      <div className="relative" ref={ref}>
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full h-10 flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all duration-200',
            'hover:bg-opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1',
            'text-sm font-medium',
          )}
          variant="outline"
          title={selectedOrg?.name || t('employees.selectOrg')}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">
                {selectedOrg?.name || t('employees.selectOrg')}
              </span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 shrink-0 transition-transform duration-300',
                  isOpen && 'rotate-180',
                )}
              />
            </>
          )}
        </Button>

        {/* Dropdown Menu */}
        {isOpen && !collapsed && (
          <div
            className="absolute top-full left-0 right-0 mt-2 rounded-lg border shadow-lg z-50 max-h-60 overflow-y-auto"
            style={{
              backgroundColor: 'var(--background)',
              borderColor: 'var(--border)',
            }}
          >
            {/* Clear Selection Option */}
            <button
              onClick={() => {
                setSelectedOrgId(null);
                setIsOpen(false);
              }}
              className={cn(
                'w-full px-3 py-2 text-left text-sm transition-colors duration-200 border-b',
                selectedOrgId === null && 'font-semibold',
              )}
              style={{
                backgroundColor:
                  selectedOrgId === null ? 'var(--sidebar-item-hover)' : 'transparent',
                color: selectedOrgId === null ? 'var(--primary)' : 'var(--text-primary)',
                borderColor: 'var(--border)',
              }}
            >
              {t('superadmin.organizations.list.title')}
            </button>

            {/* Organization List */}
            {orgs.map((org: any) => (
              <button
                key={org._id}
                onClick={() => {
                  setSelectedOrgId(org._id);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-opacity-80',
                  selectedOrgId === org._id && 'font-semibold',
                )}
                style={{
                  backgroundColor:
                    selectedOrgId === org._id ? 'var(--sidebar-item-hover)' : 'transparent',
                  color: selectedOrgId === org._id ? 'var(--primary)' : 'var(--text-primary)',
                }}
              >
                <div className="truncate">{org.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {org.memberCount || 0} {t('employees.members')}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Collapsed State - Show only icon with selection indicator */}
        {collapsed && selectedOrgId && (
          <div
            className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
            style={{ backgroundColor: 'var(--primary)' }}
          />
        )}
      </div>
    </div>
  );
}
