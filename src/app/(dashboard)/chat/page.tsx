"use client";

import dynamic from "next/dynamic";
import { useAuthStore } from "@/store/useAuthStore";
import { ShieldLoader } from "@/components/ui/ShieldLoader";

const ChatClient = dynamic(() => import("@/components/chat/ChatClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center" style={{ background: "var(--background)" }}>
      <ShieldLoader size="lg" />
    </div>
  ),
});

export default function ChatPage() {
  const { user } = useAuthStore();
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden w-full">
      <ChatClient userId={user?.id ?? ""} organizationId={user?.organizationId ?? ""} userName={user?.name ?? ""} userAvatar={user?.avatar} userRole={user?.role ?? "employee"} />
    </div>
  );
}
