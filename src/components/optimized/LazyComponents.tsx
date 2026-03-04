/**
 * Lazy-loaded компоненты для оптимизации производительности
 * Тяжелые библиотеки загружаются только когда нужны
 */

import dynamic from 'next/dynamic';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

// Компонент загрузки
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <ShieldLoader size="md" />
  </div>
);

// ===== 3D КОМПОНЕНТЫ (Three.js - очень тяжелый) =====
export const Lazy3DScene = dynamic(
  () => import('@/components/3d/Scene').catch(() => ({ default: () => null })),
  {
    loading: () => <LoadingSpinner />,
    ssr: false, // Отключить SSR для 3D
  }
);

// ===== AI CHAT WIDGET (большие AI библиотеки) =====
export const LazyChatWidget = dynamic(
  () => import('@/components/ai/ChatWidget'),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

// ===== CHARTS (Recharts - тяжелая библиотека) =====
export const LazyChart = dynamic(
  () => import('@/components/analytics/Chart'),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

export const LazyRevenueChart = dynamic(
  () => import('@/components/analytics/RevenueChart'),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

// ===== FACE RECOGNITION (face-api.js - очень тяжелый) =====
export const LazyFaceRecognition = dynamic(
  () => import('@/components/face-recognition/FaceRecognition'),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

// ===== CALENDAR (react-day-picker) =====
export const LazyCalendar = dynamic(
  () => import('@/components/ui/calendar').then(mod => ({ default: mod.Calendar })),
  {
    loading: () => <LoadingSpinner />,
    ssr: true, // Календарь можно рендерить на сервере
  }
);

// ===== RICH TEXT EDITOR (если есть) =====
export const LazyRichEditor = dynamic(
  () => import('@/components/editor/RichEditor').catch(() => ({ default: () => null })),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

// ===== PDF VIEWER/GENERATOR =====
export const LazyPDFViewer = dynamic(
  () => import('@/components/pdf/PDFViewer').catch(() => ({ default: () => null })),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

// ===== EXCEL EXPORT =====
export const LazyExcelExport = dynamic(
  () => import('@/components/export/ExcelExport').catch(() => ({ default: () => null })),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

// ===== МОДАЛЫ (можно загружать по требованию) =====
export const LazyModal = dynamic(
  () => import('@/components/ui/dialog').then(mod => ({ default: mod.Dialog })),
  {
    loading: () => null, // Модалы без загрузчика
    ssr: false,
  }
);

// ===== ПРОФИЛЬ С АВАТАРОМ =====
export const LazyAvatarUpload = dynamic(
  () => import('@/components/ui/avatar-upload'),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  }
);

export default {
  Lazy3DScene,
  LazyChatWidget,
  LazyChart,
  LazyRevenueChart,
  LazyFaceRecognition,
  LazyCalendar,
  LazyRichEditor,
  LazyPDFViewer,
  LazyExcelExport,
  LazyModal,
  LazyAvatarUpload,
};
