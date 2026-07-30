import { action } from '../_generated/server';
import { v } from 'convex/values';
import { calculatePayroll } from '../lib/payrollCalculator';
import type { Id } from '../_generated/dataModel';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _apiRaw: any = require('../_generated/api').api;

export const processScheduledPayroll = action({
  args: {
    organizationId: v.id('organizations'),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; totalGross: number; totalNet: number; message: string }> => {
    const { organizationId } = args;

    const _currentMonth = new Date().toISOString().slice(0, 7);

    const _runQuery = ctx.runQuery as unknown as (...args: any[]) => Promise<any>;
    const employees: any[] =
      (await _runQuery(_apiRaw.employeeProfiles.getEmployeesByOrganization, {
        organizationId: organizationId as Id<'organizations'>,
      })) ?? [];

    if (!employees || employees.length === 0) {
      return { processed: 0, totalGross: 0, totalNet: 0, message: 'No employees found' };
    }

    const settings: any = await _runQuery(_apiRaw.settings.getOrganizationSettings, {
      organizationId: organizationId as Id<'organizations'>,
    });

    const taxCountry = settings?.taxCountry ?? 'armenia';

    let totalGross = 0;
    let totalNet = 0;
    let processedCount = 0;

    for (const emp of employees) {
      try {
        const baseSalary = emp.baseSalary ?? 0;
        const bonuses = emp.bonuses ?? 0;
        const overtimeHours = emp.overtimeHours ?? 0;
        const hourlyRate = baseSalary > 0 ? baseSalary / 160 : 0;

        const calculation = calculatePayroll({
          country: taxCountry,
          baseSalary,
          bonuses,
          overtimeHours,
          hourlyRate,
        });

        totalGross += calculation.grossSalary;
        totalNet += calculation.netSalary;
        processedCount++;
      } catch (error) {
        console.error(`Error processing payroll for employee ${emp._id}:`, error);
      }
    }

    return {
      processed: processedCount,
      totalGross,
      totalNet,
      message: `Processed payroll for ${processedCount} employees`,
    };
  },
});
