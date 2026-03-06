"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { X, Plus, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";

interface Props {
  conversationId: Id<"chatConversations">;
  currentUserId: Id<"users">;
  organizationId: Id<"organizations">;
  onClose: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function ConversationInfoPanel({ conversationId, currentUserId, organizationId, onClose }: Props) {
  const { t } = useTranslation();
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Id<"users">[]>([]);
  const [adding, setAdding] = useState(false);

  const members = useQuery(api.chat.getConversationMembers, { conversationId });
  const conversations = useQuery(api.chat.getMyConversations, { userId: currentUserId, organizationId });
  const conversation = (conversations ?? []).find((c) => c && c._id === conversationId) ?? null;
  const orgUsers = useQuery(api.users.getAllUsers, { requesterId: currentUserId });
  const addMember = useMutation(api.chat.addMember);

  const isGroupConversation = conversation && "type" in conversation && (conversation as Record<string, unknown>).type === "group";

  // Filter users not already in the conversation
  const availableUsers = (orgUsers ?? []).filter(
    (user) => !members?.some((m) => m.userId === user._id)
  );

  // Filter by search query
  const filteredUsers = availableUsers.filter((user) =>
    (user.name ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddMembers = async () => {
    try {
      setAdding(true);
      for (const userId of selectedUsers) {
        await addMember({
          conversationId,
          requesterId: currentUserId,
          userId,
          organizationId,
        });
      }
      setSelectedUsers([]);
      setSearchQuery("");
      setShowAddMember(false);
    } catch (err) {
      console.error("Failed to add members:", err);
    } finally {
      setAdding(false);
    }
  };

  const toggleUserSelection = (userId: Id<"users">) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-80 flex flex-col border-l"
      style={{
        borderColor: "var(--border)",
        background: "var(--background)",
        zIndex: 40,
        animation: "slideInRight 0.3s ease-out",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {t('chat.conversationInfo')}
        </h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Conversation details */}
        {isGroupConversation && (
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {t('chat.groupName')}
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>
              {(conversation && "name" in conversation && (conversation as Record<string, unknown>).name as string) || "Unnamed Group"}
            </p>
          </div>
        )}

        {/* Members section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              {t('chat.members')} ({members?.length ?? 0})
            </p>
            {isGroupConversation && (
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="w-6 h-6 flex items-center justify-center rounded-lg transition-all hover:scale-105"
                style={{
                  background: showAddMember ? "var(--primary)" : "var(--sidebar-item-hover)",
                  color: showAddMember ? "white" : "var(--text-muted)",
                }}
                title={t('chat.addMembers')}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add member UI */}
          {showAddMember && (
            <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--background-subtle)" }}>
              {/* Search */}
              <div className="relative mb-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-disabled)" }} />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('chat.searchUsers')}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              {/* User list */}
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <label
                      key={user._id}
                      className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ background: "var(--background)" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user._id)}
                        onChange={() => toggleUserSelection(user._id)}
                        className="w-3.5 h-3.5 rounded"
                      />
                      <Avatar className="w-6 h-6">
                        {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                        <AvatarFallback className="text-[10px]" style={{ fontSize: "10px" }}>
                          {getInitials(user.name ?? "U")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                        {user.name}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-center py-3" style={{ color: "var(--text-muted)" }}>
                    {searchQuery ? t('chat.noUsersFound') : t('chat.allMembersAdded')}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {selectedUsers.length > 0 && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleAddMembers}
                    disabled={adding}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
                    style={{ background: "var(--primary)" }}
                  >
                    {adding ? "..." : `${t('chat.add')} (${selectedUsers.length})`}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddMember(false);
                      setSelectedUsers([]);
                      setSearchQuery("");
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: "var(--background-subtle)", color: "var(--text-primary)" }}
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
                style={{ background: "var(--sidebar-item-hover)" }}
              >
                <Avatar className="w-7 h-7">
                  {member.user?.avatarUrl && <AvatarImage src={member.user.avatarUrl} />}
                  <AvatarFallback className="text-[10px]">
                    {getInitials(member.user?.name ?? "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {member.user?.name ?? "Unknown"}
                  </p>
                </div>
                {member.userId === currentUserId && (
                  <span className="text-[10px]" style={{ color: "var(--primary)" }}>
                    {t('chat.you')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
