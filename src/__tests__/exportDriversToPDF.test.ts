/**
 * Tests for exportDriversToPDF.ts — PDF report generation.
 *
 * Mocks pdfmake since we don't want actual PDF generation.
 */
jest.mock('pdfmake/build/pdfmake', () => ({
  createPdf: jest.fn().mockReturnValue({ download: jest.fn() }),
}));

jest.mock('pdfmake/build/vfs_fonts', () => ({
  pdfMake: { vfs: { 'Roboto-Regular.ttf': 'mock' } },
  vfs: { 'Roboto-Regular.ttf': 'mock' },
}));

import { exportTripsToPDF } from '@/lib/exportDriversToPDF';
import pdfMake from 'pdfmake/build/pdfmake';

describe('exportTripsToPDF', () => {
  const sampleTrips = [
    {
      date: '2026-07-15',
      driver: 'John',
      passenger: 'Alice',
      from: 'Office',
      to: 'Airport',
      purpose: 'Client meeting',
      distanceKm: 25,
      durationMin: 40,
      status: 'completed',
    },
    {
      date: '2026-07-16',
      driver: 'Jane',
      passenger: 'Bob',
      from: 'HQ',
      to: 'Venue',
      purpose: 'Event',
      distanceKm: 15,
      durationMin: 25,
      status: 'scheduled',
    },
  ];
  const sampleStats = {
    totalTrips: 2,
    totalDistance: 40,
    totalDuration: 65,
    period: '2026-07',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns success object', () => {
    const result = exportTripsToPDF(sampleTrips, sampleStats, 'report.pdf');
    expect(result.success).toBe(true);
    expect(result.message).toContain('PDF');
  });

  it('calls pdfMake.createPdf', () => {
    exportTripsToPDF(sampleTrips, sampleStats);
    expect(pdfMake.createPdf).toHaveBeenCalled();
  });

  it('calls download on the pdf document', () => {
    const mockDoc = { download: jest.fn() };
    (pdfMake.createPdf as jest.Mock).mockReturnValue(mockDoc);
    exportTripsToPDF(sampleTrips, sampleStats, 'custom.pdf');
    expect(mockDoc.download).toHaveBeenCalledWith('custom.pdf');
  });

  it('includes summary statistics in document definition', () => {
    exportTripsToPDF(sampleTrips, sampleStats);
    const docDef = (pdfMake.createPdf as jest.Mock).mock.calls[0][0];
    expect(docDef.content).toBeDefined();
    expect(docDef.content[0].text).toContain('Driver Trip Report');
    expect(docDef.content[1].text).toContain('2026-07');
    expect(docDef.content[2].text).toContain('Summary Statistics');
  });

  it('includes trip details table with headers', () => {
    exportTripsToPDF(sampleTrips, sampleStats);
    const docDef = (pdfMake.createPdf as jest.Mock).mock.calls[0][0];
    // Content structure: [0]=header, [1]=period, [2]=sectionHeader, [3]=statsTable, [4]=tripSectionHeader, [5]=tripsTable, [6]=footer
    const tripTable = docDef.content[5];
    expect(tripTable.table).toBeDefined();
    expect(tripTable.table.body[0][0]).toContain('Date');
    expect(tripTable.table.body[0][1]).toContain('Driver');
  });

  it('includes all trips in the table body', () => {
    exportTripsToPDF(sampleTrips, sampleStats);
    const docDef = (pdfMake.createPdf as jest.Mock).mock.calls[0][0];
    const tripTable = docDef.content[5];
    // header + 2 trips = 3 rows
    expect(tripTable.table.body.length).toBe(3);
  });

  it('handles empty trips gracefully', () => {
    const emptyStats = { totalTrips: 0, totalDistance: 0, totalDuration: 0, period: 'N/A' };
    expect(() => exportTripsToPDF([], emptyStats)).not.toThrow();
  });
});
