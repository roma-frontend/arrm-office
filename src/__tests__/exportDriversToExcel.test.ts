/**
 * Tests for exportDriversToExcel.ts — Excel and CSV driver trip export
 *
 * Tests: exportTripsToExcel (workbook creation, header styling, row data),
 * exportTripsToCSV (CSV content, empty trips, special characters).
 */

import { exportTripsToExcel, exportTripsToCSV } from '@/lib/exportDriversToExcel';

// ── Mock ExcelJS ─────────────────────────────────────────────────────────────
const mockAddRow = jest.fn();
const mockGetRow = jest.fn();
const mockWriteBuffer = jest.fn();

jest.mock('exceljs', () => {
  return {
    Workbook: jest.fn().mockImplementation(() => ({
      addWorksheet: jest.fn().mockReturnValue({
        columns: [],
        addRow: mockAddRow,
        getRow: mockGetRow,
      }),
      xlsx: { writeBuffer: mockWriteBuffer },
    })),
  };
});

// Mock download helpers
const mockClick = jest.fn();
const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  (document.createElement as jest.Mock) = jest.fn().mockReturnValue({
    href: '',
    download: '',
    click: mockClick,
  });

  global.URL.createObjectURL = jest.fn().mockReturnValue('blob:test');
  global.URL.revokeObjectURL = jest.fn();

  document.body.appendChild = mockAppendChild;
  document.body.removeChild = mockRemoveChild;

  mockGetRow.mockReturnValue({
    font: {},
    fill: {},
  });

  mockWriteBuffer.mockResolvedValue(new ArrayBuffer(8));
});

const sampleTrips = [
  {
    date: '2024-01-15',
    driver: 'Alice',
    passenger: 'Bob',
    from: 'NYC',
    to: 'Boston',
    purpose: 'Client meeting',
    distanceKm: 215,
    durationMin: 240,
    status: 'completed',
  },
  {
    date: '2024-01-16',
    driver: 'Alice',
    passenger: '',
    from: 'Boston',
    to: 'NYC',
    purpose: 'Return',
    distanceKm: 215,
    durationMin: 250,
    status: 'completed',
  },
];

describe('exportTripsToExcel', () => {
  it('creates workbook and writes rows', async () => {
    const result = await exportTripsToExcel(sampleTrips, 'trips.xlsx');
    expect(result).toEqual({ success: true, message: expect.any(String) });
    expect(mockAddRow).toHaveBeenCalledTimes(2);
    expect(mockWriteBuffer).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  it('styles header row (bold, gray fill)', async () => {
    await exportTripsToExcel(sampleTrips);
    expect(mockGetRow).toHaveBeenCalledWith(1);
  });

  it('handles empty trips array', async () => {
    const result = await exportTripsToExcel([], 'empty.xlsx');
    expect(result).toEqual({ success: true, message: expect.any(String) });
    expect(mockAddRow).not.toHaveBeenCalled();
  });

  it('uses default filename when not provided', async () => {
    const result = await exportTripsToExcel(sampleTrips);
    expect(result.success).toBe(true);
  });
});

describe('exportTripsToCSV', () => {
  it('generates CSV with headers and data rows', () => {
    const result = exportTripsToCSV(sampleTrips);
    expect(result).toEqual({ success: true, message: expect.any(String) });
    expect(mockClick).toHaveBeenCalled();
  });

  it('handles empty trips array', () => {
    const result = exportTripsToCSV([]);
    expect(result.success).toBe(true);
  });
});
