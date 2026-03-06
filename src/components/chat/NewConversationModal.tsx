"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, Search, Users, MessageCircle, Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgSelectorStore } from "@/store/useOrgSelectorStore";
import { useTranslation } from "react-i18next";

interface Props {
  currentUserId: Id<"users">;
  organizationId: Id<"organizations">;
  onClose: () => void;
  onCreated: (convId: Id<"chatConversations">) => void;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function NewConversationModal({ currentUserId, organizationId, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Id<"users">[]>([]);
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);

  // Respect the org selector: null = "All orgs" (superadmin), else filter by org
  const { selectedOrgId } = useOrgSelectorStore();
  // Use selectedOrgId if set (superadmin viewing specific org), else use the user's own org
  const effectiveOrgId = (selectedOrgId ?? organizationId) as Id<"organizations">;

  const users = useQuery(api.chat.getOrgUsers, { organizationId: effectiveOrgId, currentUserId });
  const getOrCreateDM = useMutation(api.chat.getOrCreateDM);
  const createGroup = useMutation(api.chat.createGroup);

  // When "All organizations" is selected (selectedOrgId is null for superadmin),
  // we show all users from the user's own org (cross-org DM uses user's org as conversation host)
  const isAllOrgs = selectedOrgId === null;

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.toLowerCase();
    return users.filter((u) =>
      u.name.toLowerCase().includes(q) ||
      (u.department ?? "").toLowerCase().includes(q) ||
      (u.position ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const toggleUser = (uid: Id<"users">) => {
    if (mode === "dm") {
      setSelectedUsers([uid]);
    } else {
      setSelectedUsers((prev) =>
        prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
      );
    }
  };

  const handleCreate = async () => {
    if (selectedUsers.length === 0) return;
    setLoading(true);
    try {
      if (mode === "dm") {
        const convId = await getOrCreateDM({
          organizationId: effectiveOrgId,
          currentUserId,
          targetUserId: selectedUsers[0],
        });
        onCreated(convId);
      } else {
        if (!groupName.trim()) return;
        const convId = await createGroup({
          organizationId: effectiveOrgId,
          createdBy: currentUserId,
          name: groupName.trim(),
          memberIds: selectedUsers,
        });
        onCreated(convId);
      }
    } catch (err) {
      console.error("Error creating conversation:", err);
    } finally {
      setLoading(false);
    }
  };

  const canCreate = mode === "dm" ? selectedUsers.length === 1 : (selectedUsers.length >= 1 && groupName.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--background)", border: "1px solid var(--border)", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              {t('chat.newConversation')}
            </h2>
            {isAllOrgs && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: "var(--background-subtle)", color: "var(--text-muted)" }}>
                <Globe className="w-3 h-3" />
                {t('chat.allOrgs')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity">
            <X className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex p-3 gap-2">
          {(["dm", "group"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setSelectedUsers([]); }}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all")}
              style={{
                background: mode === m ? "var(--primary)" : "var(--background-subtle)",
                color: mode === m ? "white" : "var(--text-muted)",
              }}
            >
              {m === "dm" ? <MessageCircle className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
              {m === "dm" ? t('chat.directMessage') : t('chat.group')}
            </button>
          ))}
        </div>

        {/* Group name */}
        {mode === "group" && (
          <div className="px-3 pb-2">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t('chat.groupName')}
              className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
              style={{ background: "var(--background-subtle)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
        )}

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-disabled)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chat.searchEmployees')}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none"
              style={{ background: "var(--background-subtle)", borderColor: "var(--border)", color: "var(--text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>
        </div>

        {/* Selected chips (group mode) */}
        {mode === "group" && selectedUsers.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1">
            {selectedUsers.map((uid) => {
              const u = users?.find((x) => x._id === uid);
              return (
                <span
                  key={uid}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                  style={{ background: "var(--primary)" }}
                >
                  {u?.name ?? "User"}
                  <button onClick={() => toggleUser(uid)}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {filtered.map((u) => {
            const isSelected = selectedUsers.includes(u._id);
            return (
              <button
                key={u._id}
                onClick={() => toggleUser(u._id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left"
                style={{
                  background: isSelected ? "var(--sidebar-item-active)" : "transparent",
                  color: isSelected ? "var(--sidebar-item-active-text)" : "var(--text-primary)",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--sidebar-item-hover)"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <Avatar className="w-9 h-9 shrink-0">
                  {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                  <AvatarFallback className="text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}>
                    {getInitials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                    {[u.position, u.department].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {isSelected && <Check className="w-4 h-4 shrink-0" style={{ color: "var(--primary)" }} />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => {
              console.log("[NewConversationModal] Create button clicked, canCreate:", canCreate, "loading:", loading);
              handleCreate();
            }}
            disabled={!canCreate || loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}
          >
            {loading ? t('chat.creating') : mode === "dm" ? t('chat.openChat') : `${t('chat.createGroup')}${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
