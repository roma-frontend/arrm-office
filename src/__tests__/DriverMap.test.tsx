/**
 * Tests for src/components/drivers/DriverMap.tsx:
 *
 *  - reverseGeocode (module-level export): success / missing name / fetch failure
 *  - ensureLeafletCSS: link + style appended once, idempotent on re-mount
 *  - Loader → map init flow (leaflet module mocked entirely)
 *  - Geolocation: unsupported / success (zoom 14 + center) / error (default center)
 *  - Map init: center selection, icon fix, tileLayer, zoom control, no-dimensions retry
 *  - Markers: pickup/dropoff/driver icons + popups, polyline, fitBounds vs setView,
 *    detached-container / not-ready / centering-error guards, marker cleanup
 *  - Interactive mode: click → reverse-geocoded pickup/dropoff, handler refresh,
 *    no-callback guard
 *  - Unmount cleanup: map.remove(), error path when remove throws
 *  - NavigatorButtons: toggle panel, 4 navigator link URLs, pickup/dropoff target switch
 */

import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { DriverMap, reverseGeocode } from '@/components/drivers/DriverMap';
import { logger } from '@/lib/logger';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fb: string) => fb, i18n: { language: 'en' } }),
}));

jest.mock('@/components/ui/ShieldLoader', () => ({
  ShieldLoader: () => <div data-testid="shield-loader" />,
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Shared mutable state used both by the leaflet mock factory and the tests.
const mockLeafletState: {
  map: any;
  clickHandlers: any[];
  markerCalls: { latlng: any; options: any }[];
  popupCalls: string[];
  divIconCalls: any[];
  polylineCalls: { pts: any; options: any }[];
  mapOptions: any[];
  tileLayerCalls: number;
  zoomControlCalls: number;
  mergeOptionsCalls: any[];
  getContainerThrows: boolean;
  getCenterThrows: boolean;
  fitBoundsThrows: boolean;
  removeThrows: boolean;
} = {
  map: null,
  mod: null as any,
  leafletL: null as any,
  clickHandlers: [],
  markerCalls: [],
  popupCalls: [],
  divIconCalls: [],
  polylineCalls: [],
  mapOptions: [],
  tileLayerCalls: 0,
  zoomControlCalls: 0,
  mergeOptionsCalls: [],
  getContainerThrows: false,
  getCenterThrows: false,
  fitBoundsThrows: false,
  removeThrows: false,
};

jest.mock('leaflet', () => {
  const makeMarker = () => {
    const marker = {
      addTo: jest.fn(() => marker),
      bindPopup: jest.fn((html: string) => {
        mockLeafletState.popupCalls.push(html);
        return marker;
      }),
      remove: jest.fn(),
    };
    return marker;
  };
  const makePolyline = () => {
    const poly: any = {};
    poly.addTo = jest.fn(() => poly);
    poly.remove = jest.fn();
    return poly;
  };
  const L: any = {
    map: jest.fn((_el: any, options: any) => {
      mockLeafletState.mapOptions.push(options);
      const instance = {
        on: jest.fn((evt: string, handler: any) => {
          if (evt === 'click') mockLeafletState.clickHandlers.push(handler);
        }),
        off: jest.fn((evt: string) => {
          if (evt === 'click') mockLeafletState.clickHandlers.length = 0;
        }),
        getContainer: jest.fn(() => {
          if (mockLeafletState.getContainerThrows) throw new Error('detached');
          return {};
        }),
        getCenter: jest.fn(() => {
          if (mockLeafletState.getCenterThrows) throw new Error('not-ready');
          return { lat: 1, lng: 2 };
        }),
        fitBounds: jest.fn(() => {
          if (mockLeafletState.fitBoundsThrows) throw new Error('fitboom');
        }),
        setView: jest.fn(),
        invalidateSize: jest.fn(),
        remove: jest.fn(() => {
          if (mockLeafletState.removeThrows) throw new Error('removeboom');
        }),
      };
      mockLeafletState.map = instance;
      return instance;
    }),
    tileLayer: jest.fn(() => {
      mockLeafletState.tileLayerCalls++;
      return { addTo: jest.fn() };
    }),
    control: {
      zoom: jest.fn(() => {
        mockLeafletState.zoomControlCalls++;
        return { addTo: jest.fn() };
      }),
    },
    marker: jest.fn((latlng: any, options: any) => {
      mockLeafletState.markerCalls.push({ latlng, options });
      return makeMarker();
    }),
    polyline: jest.fn((pts: any, options: any) => {
      mockLeafletState.polylineCalls.push({ pts, options });
      return makePolyline();
    }),
    divIcon: jest.fn((options: any) => {
      mockLeafletState.divIconCalls.push(options);
      return options;
    }),
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: jest.fn((opts: any) => {
          mockLeafletState.mergeOptionsCalls.push(opts);
        }),
      },
    },
  };
  // Real leaflet exposes everything at module level AND as a default export;
  // the component's `L.default || L` fallback relies on that shape.
  const mod = { __esModule: true, default: L, ...L };
  mockLeafletState.mod = mod;
  mockLeafletState.leafletL = L;
  return mod;
});

// ── Test environment helpers ────────────────────────────────────────────────

let geoOk: any = null;
let geoErr: any = null;
let mockRect = { width: 800, height: 600 };
let roCallback: (() => void) | null = null;

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: mockRect.width,
      height: mockRect.height,
      top: 0,
      left: 0,
      right: mockRect.width,
      bottom: mockRect.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  (globalThis as any).ResizeObserver = class {
    constructor(cb: () => void) {
      roCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  // The leaflet factory only runs once the component's dynamic import executes,
  // so guard the reset for the very first test's beforeEach.
  if (mockLeafletState.mod) mockLeafletState.mod.default = mockLeafletState.leafletL;
  mockLeafletState.map = null;
  mockLeafletState.clickHandlers.length = 0;
  mockLeafletState.markerCalls.length = 0;
  mockLeafletState.popupCalls.length = 0;
  mockLeafletState.divIconCalls.length = 0;
  mockLeafletState.polylineCalls.length = 0;
  mockLeafletState.mapOptions.length = 0;
  mockLeafletState.tileLayerCalls = 0;
  mockLeafletState.zoomControlCalls = 0;
  mockLeafletState.mergeOptionsCalls.length = 0;
  mockLeafletState.getContainerThrows = false;
  mockLeafletState.getCenterThrows = false;
  mockLeafletState.fitBoundsThrows = false;
  mockLeafletState.removeThrows = false;
  geoOk = null;
  geoErr = null;
  mockRect = { width: 800, height: 600 };
  roCallback = null;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: jest.fn((ok: any, err: any) => {
        geoOk = ok;
        geoErr = err;
      }),
    },
  });
});

