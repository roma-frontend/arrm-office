import { Doc, Id } from "@/convex/_generated/dataModel";

export type Employee = Doc<"employees">;
export type Assignment = Doc<"assignments">;
export type User = Doc<"users">;

export interface AssignmentBlock {
  employeeId: Id<"employees">;
  startDate: string;
  endDate: string;
  code: string;
  comment?: string;
  amount?: number;
}

export interface AssignmentModalData {
  employeeId: Id<"employees">;
  date: string;
  code?: string;
  comment?: string;
  amount?: number;
}