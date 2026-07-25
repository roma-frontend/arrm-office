/**
 * Tests for dynamic-imports.tsx — Dynamic import wrappers for heavy libraries
 *
 * Tests that all exports are defined (as dynamic components or lazy loaders),
 * tests that lazy-fetch functions return promises.
 */

// Mock next/dynamic to prevent child process crashes in jsdom
jest.mock('next/dynamic', () => {
  return jest.fn(() => {
    const MockComponent = (props: any) => null;
    MockComponent.displayName = 'DynamicMock';
    return MockComponent;
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
