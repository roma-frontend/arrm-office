"use client";

import { eachDayOfInterval, startOfWeek, endOfWeek } from "date-fns";
import { Employee, Assignment } from "@/types/global";
import { DayCell } from "./DayCell";

interface WeekViewProps {
  employees: Employee[];
  assignments: Assignment[];
  currentDate: Date;
}

export function WeekView({ employees, assignments, currentDate }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <div className="week-view">
      {/* Header row with day numbers and weekdays */}
      <div className="grid grid-cols-[120px_repeat(7,1fr)] gap-1 mb-2">
        <div className="font-medium text-muted-foreground">Employee</div>
        {days.map((day) => (
          <div key={day.toISOString()} className="text-center">
            <div className="font-medium">{day.getDate()}</div>
            <div className="text-xs text-muted-foreground">
              {day.toLocaleDateString("en-US", { weekday: "short" })}
            </div>
          </div>
        ))}
      </div>

      {/* Employee rows */}
      {employees.map((emp) => (
        <div key={emp._id} className="grid grid-cols-[120px_repeat(7,1fr)] gap-1 mb-1">
          <div className="truncate py-2 font-medium" title={emp.name}>
            {emp.name}
          </div>
          {days.map((day) => {
            const dateStr = formatDate(day);
            const assignment = assignments.find(
              (a) => a.employeeId === emp._id && a.date === dateStr
            );
            return (
              <DayCell
                key={dateStr}
                employeeId={emp._id}
                date={dateStr}
                code={assignment?.code}
                comment={assignment?.comment}
                amount={assignment?.amount}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Helper to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}