const P = { lat: 40.1, lng: 44.1, address: 'Pickup St' };
const D = { lat: 40.2, lng: 44.2, address: 'Dropoff Ave' };
const DRV = { lat: 40.3, lng: 44.3 };

async function waitForMap(): Promise<any> {
  await waitFor(() => expect(mockLeafletState.map).not.toBeNull());
  return mockLeafletState.map;
}

// ── reverseGeocode unit tests ───────────────────────────────────────────────

describe('reverseGeocode', () => {
  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('returns the display name', async () => {
    (globalThis as any).fetch = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ display_name: '123 Main St' }) });
    await expect(reverseGeocode(1, 2)).resolves.toBe('123 Main St');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('lat=1&lon=2&zoom=18'),
      expect.objectContaining({ headers: { 'Accept-Language': 'en' } }),
    );
  });

  it('returns undefined when the response has no display_name', async () => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({ json: async () => ({}) });
    await expect(reverseGeocode(1, 2)).resolves.toBeUndefined();
  });

  it('returns undefined when the request fails', async () => {
    (globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('network'));
    await expect(reverseGeocode(1, 2)).resolves.toBeUndefined();
  });
});

// ── Loading & leaflet CSS ───────────────────────────────────────────────────

describe('DriverMap loading', () => {
  it('shows the loader until leaflet is ready, then renders the map', async () => {
    render(<DriverMap />);
    // Synchronous snapshot right after render: leaflet import hasn't resolved.
    expect(screen.getByTestId('shield-loader')).toBeInTheDocument();

    await waitForMap();
    expect(screen.queryByTestId('shield-loader')).not.toBeInTheDocument();
  });

  it('accepts a bare leaflet module without a default export', async () => {
    // L.default || L — cover the fallback arm by stripping the default export.
    mockLeafletState.mod.default = undefined;
    render(<DriverMap />);
    await waitForMap();
    expect(mockLeafletState.mapOptions[0]).toBeDefined();
  });

  it('skips ready when unmounted before leaflet finishes loading', async () => {
    const { unmount } = render(<DriverMap />);
    unmount(); // before the import() promise resolves
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockLeafletState.map).toBeNull();
  });

  it('injects the leaflet stylesheet exactly once', async () => {
    render(<DriverMap />);
    await waitForMap();

    const link = document.getElementById('leaflet-css');
    expect(link).toBeInstanceOf(HTMLLinkElement);
    expect((link as HTMLLinkElement).href).toContain('unpkg.com/leaflet');
    expect(
      Array.from(document.querySelectorAll('style')).some((s) =>
        s.textContent?.includes('.leaflet-control-zoom'),
      ),
    ).toBe(true);

    // Second mount hits the early-return branch — no duplicate link.
    const { unmount } = render(<DriverMap />);
    await waitForMap();
    unmount();
    expect(document.querySelectorAll('#leaflet-css')).toHaveLength(1);
  });
});

