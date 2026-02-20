"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CalendarView } from "@/components/calendar/CalendarView";
import { EmployeeList } from "@/components/employees/EmployeeList";
import { AddEmployeeButton } from "@/components/employees/AddEmployeeButton";
import { useAssignmentModal } from "@/hooks/useAssignmentModal";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignmentModal } from "@/components/calendar/assignment/AssignmentModal";

export default function DashboardPage() {
  const employees = useQuery(api.employees.list);
  const assignments = useQuery(api.assignments.listForMonth, {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  const { isOpen } = useAssignmentModal();

  if (employees === undefined || assignments === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-4 text-lg font-semibold">Employees</h2>
            <EmployeeList employees={employees} />
            <AddEmployeeButton />
          </div>
        </div>
        <div className="lg:col-span-3">
          <div className="rounded-lg border bg-card p-4">
            <CalendarView
              employees={employees}
              assignments={assignments}
            />
          </div>
        </div>
      </div>
      {isOpen && <AssignmentModal />}
    </>
  );
}