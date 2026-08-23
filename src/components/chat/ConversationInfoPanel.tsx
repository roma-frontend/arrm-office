'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { X, Plus, Search, Building2, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface Props {
  conversationId: Id<'chatConversations'>;
  currentUserId: Id<'users'>;
  organizationId?: Id<'organizations'>;
  onClose: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ConversationInfoPanel({
  conversationId,
  currentUserId,
  organizationId,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isSuperadmin = user?.role === 'superadmin';
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Id<'users'>[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<Id<'organizations'> | undefined>(
    organizationId,
  );
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  const members = useQuery(api.chat.queries.getConversationMembers, { conversationId });
  const conversations = useQuery(api.chat.queries.getMyConversations, {
    userId: currentUserId,
    organizationId,
  });
  const conversation = (conversations ?? []).find((c) => c && c._id === conversationId) ?? null;

  // Only superadmins can fetch all organizations for cross-org member addition
  const allOrganizations = useQuery(
    api.organizations.getAllOrganizations,
    isSuperadmin ? {} : 'skip',
  );

  // Fetch users from the selected organization (non-superadmins can only see their own org)
  const orgUsers = useQuery(
    api.chat.queries.getOrgUsers,
    selectedOrgId ? { organizationId: selectedOrgId, currentUserId } : 'skip',
  );

  const addMember = useMutation(api.chat.mutations.addMember);

  const isGroupConversation =
    conversation &&
    'type' in conversation &&
    (conversation as Record<string, unknown>).type === 'group';

  // Find selected org name for display
  const selectedOrg = allOrganizations?.find((org) => org._id === selectedOrgId);

  // Filter users not already in the conversation
  const availableUsers = (orgUsers ?? []).filter(
    (user) => !members?.some((m) => m.userId === user._id),
  );

  // Filter by search query
  const filteredUsers = availableUsers.filter(
    (user) =>
      (user.name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.department ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleAddMembers = async () => {
    try {
      setAdding(true);
      for (const userId of selectedUsers) {
        await addMember({
          conversationId,
          userId,
          organizationId: selectedOrgId,
        });
      }
      setSelectedUsers([]);
      setSearchQuery('');
      setShowAddMember(false);
    } catch (err) {
      logger.error('[handleAddMembers] Failed to add members:', err);
      toast.error('Failed to add members');
    } finally {
      setAdding(false);
    }
  };

  const toggleUserSelection = (userId: Id<'users'>) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-full sm:w-80 flex flex-col border-l"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--background)',
        zIndex: 50,
        animation: 'slideInRight 0.3s ease-out',
        pointerEvents: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('chat.conversationInfo')}
        </h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto  ">
        {/* Conversation details */}
        {isGroupConversation && (
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {t('chat.groupName')}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
              {(conversation &&
                'name' in conversation &&
                ((conversation as Record<string, unknown>).name as string)) ||
                'Unnamed Group'}
            </p>
          </div>
        )}

        {/* Members section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="text-xs font-semibold flex-1" style={{ color: 'var(--text-muted)' }}>
              {t('chat.members')} ({members?.length ?? 0})
            </p>
            {/* Always show add-member button (for both DM and group conversations) */}
            <button
              onClick={() => setShowAddMember(!showAddMember)}
              className="w-6 h-6 flex items-center justify-center rounded-lg transition-all hover:scale-105 active:scale-95"
              style={{
                background: showAddMember ? 'var(--primary)' : 'var(--sidebar-item-hover)',
                color: showAddMember ? 'white' : 'var(--text-muted)',
                cursor: 'pointer',
                position: 'relative',
                zIndex: 100,
                flexShrink: 0,
              }}
              title={t('chat.addMembers')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add member UI */}
          {showAddMember && (
            <div
              className="mb-4 p-3 rounded-lg border"
              style={{ borderColor: 'var(--border)', background: 'var(--background-subtle)' }}
            >
              {/* Organization selector — superadmin only */}
              {isSuperadmin && allOrganizations && allOrganizations.length > 1 && (
                <div className="mb-3">
                  <p
                    className="text-[10px] font-medium mb-1.5 flex items-center gap-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Building2 className="w-3 h-3" />
                    {t('chat.selectOrganization', { defaultValue: 'Организация' })}
                  </p>
                  <div className="relative">
                    <button
                      onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg border transition-all hover:opacity-80"
                      style={{
                        background: 'var(--background)',
                        borderColor: showOrgDropdown ? 'var(--primary)' : 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span className="truncate">{selectedOrg?.name ?? '...'}</span>
                      <ChevronDown
                        className="w-3.5 h-3.5 shrink-0 ml-1 transition-transform"
                        style={{
                          color: 'var(--text-muted)',
                          transform: showOrgDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      />
                    </button>

                    {showOrgDropdown && (
                      <div
                        className="absolute left-0 right-0 top-full mt-1 rounded-lg border shadow-xl overflow-hidden z-50"
                        style={{
                          background: 'var(--background)',
                          borderColor: 'var(--border)',
                        }}
                      >
                        <div className="max-h-40 overflow-y-auto  ">
                          {allOrganizations.map(
                            (org: { _id: Id<'organizations'>; name: string }) => (
                              <button
                                key={org._id}
                                onClick={() => {
                                  setSelectedOrgId(org._id as Id<'organizations'>);
                                  setShowOrgDropdown(false);
                                  setSearchQuery('');
                                  setSelectedUsers([]);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-2 text-xs transition-all hover:opacity-80"
                                style={{
                                  background:
                                    org._id === selectedOrgId
                                      ? 'var(--sidebar-item-active)'
                                      : 'transparent',
                                  color:
                                    org._id === selectedOrgId
                                      ? 'var(--primary)'
                                      : 'var(--text-primary)',
                                }}
                                onMouseEnter={(e) => {
                                  if (org._id !== selectedOrgId)
                                    e.currentTarget.style.background = 'var(--sidebar-item-hover)';
                                }}
                                onMouseLeave={(e) => {
                                  if (org._id !== selectedOrgId)
                                    e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                <Building2
                                  className="w-3 h-3 shrink-0"
                                  style={{ color: 'var(--text-muted)' }}
                                />
                                <span className="truncate flex-1 text-left">{org.name}</span>
                                {org._id === selectedOrgId && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: 'var(--primary)' }}
                                  />
                                )}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative mb-3">
                <Search
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                  style={{ color: 'var(--text-disabled)' }}
                />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('chat.searchUsers')}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-(--input-border) bg-(--input) text-(--text-primary) outline-none"
                />
              </div>

              {/* User list */}
              <div className="space-y-1 max-h-48 overflow-y-auto  ">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        background: selectedUsers.includes(user._id)
                          ? 'var(--sidebar-item-active)'
                          : 'var(--background)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user._id)}
                        onChange={() => toggleUserSelection(user._id)}
                        className="w-3.5 h-3.5 rounded accent-[var(--primary)]"
                      />
                      <Avatar className="w-6 h-6">
                        {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                        <AvatarFallback className="text-[10px]" style={{ fontSize: '10px' }}>
                          {getInitials(user.name ?? 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <span
                          className="text-xs truncate block"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {user.name}
                        </span>
                        {user.department && (
                          <span
                            className="text-[10px] truncate block"
                            style={{ color: 'var(--text-disabled)' }}
                          >
                            {user.department}
                          </span>
                        )}
                      </div>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>
                    {searchQuery ? t('chat.noUsersFound') : t('chat.allMembersAdded')}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {selectedUsers.length > 0 && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleAddMembers()}
                    disabled={adding}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
                    style={{ background: 'var(--primary)' }}
                  >
                    {adding ? '...' : `${t('chat.add')} (${selectedUsers.length})`}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddMember(false);
                      setSelectedUsers([]);
                      setSearchQuery('');
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'var(--background-subtle)', color: 'var(--text-primary)' }}
                  >
                    {t('chat.cancel')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Members list */}
          <div className="space-y-2">
            {members?.map((member) => (
              <div
                key={member.userId}
                className="flex items-center gap-2 p-2 rounded-lg"
                style={{ background: 'var(--sidebar-item-hover)' }}
              >
                <Avatar className="w-7 h-7">
                  {member.user?.avatarUrl && <AvatarImage src={member.user.avatarUrl} />}
                  <AvatarFallback className="text-[10px]">
                    {getInitials(member.user?.name ?? 'U')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {member.user?.name ?? 'Unknown'}
                  </p>
                </div>
                {member.userId === currentUserId && (
                  <span className="text-[10px]" style={{ color: 'var(--primary)' }}>
                    {t('chat.you')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