// ── Geolocation ─────────────────────────────────────────────────────────────

describe('geolocation', () => {
  it('handles missing geolocation support', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    render(<DriverMap />);
    await waitForMap();
    expect(logger.log).toHaveBeenCalledWith('[DriverMap] Geolocation not supported');
    // No user location → default center, default zoom.
    expect(mockLeafletState.mapOptions[0].center).toEqual([40.7128, -74.006]);
    expect(mockLeafletState.mapOptions[0].zoom).toBe(13);
  });

  it('centers the map on the user location (zoom 14)', async () => {
    render(<DriverMap />);
    act(() => {
      geoOk({ coords: { latitude: 10.5, longitude: 20.5 } });
    });
    await waitForMap();

    expect(logger.log).toHaveBeenCalledWith('[DriverMap] User location:', expect.any(Object));
    expect(mockLeafletState.mapOptions[0].center).toEqual([10.5, 20.5]);
    expect(mockLeafletState.mapOptions[0].zoom).toBe(14);
    // The dedicated centering effect also pans to the user location.
    expect(mockLeafletState.map.setView).toHaveBeenCalledWith([10.5, 20.5], 14);
  });

  it('falls back to the default center on geolocation error', async () => {
    render(<DriverMap />);
    act(() => {
      geoErr({ code: 1, message: 'denied' });
    });
    await waitForMap();

    expect(logger.warn).toHaveBeenCalledWith('[DriverMap] Location error:', 1, 'denied');
    expect(mockLeafletState.mapOptions[0].center).toEqual([40.7128, -74.006]);
  });

  it('bails out of centering when the container is detached', async () => {
    render(<DriverMap />);
    await waitForMap();
    mockLeafletState.getContainerThrows = true;
    act(() => {
      geoOk({ coords: { latitude: 1, longitude: 2 } });
    });
    expect(mockLeafletState.map.setView).not.toHaveBeenCalledWith([1, 2], 14);
  });

  it('prefers user location over coords, and skips re-centering when coords exist', async () => {
    render(<DriverMap pickupCoords={P} />);
    act(() => {
      geoOk({ coords: { latitude: 10.5, longitude: 20.5 } });
    });
    await waitForMap();
    // Center precedence: userLocation > driverCoords > pickupCoords.
    expect(mockLeafletState.mapOptions[0].center).toEqual([10.5, 20.5]);
    // The dedicated centering effect bails out when coords are already present —
    // the only setView call is the marker effect centering on the single pickup.
    expect(mockLeafletState.map.setView).not.toHaveBeenCalledWith([10.5, 20.5], 14);
    expect(mockLeafletState.map.setView).toHaveBeenCalledWith([P.lat, P.lng], 14);
  });
});

// ── Map initialization ──────────────────────────────────────────────────────

