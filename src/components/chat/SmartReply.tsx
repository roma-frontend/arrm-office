"use client";

import React, { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  message: string;
  context?: string;
  onSelect: (reply: string) => void;
  lang?: string;
}

export function SmartReply({ message, context, onSelect, lang = "en" }: Props) {
  const [replies, setReplies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    setReplies([]);
    setFetched(false);
  }, [message]);

  const fetchReplies = async () => {
    if (fetched || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/chat/smart-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context, lang }),
      });
      const data = await res.json();
      setReplies(data.replies ?? []);
      setFetched(true);
    } catch {
      const fallbacks: Record<string, string[]> = {
        ru: ["👍 Понял!", "Можете уточнить?", "Сделаю позже"],
        hy: ["👍 Հասկացա!", "Կարո՞ղ եք պարզաբանել:", "Կանեմ ավելի ուշ"],
        en: ["👍 Got it!", "Can you clarify?", "I'll do it later"],
      };
      const key = lang.startsWith("ru") ? "ru" : lang.startsWith("hy") ? "hy" : "en";
      setReplies(fallbacks[key]);
      setFetched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      {!fetched && !loading && (
        <button
          onClick={fetchReplies}
          className="flex items-center gap-1.5 sm:px-2 px-3 sm:py-0.5 py-1.5 rounded-full sm:text-[10px] text-xs font-medium border transition-all duration-200 hover:scale-105 hover:opacity-80 min-h-[36px] sm:min-h-auto"
          style={{ borderColor: "var(--primary)", color: "var(--primary)", background: "transparent" }}
        >
          <Sparkles className="sm:w-2.5 w-3.5 sm:h-2.5 h-3.5" />
          Smart Reply
        </button>
      )}
      {loading && (
        <div className="flex items-center gap-1.5 sm:px-2 px-3 sm:py-0.5 py-1.5 rounded-full sm:text-[10px] text-xs min-h-[36px] sm:min-h-auto" style={{ color: "var(--text-muted)" }}>
          <span className="sm:w-2.5 w-3.5 sm:h-2.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
          Thinking…
        </div>
      )}
      {replies.map((r, i) => (
        <button
          key={i}
          onClick={() => onSelect(r)}
          className="sm:px-2.5 px-3 sm:py-0.5 py-1.5 rounded-full sm:text-[11px] text-xs font-medium border transition-all duration-200 hover:scale-105 animate-fade-in min-h-[36px] sm:min-h-auto"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
            background: "var(--background-subtle)",
            animationDelay: `${i * 0.06}s`,
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
