'use client';

/**
 * UserPicker — выбор сотрудника из списка организации вместо ручного ввода ID.
 *
 * Использует `api.reporting.getPotentialManagers` — запрос возвращает всех
 * активных пользователей организации (кроме superadmin) с серверным поиском
 * по имени, email, отделу и должности.
 */

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Search, X, Check, Building2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PickableUser {
  _id: Id<'users'>;
  name: string;
  email: string;
  role: string;
  department?: string;
  position?: string;
  avatarUrl?: string;
}

interface UserPickerProps {
  organizationId?: Id<'organizations'>;
  /** Выбранный `Id<'users'>` или пустая строка. */
  value: string;
  onChange: (userId: string) => void;
  /** Дополнительно отдаёт выбранного пользователя (имя, email, роль). */
  onSelectUser?: (user: PickableUser | null) => void;
  label?: string;
  hint?: string;
  searchPlaceholder?: string;
  /** Исключить пользователя из списка (например, уже выбранного сотрудника). */
  excludeUserId?: Id<'users'>;
  /** Показать только эти роли. По умолчанию — все. */
  roles?: string[];
  /** Разрешить сброс выбора. */
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  /** Высота прокручиваемого списка, px. */
  listHeight?: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-blue-500/10 text-blue-600',
  supervisor: 'bg-amber-500/10 text-amber-600',
  employee: 'bg-emerald-500/10 text-emerald-600',
  driver: 'bg-cyan-500/10 text-cyan-600',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function UserPicker({
  organizationId,
  value,
  onChange,
  onSelectUser,
  label,
  hint,
  searchPlaceholder,
  excludeUserId,
  roles,
  allowClear = true,
  disabled = false,
  className,
  listHeight = 240,
}: UserPickerProps) {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PickableUser | null>(null);
  const [avatarErrors, setAvatarErrors] = useState<Set<string>>(new Set());

  // Debounce поиска, чтобы не гонять запрос на каждое нажатие клавиши.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const users = useQuery(
    api.reporting.getPotentialManagers,
    organizationId
      ? {
          organizationId,
          searchQuery: search || undefined,
          ...(excludeUserId ? { excludeUserId } : {}),
        }
      : 'skip',
  );

  const candidates = useMemo(() => {
    if (!users) return [];
    if (!roles || roles.length === 0) return users;
    return users.filter((u) => roles.includes(u.role));
  }, [users, roles]);

  // Имя выбранного сотрудника: из кэша выбора либо из текущего списка.
  const selectedUser = useMemo<PickableUser | null>(() => {
    if (!value) return null;
    if (selected?._id === value) return selected;
    return (users?.find((u) => u._id === value) as PickableUser | undefined) ?? null;
  }, [value, selected, users]);

  const handleSelect = (user: PickableUser) => {
    setSelected(user);
    onChange(user._id);
    onSelectUser?.(user);
    setSearchInput('');
  };

  const handleClear = () => {
    setSelected(null);
    onChange('');
    onSelectUser?.(null);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {label && <label className="text-sm font-medium">{label}</label>}

      {/* Выбранный сотрудник */}
      {value && (
        <div className="flex items-center gap-3 p-2.5 rounded-lg border border-(--border) bg-(--background-subtle)">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {selectedUser?.avatarUrl && !avatarErrors.has(selectedUser._id) ? (
              <Image
                src={selectedUser.avatarUrl}
                alt={selectedUser.name}
                width={72}
                height={72}
                unoptimized
                className="w-full h-full object-cover"
                onError={() =>
                  setAvatarErrors((prev) => new Set(prev).add(selectedUser?._id as string))
                }
              />
            ) : (
              initials(selectedUser?.name ?? '?')
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {selectedUser?.name ?? t('userPicker.loading', 'Loading…')}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {[selectedUser?.position, selectedUser?.department, selectedUser?.email]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {allowClear && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label={t('userPicker.clear', 'Clear selection')}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-(--background)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Поиск + список (скрыт, когда сотрудник уже выбран) */}
      {!value && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              disabled={disabled}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={
                searchPlaceholder ??
                t('userPicker.search', 'Search by name, email, department…') ??
                ''
              }
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-(--border) bg-(--background) text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </div>

          <div
            className="rounded-lg border border-(--border) overflow-y-auto"
            style={{ maxHeight: listHeight }}
          >
            {!organizationId ? (
              <p className="p-4 text-xs text-muted-foreground text-center">
                {t('userPicker.noOrganization', 'No organization selected')}
              </p>
            ) : users === undefined ? (
              <p className="p-4 text-xs text-muted-foreground text-center">
                {t('userPicker.loading', 'Loading…')}
              </p>
            ) : candidates.length === 0 ? (
              <div className="p-6 flex flex-col items-center gap-2 text-center">
                <Users className="h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {t('userPicker.empty', 'No employees found')}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-(--border)">
                {candidates.map((user) => (
                  <li key={user._id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(user as PickableUser)}
                      className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-(--background-subtle) transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                        {user.avatarUrl && !avatarErrors.has(user._id) ? (
                          <Image
                            src={user.avatarUrl}
                            alt={user.name}
                            width={64}
                            height={64}
                            unoptimized
                            className="w-full h-full object-cover"
                            onError={() => setAvatarErrors((prev) => new Set(prev).add(user._id))}
                          />
                        ) : (
                          initials(user.name)
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{user.name}</p>
                          <span
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                              ROLE_COLORS[user.role] ?? 'bg-gray-500/10 text-gray-600',
                            )}
                          >
                            {t(`roles.${user.role}`, user.role)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.department && (
                            <>
                              <Building2 className="inline h-3 w-3 mr-1" />
                              {user.department}
                              {' · '}
                            </>
                          )}
                          {user.email}
                        </p>
                      </div>
                      {value === user._id && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default UserPicker;
