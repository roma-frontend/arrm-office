"use client";

import { useTranslation } from "react-i18next";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuthStore } from "@/store/useAuthStore";
import { Users } from "lucide-react";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const PRESENCE_CONFIG = {
  available: { dot: "bg-green-500", label: "Available" },
  in_meeting: { dot: "bg-yellow-500", label: "In Meeting" },
  in_call: { dot: "bg-blue-500", label: "In Call" },
  out_of_office: { dot: "bg-gray-500", label: "Out of Office" },
  busy: { dot: "bg-red-500", label: "Busy" },
} as const;

export function TeamPresence() {

  const { t } = useTranslation();
  const { user } = useAuthStore();
  const teamMembers = useQuery(
    api.productivity.getTeamPresence,
    user?.id ? { requesterId: user.id } : "skip"
  );

  if (!teamMembers) {
    return (
      <div className="flex items-center justify-center py-6">
        <ShieldLoader size="sm" />
      </div>
    );
  }

  const onlineCount = teamMembers.length;

  return (
    <div className="px-2 py-3">
      <div className="mb-3 px-2 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-muted)]">Team Online</h3>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {onlineCount} {onlineCount === 1 ? "member" : "members"} active
          </p>
        </div>
        <Users className="w-4 h-4 text-[var(--text-muted)]" />
      </div>

      {teamMembers.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs text-[var(--text-muted)]">No team members online</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teamMembers.map((member) => {
            const presenceConfig = PRESENCE_CONFIG[member.presenceStatus as keyof typeof PRESENCE_CONFIG] || PRESENCE_CONFIG.available;
            const initials = member.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <div
                key={member._id}
                className="flex items-center gap-3 rounded-lg p-2 transition-all hover:bg-[var(--background-subtle)]"
              >
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    {member.avatarUrl ? (
                      <AvatarImage src={member.avatarUrl} alt={member.name} />
                    ) : (
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    )}
                  </Avatar>
                  <span
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[var(--background)] ${presenceConfig.dot}`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {member.name}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                    {member.department || member.role}
                  </p>
                </div>

                <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${presenceConfig.dot} bg-opacity-20`}>
                  {presenceConfig.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
