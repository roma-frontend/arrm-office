/**
 * Export driver trips to PDF (Browser-compatible using pdfmake).
 * Labels are localized (en / ru / hy / de); EN is the fallback.
 */

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// pdfmake has no TypeScript types — all operations are inherently unsafe
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,
    @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
const pdfMakeTyped = pdfMake as any;
const pdfFontsTyped = pdfFonts as any;
pdfMakeTyped.vfs = pdfFontsTyped.pdfMake?.vfs || pdfFontsTyped.vfs;

type ExportLang = 'en' | 'ru' | 'hy' | 'de';

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

interface PdfDict {
  title: string;
  period: string;
  summary: string;
  totalTrips: string;
  totalDistance: string;
  totalDuration: string;
  avgDistance: string;
  avgDuration: string;
  details: string;
  date: string;
  driver: string;
  passenger: string;
  from: string;
  to: string;
  distance: string;
  duration: string;
  status: string;
  km: string;
  min: string;
  minutes: string;
  generatedOn: string;
}

const DICT: Record<ExportLang, PdfDict> = {
  en: {
    title: 'Driver Trip Report',
    period: 'Period: {{period}}',
    summary: 'Summary Statistics',
    totalTrips: 'Total Trips',
    totalDistance: 'Total Distance',
    totalDuration: 'Total Duration',
    avgDistance: 'Average Distance',
    avgDuration: 'Average Duration',
    details: 'Trip Details',
    date: 'Date',
    driver: 'Driver',
    passenger: 'Passenger',
    from: 'From',
    to: 'To',
    distance: 'Distance',
    duration: 'Duration',
    status: 'Status',
    km: 'km',
    min: 'min',
    minutes: 'minutes',
    generatedOn: 'Generated on {{date}}',
  },
  ru: {
    title: 'Отчёт по поездкам водителя',
    period: 'Период: {{period}}',
    summary: 'Сводная статистика',
    totalTrips: 'Всего поездок',
    totalDistance: 'Общее расстояние',
    totalDuration: 'Общая длительность',
    avgDistance: 'Среднее расстояние',
    avgDuration: 'Средняя длительность',
    details: 'Детали поездок',
    date: 'Дата',
    driver: 'Водитель',
    passenger: 'Пассажир',
    from: 'Откуда',
    to: 'Куда',
    distance: 'Расстояние',
    duration: 'Длительность',
    status: 'Статус',
    km: 'км',
    min: 'мин',
    minutes: 'минут',
    generatedOn: 'Сформировано {{date}}',
  },
  hy: {
    title: 'Վարորդի ուղևորությունների հաշվետվություն',
    period: 'Ժամանակահատված՝ {{period}}',
    summary: 'Ամփոփ վիճակագրություն',
    totalTrips: 'Ընդհանուր ուղևորություններ',
    totalDistance: 'Ընդհանուր հեռավորություն',
    totalDuration: 'Ընդհանուր տևողություն',
    avgDistance: 'Միջին հեռավորություն',
    avgDuration: 'Միջին տևողություն',
    details: 'Ուղևորությունների մանրամասներ',
    date: 'Ամսաթիվ',
    driver: 'Վարորդ',
    passenger: 'Ուղևոր',
    from: 'Որտեղից',
    to: 'Որտեղ',
    distance: 'Հեռավորություն',
    duration: 'Տևողություն',
    status: 'Կարգավիճակ',
    km: 'կմ',
    min: 'ր',
    minutes: 'րոպե',
    generatedOn: 'Ստեղծված է {{date}}',
  },
  de: {
    title: 'Fahrtenbericht',
    period: 'Zeitraum: {{period}}',
    summary: 'Zusammenfassung',
    totalTrips: 'Fahrten gesamt',
    totalDistance: 'Gesamtstrecke',
    totalDuration: 'Gesamtdauer',
    avgDistance: 'Ø Strecke',
    avgDuration: 'Ø Dauer',
    details: 'Fahrtendetails',
    date: 'Datum',
    driver: 'Fahrer',
    passenger: 'Passagier',
    from: 'Von',
    to: 'Nach',
    distance: 'Strecke',
    duration: 'Dauer',
    status: 'Status',
    km: 'km',
    min: 'Min.',
    minutes: 'Minuten',
    generatedOn: 'Erstellt am {{date}}',
  },
};

function normalizeLang(lang?: string): ExportLang {
  const code = (lang || 'en').slice(0, 2).toLowerCase();
  return code === 'ru' || code === 'hy' || code === 'de' ? code : 'en';
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export function exportTripsToPDF(
  trips: TripData[],
  stats: TripStats,
  filename: string = 'driver-report.pdf',
  lang?: string,
) {
  const t = DICT[normalizeLang(lang)];
  const docDefinition: any = {
    content: [
      // Header
      { text: t.title, style: 'header', alignment: 'center' },
      {
        text: interpolate(t.period, { period: stats.period }),
        style: 'subheader',
        alignment: 'center',
        margin: [0, 0, 0, 20],
      },

      // Summary Statistics
      { text: t.summary, style: 'sectionHeader' },
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              { text: t.totalTrips, style: 'tableHeader' },
              { text: stats.totalTrips.toString(), alignment: 'right' },
            ],
            [
              { text: t.totalDistance, style: 'tableHeader' },
              { text: `${stats.totalDistance.toFixed(2)} ${t.km}`, alignment: 'right' },
            ],
            [
              { text: t.totalDuration, style: 'tableHeader' },
              { text: `${stats.totalDuration} ${t.minutes}`, alignment: 'right' },
            ],
            [
              { text: t.avgDistance, style: 'tableHeader' },
              {
                text: `${(stats.totalDistance / stats.totalTrips || 0).toFixed(2)} ${t.km}`,
                alignment: 'right',
              },
            ],
            [
              { text: t.avgDuration, style: 'tableHeader' },
              {
                text: `${(stats.totalDuration / stats.totalTrips || 0).toFixed(1)} ${t.min}`,
                alignment: 'right',
              },
            ],
          ],
        },
        margin: [0, 0, 0, 20],
      },

      // Trip Details
      { text: t.details, style: 'sectionHeader' },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', '*', '*', 'auto', 'auto', 'auto'],
          body: [
            [t.date, t.driver, t.passenger, t.from, t.to, t.distance, t.duration, t.status],
            ...trips.map((trip) => [
              trip.date,
              trip.driver,
              trip.passenger,
              trip.from,
              trip.to,
              `${trip.distanceKm} ${t.km}`,
              `${trip.durationMin} ${t.min}`,
              trip.status,
            ]),
          ],
        },
        style: 'table',
      },

      // Footer
      {
        text: interpolate(t.generatedOn, { date: new Date().toLocaleDateString() }),
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