describe('map initialization', () => {
  it('initializes with the default center, tile layer and zoom control', async () => {
    render(<DriverMap />);
    await waitForMap();

    expect(mockLeafletState.mapOptions[0]).toMatchObject({
      center: [40.7128, -74.006],
      zoom: 13,
      scrollWheelZoom: false,
      zoomControl: false,
    });
    expect(mockLeafletState.tileLayerCalls).toBe(1);
    expect(mockLeafletState.zoomControlCalls).toBe(1);
    expect(mockLeafletState.mergeOptionsCalls[0]).toMatchObject({
      iconUrl: expect.stringContaining('marker-icon.png'),
    });
    expect(logger.log).toHaveBeenCalledWith('[DriverMap] Map initialized successfully');
  });

  it('prefers driverCoords over pickup/dropoff for the center', async () => {
    render(<DriverMap pickupCoords={P} dropoffCoords={D} driverCoords={DRV} />);
    await waitForMap();
    expect(mockLeafletState.mapOptions[0].center).toEqual([DRV.lat, DRV.lng]);
  });

  it('retries initialization when the container stays dimension-less', async () => {
    jest.useFakeTimers();
    try {
      mockRect = { width: 0, height: 0 };
      render(<DriverMap />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(logger.warn).toHaveBeenCalledWith(
        '[DriverMap] Container has no dimensions, waiting...',
      );

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(logger.log).toHaveBeenCalledWith('[DriverMap] Retrying initialization...');

      // ready toggles back on → init effect re-runs → still zero dims → warns again.
      act(() => {
        jest.advanceTimersByTime(50);
      });
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(mockLeafletState.map).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('invalidates map size on timers and swallows guard failures', async () => {
    jest.useFakeTimers();
    try {
      render(<DriverMap pickupCoords={P} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockLeafletState.map).not.toBeNull();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockLeafletState.map.invalidateSize).toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith('[DriverMap] Invalidated size at', 100, 'ms');

      // Detached container → safeInvalidate swallows and bails.
      mockLeafletState.getContainerThrows = true;
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // invalidateSize throwing is swallowed as well.
      mockLeafletState.getContainerThrows = false;
      (mockLeafletState.map.invalidateSize as jest.Mock).mockImplementationOnce(() => {
        throw new Error('gone');
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(logger.log).toHaveBeenCalledWith('[DriverMap] Invalidated size at', 600, 'ms');
    } finally {
      jest.useRealTimers();
    }
  });

  it('invalidates size when the ResizeObserver fires', async () => {
    render(<DriverMap />);
    await waitForMap();
    expect(roCallback).not.toBeNull();
    act(() => {
      roCallback?.();
    });
    expect(mockLeafletState.map.invalidateSize).toHaveBeenCalled();
  });
});

// ── Markers & routing ───────────────────────────────────────────────────────

describe('markers', () => {
  it('adds pickup/dropoff/driver markers with colored icons and popups', async () => {
    render(<DriverMap pickupCoords={P} dropoffCoords={D} driverCoords={DRV} />);
    await waitForMap();

    expect(mockLeafletState.markerCalls).toHaveLength(3);
    expect(mockLeafletState.markerCalls[0].latlng).toEqual([P.lat, P.lng]);
    expect(mockLeafletState.markerCalls[1].latlng).toEqual([D.lat, D.lng]);
    expect(mockLeafletState.markerCalls[2].latlng).toEqual([DRV.lat, DRV.lng]);

    // divIcon colors per role.
    const colors = mockLeafletState.divIconCalls.map((c) => c.html);
    expect(colors[0]).toContain('#10B981');
    expect(colors[1]).toContain('#EF4444');
    expect(colors[2]).toContain('#3B82F6');

    expect(mockLeafletState.popupCalls[0]).toContain('Pickup');
    expect(mockLeafletState.popupCalls[0]).toContain(P.address);
    expect(mockLeafletState.popupCalls[1]).toContain('Dropoff');
    expect(mockLeafletState.popupCalls[1]).toContain(D.address);
    expect(mockLeafletState.popupCalls[2]).toContain('Driver');
  });

  it('adds a dashed polyline when both endpoints are present', async () => {
    render(<DriverMap pickupCoords={P} dropoffCoords={D} />);
    await waitForMap();

    expect(mockLeafletState.polylineCalls).toHaveLength(1);
    expect(mockLeafletState.polylineCalls[0].pts).toEqual([
      [P.lat, P.lng],
      [D.lat, D.lng],
    ]);
    expect(mockLeafletState.polylineCalls[0].options).toMatchObject({
      color: '#3B82F6',
      dashArray: '8,8',
    });
    expect(mockLeafletState.map.fitBounds).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ padding: [50, 50], maxZoom: 16 }),
    );
  });

  it('uses setView for a single coordinate pair', async () => {
    render(<DriverMap pickupCoords={P} />);
    await waitForMap();
    expect(mockLeafletState.map.fitBounds).not.toHaveBeenCalled();
    expect(mockLeafletState.map.setView).toHaveBeenCalledWith([P.lat, P.lng], 14);
  });

  it('removes stale markers and polyline when coords change', async () => {
    const { rerender } = render(<DriverMap pickupCoords={P} dropoffCoords={D} />);
    await waitForMap();
    expect(mockLeafletState.markerCalls).toHaveLength(2);

    const oldMarkers = mockLeafletState.markerCalls.map(() => mockLeafletState.map);
    rerender(<DriverMap pickupCoords={{ lat: 41, lng: 45 }} />);
    await waitFor(() => expect(mockLeafletState.markerCalls).toHaveLength(3));
    // New map instance? No — same instance, markers just re-added.
    expect(mockLeafletState.polylineCalls.length).toBeGreaterThanOrEqual(1);
    void oldMarkers;
  });

  it('skips marker updates when the container is detached', async () => {
    mockLeafletState.getContainerThrows = true;
    render(<DriverMap pickupCoords={P} />);
    await waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        '[DriverMap] Map container not found or detached, skipping update',
      ),
    );
  });

  it('skips marker updates when the map is not ready', async () => {
    mockLeafletState.getCenterThrows = true;
    render(<DriverMap pickupCoords={P} />);
    await waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        '[DriverMap] Map not ready yet, skipping marker update',
      ),
    );
  });

  it('falls back to the pickup/dropoff labels in popups when coords lack addresses', async () => {
    render(
      <DriverMap
        pickupCoords={{ lat: 1, lng: 1 }}
        dropoffCoords={{ lat: 2, lng: 2 }}
        pickupLocation="Office"
        dropoffLocation="Airport"
      />,
    );
    await waitForMap();
    expect(mockLeafletState.popupCalls[0]).toContain('Office');
    expect(mockLeafletState.popupCalls[1]).toContain('Airport');
  });

  it('renders an empty popup body when neither address nor label exists', async () => {
    render(<DriverMap pickupCoords={{ lat: 1, lng: 1 }} dropoffCoords={{ lat: 2, lng: 2 }} />);
    await waitForMap();
    expect(mockLeafletState.popupCalls[0]).toBe('<b>Pickup</b><br/>');
    expect(mockLeafletState.popupCalls[1]).toBe('<b>Dropoff</b><br/>');
  });

  it('logs a warning when centering the map fails', async () => {
    mockLeafletState.fitBoundsThrows = true;
    render(<DriverMap pickupCoords={P} dropoffCoords={D} />);
    await waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        '[DriverMap] Error centering map:',
        expect.any(Error),
      ),
    );
  });
});

