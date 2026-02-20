import { Assignment } from "@/types/global";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ChartProps {
  assignments: Assignment[];
}

export function Chart({ assignments }: ChartProps) {
  const data = [
    { code: "AL", count: assignments.filter((a) => a.code === "AL").length },
    { code: "SL", count: assignments.filter((a) => a.code === "SL").length },
    { code: "UL", count: assignments.filter((a) => a.code === "UL").length },
    { code: "PL", count: assignments.filter((a) => a.code === "PL").length },
    { code: "BL", count: assignments.filter((a) => a.code === "BL").length },
    { code: "BT", count: assignments.filter((a) => a.code === "BT").length },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="code" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count" fill="hsl(var(--primary))" />
      </BarChart>
    </ResponsiveContainer>
  );
}