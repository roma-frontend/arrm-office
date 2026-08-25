/**
 * Export driver trips to Excel/CSV.
 * Headers are localized (en / ru / hy / de); EN is the fallback.
 */

import ExcelJS from 'exceljs';

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

interface ExportDict {
  sheet: string;
  date: string;
  driver: string;
  passenger: string;
  from: string;
  to: string;
  purpose: string;
  distance: string;
  duration: string;
  status: string;
}

const DICT: Record<ExportLang, ExportDict> = {
  en: {
    sheet: 'Trips',
    date: 'Date',
    driver: 'Driver',
    passenger: 'Passenger',
    from: 'From',
    to: 'To',
    purpose: 'Purpose',
    distance: 'Distance (km)',
    duration: 'Duration (min)',
    status: 'Status',
  },
  ru: {
    sheet: 'Поездки',
    date: 'Дата',
    driver: 'Водитель',
    passenger: 'Пассажир',
    from: 'Откуда',
    to: 'Куда',
    purpose: 'Цель',
    distance: 'Расстояние (км)',
    duration: 'Длительность (мин)',
    status: 'Статус',
  },
  hy: {
    sheet: 'Ուղևորություններ',
    date: 'Ամսաթիվ',
    driver: 'Վարորդ',
    passenger: 'Ուղևոր',
    from: 'Որտեղից',
    to: 'Որտեղ',
    purpose: 'Նպատակ',
    distance: 'Հեռավորություն (կմ)',
    duration: 'Տևողություն (ր)',
    status: 'Կարգավիճակ',
  },
  de: {
    sheet: 'Fahrten',
    date: 'Datum',
    driver: 'Fahrer',
    passenger: 'Passagier',
    from: 'Von',
    to: 'Nach',
    purpose: 'Zweck',
    distance: 'Strecke (km)',
    duration: 'Dauer (Min.)',
    status: 'Status',
  },
};

function normalizeLang(lang?: string): ExportLang {
  const code = (lang || 'en').slice(0, 2).toLowerCase();
  return code === 'ru' || code === 'hy' || code === 'de' ? code : 'en';
}

export async function exportTripsToExcel(
  trips: TripData[],
  filename: string = 'driver-trips.xlsx',
  lang?: string,
) {
  const t = DICT[normalizeLang(lang)];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t.sheet);

  // Fixed keys (locale-independent) with localized headers
  worksheet.columns = [
    { header: t.date, key: 'date', width: 15 },
    { header: t.driver, key: 'driver', width: 20 },
    { header: t.passenger, key: 'passenger', width: 20 },
    { header: t.from, key: 'from', width: 20 },
    { header: t.to, key: 'to', width: 20 },
    { header: t.purpose, key: 'purpose', width: 25 },
    { header: t.distance, key: 'distance_km', width: 15 },
    { header: t.duration, key: 'duration_min', width: 15 },
    { header: t.status, key: 'status', width: 15 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Add trip data
  trips.forEach((trip) => {
    worksheet.addRow({
      date: trip.date,
      driver: trip.driver,
      passenger: trip.passenger,
      from: trip.from,
      to: trip.to,
      purpose: trip.purpose,
      distance_km: trip.distanceKm,
      duration_min: trip.durationMin,
      status: trip.status,
    });
  });

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();

  // Create blob and download
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);

  return { success: true, message: 'Excel file downloaded' };
}

export function exportTripsToCSV(
  trips: TripData[],
  filename: string = 'driver-trips.csv',
  lang?: string,
) {
  const t = DICT[normalizeLang(lang)];
  const headers = [
    t.date,
    t.driver,
    t.passenger,
    t.from,
    t.to,
    t.purpose,
    t.distance,
    t.duration,
    t.status,
  ];

  const csv = [
    headers.join(','),
    ...trips.map((trip) =>
      [
        trip.date,
        trip.driver,
        trip.passenger,
        trip.from,
        trip.to,
        trip.purpose,
        trip.distanceKm,
        trip.durationMin,
        trip.status,
      ].join(','),
    ),
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);

  return { success: true, message: 'CSV file downloaded' };
}
