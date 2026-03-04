"use client";

export function TypingIndicator({ users }: { users: { userId: string; name: string }[] }) {
  const names = users.map((u) => u.name.split(" ")[0]).join(", ");
  return (
    <div className="flex items-end gap-2 my-1">
      <div className="w-8 shrink-0" />
      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl rounded-bl-sm" style={{ background: "var(--background-subtle)" }}>
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-disabled)", animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-disabled)", animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-disabled)", animationDelay: "300ms" }} />
        </div>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {names} {users.length === 1 ? "is" : "are"} typing…
        </span>
      </div>
    </div>
  );
}
