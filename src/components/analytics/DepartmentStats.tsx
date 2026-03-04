"use client";

import { useTranslation } from "react-i18next";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DepartmentStatsProps {
  users: Array<{
    department?: string;
    paidLeaveBalance: number;
    sickLeaveBalance: number;
    familyLeaveBalance: number;
  }>;
}

export function DepartmentStats({ users }: DepartmentStatsProps) {
  const { t } = useTranslation();
  // Default balances (what employees start with)
  const DEFAULT_PAID = 24;
  const DEFAULT_SICK = 10;
  const DEFAULT_FAMILY = 5;

  // Group by department and calculate USED days (not remaining balance)
  const departments = users.reduce((acc, user) => {
    const dept = user.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = {
        department: dept,
        employees: 0,
        usedPaid: 0,
        usedSick: 0,
        usedFamily: 0,
      };
    }
    acc[dept].employees += 1;
    // Calculate used days = default - current balance
    acc[dept].usedPaid += (DEFAULT_PAID - user.paidLeaveBalance);
    acc[dept].usedSick += (DEFAULT_SICK - user.sickLeaveBalance);
    acc[dept].usedFamily += (DEFAULT_FAMILY - user.familyLeaveBalance);
    return acc;
  }, {} as Record<string, any>);

  const data = Object.values(departments).map((dept: any) => ({
    department: dept.department,
    avgPaid: Math.round((dept.usedPaid / dept.employees) * 10) / 10,
    avgSick: Math.round((dept.usedSick / dept.employees) * 10) / 10,
    avgFamily: Math.round((dept.usedFamily / dept.employees) * 10) / 10,
    employees: dept.employees,
  }));

  return (
    <div className="bg-[var(--background)] rounded-2xl p-6 shadow-lg border border-[var(--border)]">
      <h3 className="text-xl font-bold mb-4 text-[var(--text-primary)]">
        🏢 {t('departmentStats.title')}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-[var(--border)]" opacity={0.3} />
          <XAxis 
            dataKey="department" 
            className="fill-[var(--text-muted)]"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            className="fill-[var(--text-muted)]"
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--background-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-primary)'
            }}
            itemStyle={{ color: 'var(--text-primary)' }}
            labelStyle={{ color: 'var(--text-primary)' }}
          />
          <Legend wrapperStyle={{ color: 'var(--text-primary)' }} />
          <Bar dataKey="avgPaid" fill="#2563eb" name={t("departmentStats.paidLeave")} />
          <Bar dataKey="avgSick" fill="#0ea5e9" name={t("departmentStats.sickLeave")} />
          <Bar dataKey="avgFamily" fill="#EC4899" name={t("departmentStats.familyLeave")} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default DepartmentStats;

