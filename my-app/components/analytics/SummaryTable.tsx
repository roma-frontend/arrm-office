import { Employee, Assignment } from "@/types/global";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SummaryTableProps {
  employees: Employee[];
  assignments: Assignment[];
}

export function SummaryTable({ employees, assignments }: SummaryTableProps) {
  const summary = employees.map((emp) => {
    const empAssignments = assignments.filter((a) => a.employeeId === emp._id);
    const counts = {
      AL: empAssignments.filter((a) => a.code === "AL").length,
      SL: empAssignments.filter((a) => a.code === "SL").length,
      UL: empAssignments.filter((a) => a.code === "UL").length,
      PL: empAssignments.filter((a) => a.code === "PL").length,
      BL: empAssignments.filter((a) => a.code === "BL").length,
      BT: empAssignments.filter((a) => a.code === "BT").length,
    };
    const totalCost = empAssignments.reduce(
      (sum, a) => sum + (a.amount || 0),
      0
    );
    return { ...counts, name: emp.name, totalCost };
  });

  const totals = summary.reduce(
    (acc, curr) => {
      acc.AL += curr.AL;
      acc.SL += curr.SL;
      acc.UL += curr.UL;
      acc.PL += curr.PL;
      acc.BL += curr.BL;
      acc.BT += curr.BT;
      acc.cost += curr.totalCost;
      return acc;
    },
    { AL: 0, SL: 0, UL: 0, PL: 0, BL: 0, BT: 0, cost: 0 }
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>AL</TableHead>
          <TableHead>SL</TableHead>
          <TableHead>UL</TableHead>
          <TableHead>PL</TableHead>
          <TableHead>BL</TableHead>
          <TableHead>BT</TableHead>
          <TableHead>Cost (AMD)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summary.map((row) => (
          <TableRow key={row.name}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.AL}</TableCell>
            <TableCell>{row.SL}</TableCell>
            <TableCell>{row.UL}</TableCell>
            <TableCell>{row.PL}</TableCell>
            <TableCell>{row.BL}</TableCell>
            <TableCell>{row.BT}</TableCell>
            <TableCell>{row.totalCost.toLocaleString()}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-bold">
          <TableCell>Total</TableCell>
          <TableCell>{totals.AL}</TableCell>
          <TableCell>{totals.SL}</TableCell>
          <TableCell>{totals.UL}</TableCell>
          <TableCell>{totals.PL}</TableCell>
          <TableCell>{totals.BL}</TableCell>
          <TableCell>{totals.BT}</TableCell>
          <TableCell>{totals.cost.toLocaleString()}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}