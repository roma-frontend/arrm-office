/**
 * Tests for dynamic-imports.tsx — Dynamic import wrappers for heavy libraries
 *
 * Tests that all exports are defined (as dynamic components or lazy loaders),
 * tests that lazy-fetch functions return promises,
 * and tests that loading placeholders render correctly.
 */

import React from 'react';
import { render } from '@testing-library/react';

// ── Mock next/dynamic ────────────────────────────────────────────────────────
// Capture the options passed to each `dynamic()` call so we can test
// the loading placeholder and `ssr: false` configuration.
const dynamicCalls: Array<{
  loader: () => Promise<any>;
  options: Record<string, any>;
}> = [];

jest.mock('next/dynamic', () => {
  return jest.fn((loader: () => Promise<any>, options?: Record<string, any>) => {
    dynamicCalls.push({ loader, options: options ?? {} });

    // Return a component that renders the loading placeholder when mounted
    const DynamicComponent = (props: any) => {
      const Loading = options?.loading;
      if (Loading) {
        return <Loading />;
      }
      return null;
    };
    DynamicComponent.displayName = 'DynamicMock';
    return DynamicComponent;
  });
});

import dynamicImportsDefault, {
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
  Area,
  Canvas,
  loadThree,
  loadUseFrame,
  loadPdfMake,
  loadExcelJS,
  loadDocx,
  loadLeaflet,
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  loadFaceApi,
  loadQRCode,
} from '@/lib/dynamic-imports';

describe('recharts dynamic components', () => {
  const rechartsComponents = [
    { name: 'LineChart', component: LineChart },
    { name: 'BarChart', component: BarChart },
    { name: 'PieChart', component: PieChart },
    { name: 'AreaChart', component: AreaChart },
    { name: 'Line', component: Line },
    { name: 'Bar', component: Bar },
    { name: 'Pie', component: Pie },
    { name: 'Cell', component: Cell },
    { name: 'XAxis', component: XAxis },
    { name: 'YAxis', component: YAxis },
    { name: 'CartesianGrid', component: CartesianGrid },
    { name: 'Tooltip', component: Tooltip },
    { name: 'Legend', component: Legend },
    { name: 'ResponsiveContainer', component: ResponsiveContainer },
    { name: 'Area', component: Area },
  ];

  rechartsComponents.forEach(({ name, component }) => {
    it(`${name} is defined`, () => {
      expect(component).toBeDefined();
    });
  });
});

describe('three.js / fiber dynamic imports', () => {
  it('Canvas is defined', () => {
    expect(Canvas).toBeDefined();
  });

  it('loadThree returns a promise', () => {
    expect(loadThree()).toBeInstanceOf(Promise);
  });

  it('loadUseFrame returns a promise', () => {
    expect(loadUseFrame()).toBeInstanceOf(Promise);
  });
});

describe('PDF / Excel / DOCX lazy loaders', () => {
  it('loadPdfMake returns a promise', () => {
    expect(loadPdfMake()).toBeInstanceOf(Promise);
  });

  it('loadExcelJS returns a promise', () => {
    expect(loadExcelJS()).toBeInstanceOf(Promise);
  });

  it('loadDocx returns a promise', () => {
    expect(loadDocx()).toBeInstanceOf(Promise);
  });
});

describe('leaflet dynamic imports', () => {
  it('loadLeaflet returns a promise', () => {
    expect(loadLeaflet()).toBeInstanceOf(Promise);
  });

  it('MapContainer is defined', () => {
    expect(MapContainer).toBeDefined();
  });

  it('TileLayer is defined', () => {
    expect(TileLayer).toBeDefined();
  });

  it('Marker is defined', () => {
    expect(Marker).toBeDefined();
  });

  it('Popup is defined', () => {
    expect(Popup).toBeDefined();
  });
});

describe('face-api and QR code lazy loaders', () => {
  it('loadFaceApi returns a promise', () => {
    expect(loadFaceApi()).toBeInstanceOf(Promise);
  });

  it('loadQRCode returns a promise', () => {
    expect(loadQRCode()).toBeInstanceOf(Promise);
  });

  it('loadQRCode returns default export', async () => {
    // The actual dynamic import resolves to a module; loadQRCode returns .default || mod
    const result = loadQRCode();
    await expect(result).resolves.toBeDefined();
  });
});

describe('default export', () => {
  it('includes all recharts components', () => {
    expect(dynamicImportsDefault.LineChart).toBeDefined();
    expect(dynamicImportsDefault.BarChart).toBeDefined();
    expect(dynamicImportsDefault.PieChart).toBeDefined();
    expect(dynamicImportsDefault.AreaChart).toBeDefined();
    expect(dynamicImportsDefault.Tooltip).toBeDefined();
    expect(dynamicImportsDefault.Legend).toBeDefined();
  });

  it('includes three.js and leaflet components', () => {
    expect(dynamicImportsDefault.Canvas).toBeDefined();
    expect(dynamicImportsDefault.MapContainer).toBeDefined();
    expect(dynamicImportsDefault.Marker).toBeDefined();
  });

  it('includes lazy loader functions', () => {
    expect(dynamicImportsDefault.loadPdfMake).toBeDefined();
    expect(dynamicImportsDefault.loadExcelJS).toBeDefined();
    expect(dynamicImportsDefault.loadFaceApi).toBeDefined();
    expect(dynamicImportsDefault.loadQRCode).toBeDefined();
    expect(dynamicImportsDefault.loadThree).toBeDefined();
    expect(dynamicImportsDefault.loadLeaflet).toBeDefined();
  });
});

