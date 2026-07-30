'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '@/convex/_generated/api';
import {
  Search,
  Users,
  Building2,
  Calendar,
  CheckSquare,
  Ticket,
  Car,
  X,
  ArrowRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

type User = {
  _id: string;
  name: string;
  email: string;
  organizationId?: string;
};

type Organization = {
  _id: string;
  name: string;
  plan: string;
  slug: string;
};

type LeaveRequest = {
  _id: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
};

type Task = {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
};

type DriverRequest = {
  _id: string;
  requesterName?: string;
  status: string;
  tripInfo?: {
    from: string;
    to: string;
  };
};

interface GlobalSearchProps {
  placeholder?: string;
  autoFocus?: boolean;
  onSelect?: (result: SearchResult) => void;
}

type SearchResult = {
  id: string;
  type: 'user' | 'organization' | 'leave' | 'task' | 'driver' | 'ticket';
  title: string;
  subtitle?: string;
  icon: string;
  organizationId?: string;
  status?: string;
  priority?: string;
};

export function GlobalSearch({ placeholder, autoFocus = false, onSelect }: GlobalSearchProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const _searchPlaceholder = placeholder || t('globalSearch.placeholder');
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useQuery(
    api.superadmin.globalSearch,
    query.length >= 2 ? { query, limit: 20 } : 'skip',
  );

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      // Escape to close
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (item: SearchResult) => {
    onSelect?.(item);
    setIsOpen(false);
    setQuery('');

    // Navigate based on type
    switch (item.type) {
      case 'user':
        router.push(`/superadmin/users/${item.id}`);
        break;
      case 'organization':
        router.push(`/superadmin/organizations/${item.id}/edit`);
        break;
      case 'leave':
        router.push(`/leaves`);
        break;
      case 'task':
        router.push(`/tasks`);
        break;
      case 'ticket':
        router.push(`/superadmin/support`);
        break;
    }
  };

  const flattenResults = (): SearchResult[] => {
    if (!results) return [];

    const all: SearchResult[] = [];

    if (selectedType === null || selectedType === 'user') {
      all.push(
        ...(results.users || []).map((u: User) => ({
          id: u._id,
          type: 'user' as const,
          title: u.name,
          subtitle: u.email,
          icon: '👤',
          organizationId: u.organizationId,
        })),
      );
    }

    if (selectedType === null || selectedType === 'organization') {
      all.push(
        ...(results.organizations || []).map((o: Organization) => ({
          id: o._id,
          type: 'organization' as const,
          title: o.name,
          subtitle: `${o.plan} • ${o.slug}`,
          icon: '🏢',
        })),
      );
    }

    if (selectedType === null || selectedType === 'leave') {
      all.push(
        ...(results.leaveRequests || []).map((l: LeaveRequest) => ({
          id: l._id,
          type: 'leave' as const,
          title: `${l.userName} - ${l.type}`,
          subtitle: `${l.startDate} → ${l.endDate}`,
          icon: '📅',
          status: l.status,
        })),
      );
    }

    if (selectedType === null || selectedType === 'task') {
      all.push(
        ...(results.tasks || []).map((t: Task) => ({
          id: t._id,
          type: 'task' as const,
          title: t.title,
          subtitle: t.description?.slice(0, 50) || t.status,
          icon: '✅',
          status: t.status,
          priority: t.priority,
        })),
      );
    }

    if (selectedType === null || selectedType === 'driver') {
      all.push(
        ...(results.driverRequests || []).map((d: DriverRequest) => ({
          id: d._id,
          type: 'driver' as const,
          title: `${d.requesterName || 'Unknown'}`,
          subtitle: `${d.tripInfo?.from} → ${d.tripInfo?.to}`,
          icon: '🚗',
          status: d.status,
        })),
      );
    }

    if (selectedType === null || selectedType === 'ticket') {
      all.push(
        ...(results.supportTickets || []).map((t: any) => ({
          id: t._id,
          type: 'ticket' as const,
          title: t.ticketNumber,
          subtitle: t.title,
          icon: '🎫',
          status: t.status,
          priority: t.priority,
        })),
      );
    }

    return all;
  };

  const flatResults = flattenResults();
  const hasResults = flatResults.length > 0;
  const hasQuery = query.length >= 2;

  const typeFilters = [
    { id: null, label: t('globalSearch.all'), icon: Search, count: results?.total || 0 },
    { id: 'user', label: t('globalSearch.users'), icon: Users, count: results?.users?.length || 0 },
    {
      id: 'organization',
      label: t('globalSearch.organizations'),
      icon: Building2,
      count: results?.organizations?.length || 0,
    },
    {
      id: 'leave',
      label: t('globalSearch.leaves'),
      icon: Calendar,
      count: results?.leaveRequests?.length || 0,
    },
    {
      id: 'task',
      label: t('globalSearch.tasks'),
      icon: CheckSquare,
      count: results?.tasks?.length || 0,
    },
    {
      id: 'driver',
      label: t('globalSearch.drivers'),
      icon: Car,
      count: results?.driverRequests?.length || 0,
    },
    {
      id: 'ticket',
      label: t('globalSearch.tickets'),
      icon: Ticket,
      count: results?.supportTickets?.length || 0,
    },
  ];

  return (
    <div ref={wrapperRef} className="relative w-full max-w-3xl">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          id="global-search-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-9 pr-12 h-11"
          autoFocus={autoFocus}
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && hasQuery && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border rounded-lg shadow-lg z-50 max-h-[70vh] overflow-hidden flex flex-col">
          {/* Type Filters */}
          <div className="flex gap-1 p-2 border-b overflow-x-auto">
            {typeFilters.map((filter) => (
              <button
                key={filter.id?.toString() || 'all'}
                onClick={() => setSelectedType(filter.id as string | null)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                  selectedType === filter.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <filter.icon className="w-3 h-3" />
                {filter.label}
                {filter.count > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {filter.count}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Results */}
          <div className="overflow-y-auto flex-1 p-2">
            {!results ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="animate-pulse">{t('globalSearch.searching')}</div>
              </div>
            ) : !hasResults ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{t('globalSearch.noResults')}</p>
                  <p className="text-xs mt-1">{t('globalSearch.tryAnotherQuery')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {flatResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="w-full flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors text-left group"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.title}</span>
                        {item.status && (
                          <Badge variant="outline" className="h-4 text-[10px] shrink-0">
                            {item.status}
                          </Badge>
                        )}
                        {item.priority && (
                          <Badge
                            variant={
                              item.priority === 'critical'
                                ? 'destructive'
                                : item.priority === 'high'
                                  ? 'default'
                                  : 'secondary'
                            }
                            className="h-4 text-[10px] shrink-0"
                          >
                            {item.priority}
                          </Badge>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t text-xs text-muted-foreground text-center">
            {t('globalSearch.pressEnterToGo')}
          </div>
        </div>
      )}
    </div>
  );
}
