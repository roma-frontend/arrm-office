/* TEMPORARY harness for checking the donut hover behaviour. Safe to delete. */
'use client';

import React from 'react';
import { LeaveCharts } from '@/components/dashboard/LeaveCharts';

const monthlyTrend = [
  { month: 'Jan', approved: 3, pending: 1, rejected: 0 },
  { month: 'Feb', approved: 2, pending: 0, rejected: 1 },
  { month: 'Mar', approved: 4, pending: 2, rejected: 0 },
];

const pieData = [
  { name: 'Оплачиваемый отпуск', value: 9, color: '#2563eb' },
  { name: 'Больничный', value: 1, color: '#ef4444' },
  { name: 'Семейный отпуск', value: 1, color: '#10b981' },
];

export default function ChartPreviewPage() {
  return (
    <div className="min-h-dvh bg-(--background) p-4">
      <LeaveCharts monthlyTrend={monthlyTrend} pieData={pieData} />
    </div>
  );
}
