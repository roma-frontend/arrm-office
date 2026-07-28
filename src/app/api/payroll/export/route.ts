import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { records, organizationName, period } = body;

    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ error: 'Records array is required' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HR System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Payroll Report', {
      properties: { tabColor: { argb: '2563EB' } },
    });

    worksheet.columns = [
      { header: 'Employee', key: 'employee', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Period', key: 'period', width: 15 },
      { header: 'Base Salary', key: 'baseSalary', width: 15 },
      { header: 'Gross Salary', key: 'grossSalary', width: 15 },
      { header: 'Net Salary', key: 'netSalary', width: 15 },
      { header: 'Bonuses', key: 'bonuses', width: 12 },
      { header: 'Overtime Pay', key: 'overtimePay', width: 15 },
      { header: 'Income Tax', key: 'incomeTax', width: 12 },
      { header: 'Social Security', key: 'socialSecurity', width: 15 },
      { header: 'Total Deductions', key: 'totalDeductions', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Created At', key: 'createdAt', width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    records.forEach((record) => {
      worksheet.addRow({
        employee: record.user?.name || 'Unknown',
        email: record.user?.email || '',
        period: record.period,
        baseSalary: record.baseSalary,
        grossSalary: record.grossSalary,
        netSalary: record.netSalary,
        bonuses: record.bonuses || 0,
        overtimePay: record.overtimePay || 0,
        incomeTax: record.deductions?.incomeTax || 0,
        socialSecurity: record.deductions?.socialSecurity || 0,
        totalDeductions: record.deductions?.total || 0,
        status: record.status,
        createdAt: new Date(record.createdAt).toLocaleDateString(),
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      }
    });

    const totalGross = records.reduce((sum: number, r) => sum + r.grossSalary, 0);
    const totalNet = records.reduce((sum: number, r) => sum + r.netSalary, 0);
    const totalDeductions = records.reduce((sum: number, r) => sum + (r.deductions?.total || 0), 0);

    worksheet.addRow([]);
    const totalsRow = worksheet.addRow({ employee: 'TOTALS' });
    totalsRow.font = { bold: true };
    totalsRow.getCell('grossSalary').value = totalGross;
    totalsRow.getCell('grossSalary').font = { bold: true };
    totalsRow.getCell('netSalary').value = totalNet;
    totalsRow.getCell('netSalary').font = { bold: true };
    totalsRow.getCell('totalDeductions').value = totalDeductions;
    totalsRow.getCell('totalDeductions').font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `payroll-report-${period || 'all'}-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Payroll export error:', error);
    return NextResponse.json({ error: 'Failed to export payroll data' }, { status: 500 });
  }
}
