"use client";

import { cn } from "@/lib/utils";
import { useAssignmentModal } from "@/hooks/useAssignmentModal";
import { LEAVE_TYPES } from "@/lib/constants";

interface DayCellProps {
  employeeId: string;
  date: string;
  code?: string;
  comment?: string;
  amount?: number;
}

export function DayCell({ employeeId, date, code, comment, amount }: DayCellProps) {
  const { openModal } = useAssignmentModal();
  const typeStyle = LEAVE_TYPES.find((t) => t.code === code)?.color || "";

  const handleClick = () => {
    openModal({ employeeId, date, code, comment, amount });
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex aspect-square cursor-pointer items-center justify-center rounded-md border text-sm transition-all hover:scale-105 hover:shadow-md",
        code ? typeStyle : "bg-muted text-muted-foreground",
        comment && "relative after:absolute after:right-0.5 after:top-0.5 after:text-xs after:content-['💬']"
      )}
      title={`${date}${comment ? ` – ${comment}` : ""}${amount ? ` – ${amount} AMD` : ""}`}
    >
      {code || ""}
    </div>
  );
}