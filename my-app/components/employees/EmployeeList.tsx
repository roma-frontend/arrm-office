import { Employee } from "@/types/global";
import { EmployeeItem } from "./EmployeeItem";

interface EmployeeListProps {
  employees: Employee[];
}

export function EmployeeList({ employees }: EmployeeListProps) {
  return (
    <ul className="space-y-2">
      {employees.map((emp) => (
        <EmployeeItem key={emp._id} employee={emp} />
      ))}
    </ul>
  );
}