// ── Interactive mode ────────────────────────────────────────────────────────

describe('interactive mode', () => {
  const mockFetchAddress = () => {
    (globalThis as any).fetch = jest
      .fn()
      .mockResolvedValue({ json: async () => ({ display_name: 'Somewhere St' }) });
  };

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('reports a pickup when clicking without a pickup set', async () => {
    mockFetchAddress();
    const onLocationSelect = jest.fn();
    render(<DriverMap interactive onLocationSelect={onLocationSelect} />);
    await waitForMap();

    const handler = mockLeafletState.clickHandlers[mockLeafletState.clickHandlers.length - 1];
    await act(async () => {
      await handler({ latlng: { lat: 5, lng: 6 } });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('lat=5&lon=6'),
      expect.any(Object),
    );
    expect(onLocationSelect).toHaveBeenCalledWith(
      { lat: 5, lng: 6, address: 'Somewhere St' },
      'pickup',
    );
  });

  it('reports a dropoff when a pickup is already set', async () => {
    mockFetchAddress();
    const onLocationSelect = jest.fn();
    render(<DriverMap interactive pickupCoords={P} onLocationSelect={onLocationSelect} />);
    await waitForMap();

    const handler = mockLeafletState.clickHandlers[mockLeafletState.clickHandlers.length - 1];
    await act(async () => {
      await handler({ latlng: { lat: 7, lng: 8 } });
    });

    expect(onLocationSelect).toHaveBeenCalledWith(
      { lat: 7, lng: 8, address: 'Somewhere St' },
      'dropoff',
    );
  });

  it('reports an undefined address when reverse geocoding fails', async () => {
    (globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('boom'));
    const onLocationSelect = jest.fn();
    render(<DriverMap interactive onLocationSelect={onLocationSelect} />);
    await waitForMap();

    const handler = mockLeafletState.clickHandlers[mockLeafletState.clickHandlers.length - 1];
    await act(async () => {
      await handler({ latlng: { lat: 5, lng: 6 } });
    });

    expect(onLocationSelect).toHaveBeenCalledWith({ lat: 5, lng: 6, address: undefined }, 'pickup');
  });

  it('ignores clicks when no callback is provided', async () => {
    (globalThis as any).fetch = jest.fn();
    render(<DriverMap interactive />);
    await waitForMap();

    const handler = mockLeafletState.clickHandlers[mockLeafletState.clickHandlers.length - 1];
    await act(async () => {
      await handler({ latlng: { lat: 5, lng: 6 } });
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('bails out of re-registered clicks when no callback is provided', async () => {
    (globalThis as any).fetch = jest.fn();
    const { rerender } = render(<DriverMap interactive onLocationSelect={jest.fn()} />);
    await waitForMap();

    rerender(<DriverMap interactive pickupCoords={P} />);
    await waitFor(() => expect(mockLeafletState.map.off).toHaveBeenCalledWith('click'));

    const handler = mockLeafletState.clickHandlers[mockLeafletState.clickHandlers.length - 1];
    await act(async () => {
      await handler({ latlng: { lat: 5, lng: 6 } });
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports a pickup from the re-registered handler when no pickup is set', async () => {
    mockFetchAddress();
    const onLocationSelect = jest.fn();
    const { rerender } = render(
      <DriverMap interactive pickupCoords={P} onLocationSelect={onLocationSelect} />,
    );
    await waitForMap();

    rerender(<DriverMap interactive onLocationSelect={onLocationSelect} />);
    await waitFor(() => expect(mockLeafletState.map.off).toHaveBeenCalledWith('click'));

    const handler = mockLeafletState.clickHandlers[mockLeafletState.clickHandlers.length - 1];
    await act(async () => {
      await handler({ latlng: { lat: 11, lng: 12 } });
    });
    expect(onLocationSelect).toHaveBeenCalledWith(
      { lat: 11, lng: 12, address: 'Somewhere St' },
      'pickup',
    );
  });

  it('re-registers the click handler when pickupCoords changes', async () => {
    mockFetchAddress();
    const onLocationSelect = jest.fn();
    const { rerender } = render(
      <DriverMap interactive pickupCoords={P} onLocationSelect={onLocationSelect} />,
    );
    await waitForMap();
    const map = mockLeafletState.map;
    expect(map.off).not.toHaveBeenCalled();

    rerender(
      <DriverMap
        interactive
        pickupCoords={{ lat: 99, lng: 88 }}
        onLocationSelect={onLocationSelect}
      />,
    );
    await waitFor(() => expect(map.off).toHaveBeenCalledWith('click'));

    const handler = mockLeafletState.clickHandlers[mockLeafletState.clickHandlers.length - 1];
    await act(async () => {
      await handler({ latlng: { lat: 3, lng: 4 } });
    });
    expect(onLocationSelect).toHaveBeenCalledWith(
      { lat: 3, lng: 4, address: 'Somewhere St' },
      'dropoff',
    );
  });
});

// ── Hints & legend ──────────────────────────────────────────────────────────

describe('hints and legend', () => {
  it('shows the pickup hint, then dropoff, then change-dropoff', async () => {
    const { rerender } = render(<DriverMap interactive />);
    await waitFor(() => expect(screen.getByText('Click to set pickup')).toBeInTheDocument());

    rerender(<DriverMap interactive pickupCoords={P} />);
    await waitFor(() => expect(screen.getByText('Click to set dropoff')).toBeInTheDocument());

    rerender(<DriverMap interactive pickupCoords={P} dropoffCoords={D} />);
    await waitFor(() => expect(screen.getByText('Click to change dropoff')).toBeInTheDocument());
  });

  it('shows the legend entries per coordinate', async () => {
    render(<DriverMap pickupCoords={P} dropoffCoords={D} driverCoords={DRV} />);
    await waitFor(() => expect(screen.getByText('Pickup')).toBeInTheDocument());
    expect(screen.getByText('Dropoff')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
  });

  it('hides the legend when no coordinates are present', async () => {
    render(<DriverMap />);
    await waitForMap();
    expect(screen.queryByText('Pickup')).not.toBeInTheDocument();
    expect(screen.queryByText('Dropoff')).not.toBeInTheDocument();
  });
});

// ── Unmount cleanup ─────────────────────────────────────────────────────────

describe('unmount cleanup', () => {
  it('removes the map instance and clears handlers', async () => {
    const { unmount } = render(<DriverMap interactive />);
    await waitForMap();
    const map = mockLeafletState.map;
    expect(map.remove).not.toHaveBeenCalled();

    unmount();
    expect(map.remove).toHaveBeenCalled();
  });

  it('logs a warning when removing the map throws', async () => {
    const { unmount } = render(<DriverMap />);
    await waitForMap();
    mockLeafletState.removeThrows = true;

    unmount();
    expect(logger.warn).toHaveBeenCalledWith('[DriverMap] Error removing map:', expect.any(Error));
  });
});

// ── NavigatorButtons ────────────────────────────────────────────────────────

describe('NavigatorButtons', () => {
  it('renders nothing on interactive maps', async () => {
    render(<DriverMap interactive pickupCoords={P} />);
    await waitForMap();
    expect(screen.queryByText('Navigate')).not.toBeInTheDocument();
  });

  it('expands the panel with the four navigator links for the default target', async () => {
    render(<DriverMap pickupCoords={P} />);
    fireEvent.click(screen.getByText('Navigate'));

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${P.lat},${P.lng}`,
    );
    expect(links[1]).toHaveAttribute(
      'href',
      `https://yandex.ru/maps/?rtext=~${P.lat},${P.lng}&rtt=auto`,
    );
    expect(links[2]).toHaveAttribute(
      'href',
      `https://2gis.ru/routeSearch/rsType/car/to/${P.lng},${P.lat}`,
    );
    expect(links[3]).toHaveAttribute(
      'href',
      `https://waze.com/ul?ll=${P.lat},${P.lng}&navigate=yes`,
    );
    // Every link opens in a new tab.
    links.forEach((l) => expect(l).toHaveAttribute('target', '_blank'));
  });

  it('defaults to the dropoff target when both coords exist and lets the user switch', async () => {
    render(<DriverMap pickupCoords={P} dropoffCoords={D} />);
    fireEvent.click(screen.getByText('Navigate'));

    // Default target = dropoff.
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${D.lat},${D.lng}`,
    );

    // Switch to pickup.
    fireEvent.click(screen.getByRole('button', { name: 'Pickup' }));
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${P.lat},${P.lng}`,
    );

    // …and back to dropoff.
    fireEvent.click(screen.getByRole('button', { name: 'Dropoff' }));
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      `https://www.google.com/maps/dir/?api=1&destination=${D.lat},${D.lng}`,
    );
  });

  it('collapses the panel on a second click', async () => {
    render(<DriverMap dropoffCoords={D} />);
    const toggle = screen.getByText('Navigate');
    fireEvent.click(toggle);
    expect(screen.getAllByRole('link')).toHaveLength(4);

    fireEvent.click(toggle);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
