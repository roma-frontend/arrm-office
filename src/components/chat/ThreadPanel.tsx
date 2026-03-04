"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, Send } from "lucide-react";
import { format } from "date-fns";

interface Props {
  parentMessageId: Id<"chatMessages">;
  parentContent: string;
  currentUserId: Id<"users">;
  conversationId: Id<"chatConversations">;
  organizationId: Id<"organizations">;
  onClose: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function ThreadPanel({ parentMessageId, parentContent, currentUserId, conversationId, organizationId, onClose }: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const replies = useQuery(api.chat.getThreadReplies, { parentMessageId });
  const sendReply = useMutation(api.chat.sendThreadReply);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies?.length]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendReply({
        parentMessageId,
        conversationId,
        senderId: currentUserId,
        organizationId,
        content: input.trim(),
      });
      setInput("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full border-l animate-slide-in-right"
      style={{ borderColor: "var(--border)", background: "var(--background)", width: 320, minWidth: 280 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Thread</h3>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {replies?.length ?? 0} repl{(replies?.length ?? 0) !== 1 ? "ies" : "y"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Parent message */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)", background: "var(--background-subtle)" }}>
        <p className="text-xs italic line-clamp-3" style={{ color: "var(--text-muted)" }}>
          "{parentContent}"
        </p>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {replies === undefined && (
          <div className="flex items-center justify-center py-8">
            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" style={{ color: "var(--primary)" }} />
          </div>
        )}
        {replies?.map((r) => {
          const isOwn = r.senderId === currentUserId;
          return (
            <div key={r._id} className={`flex gap-2 animate-fade-in ${isOwn ? "flex-row-reverse" : ""}`}>
              <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                {r.sender?.avatarUrl && <AvatarImage src={r.sender.avatarUrl} />}
                <AvatarFallback className="text-[8px] font-bold text-white" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" }}>
                  {getInitials(r.sender?.name ?? "?")}
                </AvatarFallback>
              </Avatar>
              <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} max-w-[80%]`}>
                <span className="text-[10px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
                  {isOwn ? "You" : r.sender?.name}
                </span>
                <div
                  className="px-3 py-1.5 rounded-xl text-xs break-words"
                  style={{
                    background: isOwn ? "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" : "var(--background-subtle)",
                    color: isOwn ? "white" : "var(--text-primary)",
                  }}
                >
                  {r.content}
                </div>
                <span className="text-[9px] mt-0.5 opacity-50" style={{ color: "var(--text-muted)" }}>
                  {format(new Date(r.createdAt), "HH:mm")}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--background-subtle)" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Reply in thread…"
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-6 h-6 flex items-center justify-center rounded-lg transition-all hover:scale-110 disabled:opacity-30"
            style={{ background: input.trim() ? "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))" : "var(--border)" }}
          >
            <Send className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out both;
        }
      `}</style>
    </div>
  );
}
