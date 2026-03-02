// ── Leave Types ──────────────────────────────────────────────────────────────
export type LeaveType = "paid" | "unpaid" | "sick" | "family" | "doctor";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type EmployeeType = "staff" | "contractor";
export type UserRole = "admin" | "manager" | "employee";

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  paid: "Paid Vacation",
  unpaid: "Unpaid Leave",
  sick: "Sick Leave",
  family: "Family Leave",
  doctor: "Doctor Visit",
};

// Helper function to get translated leave type labels
export function getLeaveTypeLabel(type: LeaveType, t: (key: string) => string): string {
  const labelKeys: Record<LeaveType, string> = {
    paid: "leaveTypes.paid",
    unpaid: "leaveTypes.unpaid",
    sick: "leaveTypes.sick",
    family: "leaveTypes.family",
    doctor: "leaveTypes.doctor",
  };
  return t(labelKeys[type]);
}

export const LEAVE_TYPE_COLORS: Record<LeaveType, string> = {
  paid: "#2563eb",
  unpaid: "#f59e0b",
  sick: "#ef4444",
  family: "#10b981",
  doctor: "#06b6d4",
};

export const DEPARTMENTS = [
  "Engineering",
  "Marketing",
  "Sales",
  "HR",
  "Finance",
  "Operations",
  "Design",
  "Legal",
];

// Travel allowance logic: contractor email → 12,000 AMD, staff → 20,000 AMD
export function getTravelAllowance(email: string): number {
  return email.toLowerCase().includes("contractor") ? 12000 : 20000;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function calculateDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 1;
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("hy-AM") + " ֏";
}
