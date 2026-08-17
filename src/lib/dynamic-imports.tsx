/**
 * Dynamic imports for heavy libraries.
 * Use these instead of direct imports to reduce initial bundle size.
 *
 * @vladmandic/face-api ≈ 2MB — should NEVER be in the initial bundle
 * three.js + @react-three/fiber — only needed on specific pages
 * recharts — only needed on analytics/reports pages
 * pdfmake — only needed when exporting PDFs
 * leaflet — only needed on map pages
 */

import dynamic from 'next/dynamic';

// ══════════════════════════════════════════════════════════════
// RECHARTS - Charts & Data Visualization (~100 KiB)
// Use these in components instead of direct imports from 'recharts'
// ══════════════════════════════════════════════════════════════

export const LineChart = dynamic(() => import('recharts').then((mod) => mod.LineChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" />,
});

export const BarChart = dynamic(() => import('recharts').then((mod) => mod.BarChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" />,
});

export const PieChart = dynamic(() => import('recharts').then((mod) => mod.PieChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" />,
});

export const AreaChart = dynamic(() => import('recharts').then((mod) => mod.AreaChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" />,
});

export const Line = dynamic(() => import('recharts').then((mod) => mod.Line), { ssr: false });

export const Bar = dynamic(() => import('recharts').then((mod) => mod.Bar), { ssr: false });

export const Pie = dynamic(() => import('recharts').then((mod) => mod.Pie), { ssr: false });

export const Cell = dynamic(() => import('recharts').then((mod) => mod.Cell), { ssr: false });

export const XAxis = dynamic(() => import('recharts').then((mod) => mod.XAxis), { ssr: false });

export const YAxis = dynamic(() => import('recharts').then((mod) => mod.YAxis), { ssr: false });

export const CartesianGrid = dynamic(() => import('recharts').then((mod) => mod.CartesianGrid), {
  ssr: false,
});

export const Tooltip = dynamic(() => import('recharts').then((mod) => mod.Tooltip), { ssr: false });

export const Legend = dynamic(() => import('recharts').then((mod) => mod.Legend), { ssr: false });

export const ResponsiveContainer = dynamic(
  () => import('recharts').then((mod) => mod.ResponsiveContainer),
  {
    ssr: false,
  },
);

export const Area = dynamic(() => import('recharts').then((mod) => mod.Area), { ssr: false });

// ══════════════════════════════════════════════════════════════
// THREE.JS — dynamic import for 3D components
// ══════════════════════════════════════════════════════════════
export const loadThree = () => import('three').then((mod) => mod);

// ══════════════════════════════════════════════════════════════
// REACT-THREE/FIBER — 3D rendering (~200 KiB)
// ══════════════════════════════════════════════════════════════
export const Canvas = dynamic(() => import('@react-three/fiber').then((mod) => mod.Canvas), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse bg-muted rounded-lg" />,
});

export const loadUseFrame = () => import('@react-three/fiber').then((mod) => mod.useFrame);

// ══════════════════════════════════════════════════════════════
// PDFMAKE — dynamic import for PDF generation
// ══════════════════════════════════════════════════════════════
export const loadPdfMake = () => import('pdfmake/build/pdfmake').then((mod) => mod.default || mod);

// ══════════════════════════════════════════════════════════════
// EXCELJS — dynamic import for Excel generation (~150 KiB)
// ══════════════════════════════════════════════════════════════
export const loadExcelJS = () => import('exceljs').then((mod) => mod);

// ══════════════════════════════════════════════════════════════
// DOCX — dynamic import for Word (.docx) generation
// ══════════════════════════════════════════════════════════════
export const loadDocx = () => import('docx').then((mod) => mod);

// ══════════════════════════════════════════════════════════════
// MAMMOTH — dynamic import for reading uploaded .docx files back in.
// Resolves to mammoth's browser build via its package `browser` field.
// ══════════════════════════════════════════════════════════════
export const loadMammoth = () => import('mammoth').then((mod) => mod.default || mod);

// ══════════════════════════════════════════════════════════════
// LEAFLET — dynamic import for maps
// ══════════════════════════════════════════════════════════════
export const loadLeaflet = () => import('leaflet').then((mod) => mod.default || mod);

// ══════════════════════════════════════════════════════════════
// REACT-LEAFLET — React bindings for Leaflet (~50 KiB)
// ══════════════════════════════════════════════════════════════
export const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse bg-muted rounded-lg" />,
});

export const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), {
  ssr: false,
});

export const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), {
  ssr: false,
});

export const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), {
  ssr: false,
});

// ══════════════════════════════════════════════════════════════
// FACE-API (@vladmandic/face-api ~2MB) — dynamic import
// ══════════════════════════════════════════════════════════════
export const loadFaceApi = () => import('@vladmandic/face-api').then((mod) => mod);

// ══════════════════════════════════════════════════════════════
// QRCODE — dynamic import
// ══════════════════════════════════════════════════════════════
export const loadQRCode = () => import('qrcode').then((mod) => mod.default || mod);

// ══════════════════════════════════════════════════════════════
// EXPORT ALL FOR CONVENIENCE
// ══════════════════════════════════════════════════════════════
export default {
  // Recharts
  LineChart,
  BarChart,
  PieChart,
  AreaChart,
  Line,
  Bar,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  // Three.js
  Canvas,
  loadUseFrame,
  loadThree,
  // Leaflet
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  loadLeaflet,
  // PDF/Excel
  loadPdfMake,
  loadExcelJS,
  // Face API
  loadFaceApi,
  // QR Code
  loadQRCode,
};
