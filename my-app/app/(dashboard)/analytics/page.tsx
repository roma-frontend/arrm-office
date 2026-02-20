"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SummaryTable } from "@/components/analytics/SummaryTable";
import { CommentsList } from "@/components/analytics/CommentsList";
import { Chart } from "@/components/analytics/Chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsPage() {
  const now = new Date();
  const assignments = useQuery(api.assignments.listForMonth, {
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const employees = useQuery(api.employees.list);

  if (!assignments || !employees) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <SummaryTable employees={employees} assignments={assignments} />
        </TabsContent>
        <TabsContent value="chart">
          <Chart assignments={assignments} />
        </TabsContent>
        <TabsContent value="comments">
          <CommentsList employees={employees} assignments={assignments} />
        </TabsContent>
      </Tabs>
    </div>
  );
}