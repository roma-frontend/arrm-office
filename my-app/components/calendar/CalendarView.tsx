"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { addWeeks, subWeeks, format } from "date-fns";

interface CalendarViewProps {
  employees: any[];
  assignments: any[];
}

export function CalendarView({ employees, assignments }: CalendarViewProps) {
  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const handlePrev = () => {
    if (view === "week") {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }
  };

  const handleNext = () => {
    if (view === "week") {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="space-x-2">
          <Button variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>
            Week
          </Button>
          <Button variant={view === "month" ? "default" : "outline"} onClick={() => setView("month")}>
            Month
          </Button>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" onClick={handlePrev}>
            ←
          </Button>
          <span className="font-medium">
            {view === "week"
              ? `${format(currentDate, "MMM d")} – ${format(addWeeks(currentDate, 1), "MMM d, yyyy")}`
              : format(currentDate, "MMMM yyyy")}
          </span>
          <Button variant="outline" size="icon" onClick={handleNext}>
            →
          </Button>
        </div>
      </div>
      {view === "week" ? (
        <WeekView employees={employees} assignments={assignments} currentDate={currentDate} />
      ) : (
        <MonthView employees={employees} assignments={assignments} currentDate={currentDate} />
      )}
    </div>
  );
}