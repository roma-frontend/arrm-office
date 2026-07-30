/**
 * Export driver trips to PDF (Browser-compatible using pdfmake)
 */

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// pdfmake has no TypeScript types — all operations are inherently unsafe
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
    @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
const pdfMakeTyped = pdfMake as any;
const pdfFontsTyped = pdfFonts as any;
pdfMakeTyped.vfs = pdfFontsTyped.pdfMake?.vfs || pdfFontsTyped.vfs;

interface TripData {
  date: string;
  driver: string;
  passenger: string;
  from: string;
  to: string;
  purpose: string;
  distanceKm: number;
  durationMin: number;
  status: string;
}

interface TripStats {
  totalTrips: number;
  totalDistance: number;
  totalDuration: number;
  period: string;
}

export function exportTripsToPDF(
  trips: TripData[],
  stats: TripStats,
  filename: string = 'driver-report.pdf',
) {
  const docDefinition: any = {
    content: [
      // Header
      { text: 'Driver Trip Report', style: 'header', alignment: 'center' },
      {
        text: `Period: ${stats.period}`,
        style: 'subheader',
        alignment: 'center',
        margin: [0, 0, 0, 20],
      },

      // Summary Statistics
      { text: 'Summary Statistics', style: 'sectionHeader' },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              { text: 'Total Trips', style: 'tableHeader' },
              { text: stats.totalTrips.toString(), alignment: 'right' },
            ],
            [
              { text: 'Total Distance', style: 'tableHeader' },
              { text: `${stats.totalDistance.toFixed(2)} km`, alignment: 'right' },
            ],
            [
              { text: 'Total Duration', style: 'tableHeader' },
              { text: `${stats.totalDuration} minutes`, alignment: 'right' },
            ],
            [
              { text: 'Average Distance', style: 'tableHeader' },
              {
                text: `${(stats.totalDistance / stats.totalTrips || 0).toFixed(2)} km`,
                alignment: 'right',
              },
            ],
            [
              { text: 'Average Duration', style: 'tableHeader' },
              {
                text: `${(stats.totalDuration / stats.totalTrips || 0).toFixed(1)} min`,
                alignment: 'right',
              },
            ],
          ],
        },
        margin: [0, 0, 0, 20],
      },

      // Trip Details
      { text: 'Trip Details', style: 'sectionHeader' },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', '*', '*', 'auto', 'auto', 'auto'],
          body: [
            ['Date', 'Driver', 'Passenger', 'From', 'To', 'Distance', 'Duration', 'Status'],
            ...trips.map((trip) => [
              trip.date,
              trip.driver,
              trip.passenger,
              trip.from,
              trip.to,
              `${trip.distanceKm} km`,
              `${trip.durationMin} min`,
              trip.status,
            ]),
          ],
        },
        style: 'table',
      },

      // Footer
      {
        text: `Generated on ${new Date().toLocaleDateString()}`,
        style: 'footer',
        alignment: 'center',
        margin: [0, 20, 0, 0],
      },
    ],
    styles: {
      header: { fontSize: 24, bold: true, margin: [0, 0, 0, 10] },
      subheader: { fontSize: 12, color: '#666' },
      sectionHeader: { fontSize: 16, bold: true, margin: [0, 15, 0, 10] },
      tableHeader: { bold: true, fontSize: 10, color: '#333' },
      table: { fontSize: 9 },
      footer: { fontSize: 10, color: '#999' },
    },
    defaultStyle: { fontSize: 10 },
  };

  pdfMake.createPdf(docDefinition).download(filename);

  return { success: true, message: 'PDF file downloaded' };
}