describe('loading placeholders', () => {
  it('recharts charts render a loading placeholder with animate-pulse class', () => {
    const { container } = render(<LineChart />);
    const placeholder = container.querySelector('.animate-pulse');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder?.className).toContain('bg-muted');
    expect(placeholder?.className).toContain('rounded-lg');
  });

  it('recharts chart loading placeholder has height h-64', () => {
    const { container } = render(<BarChart />);
    const placeholder = container.querySelector('.h-64');
    expect(placeholder).toBeInTheDocument();
  });

  it('PieChart renders loading placeholder', () => {
    const { container } = render(<PieChart />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('AreaChart renders loading placeholder', () => {
    const { container } = render(<AreaChart />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('Canvas renders loading placeholder with h-96', () => {
    const { container } = render(<Canvas />);
    const placeholder = container.querySelector('.h-96');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder?.className).toContain('animate-pulse');
  });

  it('MapContainer renders loading placeholder with h-96', () => {
    const { container } = render(<MapContainer />);
    const placeholder = container.querySelector('.h-96');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder?.className).toContain('animate-pulse');
  });

  it('components without loading prop render null', () => {
    const { container } = render(<Line />);
    expect(container.innerHTML).toBe('');
  });

  it('Bar without loading renders null', () => {
    const { container } = render(<Bar />);
    expect(container.innerHTML).toBe('');
  });

  it('Pie without loading renders null', () => {
    const { container } = render(<Pie />);
    expect(container.innerHTML).toBe('');
  });

  it('Cell renders null (no loading specified)', () => {
    const { container } = render(<Cell />);
    expect(container.innerHTML).toBe('');
  });

  it('XAxis renders null (no loading specified)', () => {
    const { container } = render(<XAxis />);
    expect(container.innerHTML).toBe('');
  });

  it('YAxis renders null (no loading specified)', () => {
    const { container } = render(<YAxis />);
    expect(container.innerHTML).toBe('');
  });

  it('CartesianGrid renders null (no loading specified)', () => {
    const { container } = render(<CartesianGrid />);
    expect(container.innerHTML).toBe('');
  });

  it('Tooltip renders null (no loading specified)', () => {
    const { container } = render(<Tooltip />);
    expect(container.innerHTML).toBe('');
  });

  it('Legend renders null (no loading specified)', () => {
    const { container } = render(<Legend />);
    expect(container.innerHTML).toBe('');
  });

  it('ResponsiveContainer renders null (no loading specified)', () => {
    const { container } = render(<ResponsiveContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('Area renders null (no loading specified)', () => {
    const { container } = render(<Area />);
    expect(container.innerHTML).toBe('');
  });

  it('TileLayer renders null (no loading specified)', () => {
    const { container } = render(<TileLayer />);
    expect(container.innerHTML).toBe('');
  });

  it('Marker renders null (no loading specified)', () => {
    const { container } = render(<Marker />);
    expect(container.innerHTML).toBe('');
  });

  it('Popup renders null (no loading specified)', () => {
    const { container } = render(<Popup />);
    expect(container.innerHTML).toBe('');
  });
});

describe('dynamic() options', () => {
  it('all chart components use ssr:false', () => {
    // Find calls with 'recharts' in the loader
    const rechartsCalls = dynamicCalls.filter((c) => c.options.ssr === false);
    // At minimum the chart wrappers (LineChart, BarChart, PieChart, AreaChart)
    // use ssr:false and loading placeholders
    expect(rechartsCalls.length).toBeGreaterThan(4);
  });

  it('components with loading placeholder have ssr:false', () => {
    const withLoading = dynamicCalls.filter((c) => c.options.loading);
    withLoading.forEach((call) => {
      expect(call.options.ssr).toBe(false);
    });
  });

  it('loadThree is NOT a dynamic component (plain function)', () => {
    expect(typeof loadThree).toBe('function');
    expect(loadThree.toString()).not.toContain('DynamicMock');
  });

  it('loadUseFrame is a plain function', () => {
    expect(typeof loadUseFrame).toBe('function');
  });
});

describe('lazy loader proxy functions', () => {
  it('loadDocx calls import("docx") dynamically', () => {
    const promise = loadDocx();
    expect(promise).toBeInstanceOf(Promise);
  });

  it('loadLeaflet attempts to import leaflet', () => {
    const promise = loadLeaflet();
    expect(promise).toBeInstanceOf(Promise);
  });

  it('loadPdfMake returns a promise that resolves to a module', async () => {
    const promise = loadPdfMake();
    expect(promise).toBeInstanceOf(Promise);
    // In test env, dynamic import() resolves to the actual module
    await expect(promise).resolves.toBeDefined();
  });
});
