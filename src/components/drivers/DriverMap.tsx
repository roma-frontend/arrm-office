'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { logger } from '@/lib/logger';
import type { Map as LeafletMap, Marker, Polyline, LeafletMouseEvent } from 'leaflet';

interface Location {
  lat: number;
  lng: number;
  address?: string;
}

interface DriverMapProps {
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupCoords?: Location;
  dropoffCoords?: Location;
  driverCoords?: Location;
  height?: string;
  zoom?: number;
  interactive?: boolean;
  onLocationSelect?: (location: Location, type: 'pickup' | 'dropoff') => void;
}

const DEFAULT_CENTER: Location = { lat: 40.7128, lng: -74.006 };

const LEAFLET_CSS_ID = 'leaflet-css';

function ensureLeafletCSS() {
  if (document.getElementById(LEAFLET_CSS_ID)) return;
  const link = document.createElement('link');
  link.id = LEAFLET_CSS_ID;
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.crossOrigin = '';
  document.head.appendChild(link);

  // Add custom styles for zoom controls
  const style = document.createElement('style');
  style.textContent = `
    .leaflet-control-zoom {
      border: 2px solid rgba(0,0,0,0.2) !important;
      border-radius: 8px !important;
      overflow: hidden !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
    }
    .leaflet-control-zoom a {
      background: white !important;
      color: #333 !important;
      width: 30px !important;
      height: 30px !important;
      line-height: 30px !important;
      font-size: 18px !important;
      font-weight: bold !important;
    }
    .leaflet-control-zoom a:hover {
      background: #f0f0f0 !important;
    }
    .leaflet-control-zoom-in {
      border-radius: 6px !important;
    }
    .leaflet-control-zoom-out {
      border-radius: 6px !important;
      border-top: 1px solid #ccc !important;
    }
  `;
  document.head.appendChild(style);
}

/** Reverse-geocode a coordinate pair via Nominatim. Pure — only touches fetch. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } },
    );
    const data = (await res.json()) as { display_name?: string };
    return data.display_name || undefined;
  } catch {
    return undefined;
  }
}

export function DriverMap({
  pickupLocation,
  dropoffLocation,
  pickupCoords,
  dropoffCoords,
  driverCoords,
  height = '400px',
  zoom = 13,
  interactive = false,
  onLocationSelect,
}: DriverMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const polylineRef = useRef<Polyline | null>(null);
  const [ready, setReady] = useState(false);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);

  // Get user's current location
  useEffect(() => {
    if (!navigator.geolocation) {
      logger.log('[DriverMap] Geolocation not supported');
      return;
    }

    logger.log('[DriverMap] Requesting user location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        logger.log('[DriverMap] User location:', loc);
        setUserLocation(loc);
      },
      (error) => {
        logger.warn('[DriverMap] Location error:', error.code, error.message);
        // Use default location on error
        setUserLocation(DEFAULT_CENTER);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      },
    );
  }, []);

  // Latest props in refs for stable callbacks
  const pickupCoordsRef = useRef(pickupCoords);
  pickupCoordsRef.current = pickupCoords;
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;

  // Load Leaflet + CSS
  useEffect(() => {
    let cancelled = false;
    ensureLeafletCSS();

    import('leaflet').then((L) => {
      if (cancelled) return;
      LRef.current = L.default || L;
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Init map
  useEffect(() => {
    const el = mapDivRef.current;
    if (!ready || !el) return;

    // Already initialized
    if (mapInstanceRef.current) return;

    // Ensure container has dimensions
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      logger.warn('[DriverMap] Container has no dimensions, waiting...');
      const timeout = setTimeout(() => {
        logger.log('[DriverMap] Retrying initialization...');
        // Force re-render by toggling ready
        setReady(false);
        setTimeout(() => setReady(true), 50);
      }, 100);
      return () => clearTimeout(timeout);
    }

    const L = LRef.current;
    if (!L) return;

    logger.log('[DriverMap] Initializing map...', { width: rect.width, height: rect.height });

    // Fix marker icons
    delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    // Use user location if no coords provided
    const center = userLocation || driverCoords || pickupCoords || dropoffCoords || DEFAULT_CENTER;
    logger.log('[DriverMap] Center:', center);

    const map = L.map(el, {
      center: [center.lat, center.lng],
      zoom: userLocation ? 14 : 13,
      scrollWheelZoom: false,
      dragging: true,
      zoomControl: false,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      fadeAnimation: true,
      zoomAnimation: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    // Add zoom control in bottom-right corner
    L.control
      .zoom({
        position: 'bottomright',
      })
      .addTo(map);

    mapInstanceRef.current = map;

    // Safe invalidateSize helper — guards against detached containers
    const safeInvalidate = () => {
      const m = mapInstanceRef.current;
      if (!m) return;
      try {
        m.getContainer();
      } catch {
        return;
      }
      try {
        m.invalidateSize();
      } catch {
        /* map removed */
      }
    };

    // Force resize after dialog opens
    const timeouts = [100, 300, 600, 1000, 1500, 2000].map((delay) =>
      setTimeout(() => {
        safeInvalidate();
        if (mapInstanceRef.current) {
          logger.log('[DriverMap] Invalidated size at', delay, 'ms');
        }
      }, delay),
    );

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      safeInvalidate();
    });
    ro.observe(el);

    // Click handler for interactive mode
    if (interactive) {
      map.on('click', async (e: LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const cb = onLocationSelectRef.current;
        if (!cb) return;
        const address = await reverseGeocode(lat, lng);
        cb({ lat, lng, address }, !pickupCoordsRef.current ? 'pickup' : 'dropoff');
      });
    }

    logger.log('[DriverMap] Map initialized successfully');

    return () => {
      timeouts.forEach(clearTimeout);
      ro.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          logger.warn('[DriverMap] Error removing map:', e);
        }
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userLocation]);

  // Update markers and center map
  useEffect(() => {
    if (!mapInstanceRef.current || !ready) return;

    const L = LRef.current;
    const map = mapInstanceRef.current;

    if (!L || !map) return;

    // Check if map container still exists and is attached to DOM
    try {
      map.getContainer();
    } catch {
      logger.warn('[DriverMap] Map container not found or detached, skipping update');
      return;
    }

    // Check if the map has been properly initialized with a position
    try {
      map.getCenter();
    } catch {
      logger.warn('[DriverMap] Map not ready yet, skipping marker update');
      return;
    }

    logger.log('[DriverMap] Updating markers:', { pickupCoords, dropoffCoords, driverCoords });

    // Clear existing - guard against removed map
    markersRef.current.forEach((m) => {
      try {
        m.remove();
      } catch {
        /* marker already removed */
      }
    });
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    const icon = (color: string) =>
      L!.divIcon({
        className: '',
        html: `<div style="width:42px;height:42px;border-radius:50%;background:${color};border:4px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:16px;height:16px;border-radius:50%;background:white;opacity:0.3"></div></div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

    const bounds: [number, number][] = [];

    if (pickupCoords) {
      const m = L!
        .marker([pickupCoords.lat, pickupCoords.lng], { icon: icon('#10B981') })
        .addTo(map)
        .bindPopup(
          `<b>${t('driver.pickup', 'Pickup')}</b><br/>${pickupCoords.address || pickupLocation || ''}`,
        );
      markersRef.current.push(m);
      bounds.push([pickupCoords.lat, pickupCoords.lng]);
    }

    if (dropoffCoords) {
      const m = L!
        .marker([dropoffCoords.lat, dropoffCoords.lng], { icon: icon('#EF4444') })
        .addTo(map)
        .bindPopup(
          `<b>${t('driver.dropoff', 'Dropoff')}</b><br/>${dropoffCoords.address || dropoffLocation || ''}`,
        );
      markersRef.current.push(m);
      bounds.push([dropoffCoords.lat, dropoffCoords.lng]);
    }

    if (driverCoords) {
      const m = L!
        .marker([driverCoords.lat, driverCoords.lng], { icon: icon('#3B82F6') })
        .addTo(map)
        .bindPopup(`<b>${t('driver.driver', 'Driver')}</b>`);
      markersRef.current.push(m);
      bounds.push([driverCoords.lat, driverCoords.lng]);
    }

    if (pickupCoords && dropoffCoords) {
      polylineRef.current = L!
        .polyline(
          [
            [pickupCoords.lat, pickupCoords.lng],
            [dropoffCoords.lat, dropoffCoords.lng],
          ],
          { color: '#3B82F6', weight: 3, opacity: 0.7, dashArray: '8,8' },
        )
        .addTo(map);
    }

    // Center map on all markers — guard against detached map
    try {
      if (bounds.length >= 2) {
        logger.log('[DriverMap] Fitting bounds:', bounds);
        map.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: 16,
        });
      } else if (bounds.length === 1) {
        logger.log('[DriverMap] Setting view:', bounds[0]);
        map.setView(bounds[0]!, 14);
      }
    } catch (e) {
      logger.warn('[DriverMap] Error centering map:', e);
    }
  }, [
    pickupCoords,
    dropoffCoords,
    driverCoords,
    ready,
    pickupLocation,
    dropoffLocation,
    t,
    zoom,
    userLocation,
  ]);

  // Center map on user location when it becomes available
  useEffect(() => {
    const m = mapInstanceRef.current;
    if (!m || !ready || !userLocation) return;
    if (pickupCoords || dropoffCoords || driverCoords) return; // Don't center if we already have coords
    try {
      m.getContainer();
    } catch {
      return;
    }

    logger.log('[DriverMap] Centering on user location:', userLocation);
    try {
      m.setView([userLocation.lat, userLocation.lng], 14);
    } catch {
      /* detached */
    }
  }, [userLocation, ready, pickupCoords, dropoffCoords, driverCoords]);

  // Update click handler when pickupCoords changes
  useEffect(() => {
    if (!mapInstanceRef.current || !interactive) return;
    const map = mapInstanceRef.current;
    map.off('click');
    map.on('click', async (e: LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const cb = onLocationSelectRef.current;
      if (!cb) return;
      const address = await reverseGeocode(lat, lng);
      cb({ lat, lng, address }, !pickupCoordsRef.current ? 'pickup' : 'dropoff');
    });
  }, [pickupCoords, interactive]);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden"
      style={{ height, minHeight: '300px', position: 'relative' }}
    >
      {!ready ? (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
          <ShieldLoader size="sm" variant="inline" />
        </div>
      ) : (
        <div
          ref={mapDivRef}
          className="w-full h-full"
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      )}

      {/* Legend */}
      {(pickupCoords || dropoffCoords || driverCoords) && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-lg p-2.5 space-y-1.5 pointer-events-none">
          {pickupCoords && (
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">
                {t('driver.pickup', 'Pickup')}
              </span>
            </div>
          )}
          {dropoffCoords && (
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">
                {t('driver.dropoff', 'Dropoff')}
              </span>
            </div>
          )}
          {driverCoords && (
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">
                {t('driver.driver', 'Driver')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Interactive hint */}
      {interactive && ready && (
        <div className="absolute top-3 right-3 z-[1000] bg-white/90 dark:bg-gray-800/90 rounded-lg shadow-lg px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 pointer-events-none">
          {!pickupCoords
            ? t('driver.clickPickup', 'Click to set pickup')
            : !dropoffCoords
              ? t('driver.clickDropoff', 'Click to set dropoff')
              : t('driver.clickToChange', 'Click to change dropoff')}
        </div>
      )}

      {/* Navigator buttons — shown on non-interactive maps with coords */}
      {!interactive && (pickupCoords || dropoffCoords) && (
        <NavigatorButtons
          pickupCoords={pickupCoords}
          dropoffCoords={dropoffCoords}
          pickupLabel={pickupLocation}
          dropoffLabel={dropoffLocation}
        />
      )}
    </div>
  );
}

// ── Navigator Buttons (open in external map app) ─────────────────────────────

const NAVIGATORS = [
  {
    id: 'google',
    name: 'Google Maps',
    color: '#4285F4',
    icon: '🗺️',
    buildUrl: (lat: number, lng: number) =>
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  },
  {
    id: 'yandex',
    name: 'Yandex Maps',
    color: '#FC3F1D',
    icon: '🧭',
    buildUrl: (lat: number, lng: number) => `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`,
  },
  {
    id: '2gis',
    name: '2GIS',
    color: '#1DAD4E',
    icon: '🏢',
    buildUrl: (lat: number, lng: number) =>
      `https://2gis.ru/routeSearch/rsType/car/to/${lng},${lat}`,
  },
  {
    id: 'waze',
    name: 'Waze',
    color: '#33CCFF',
    icon: '🚗',
    buildUrl: (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  },
];

function NavigatorButtons({
  pickupCoords,
  dropoffCoords,
  pickupLabel: _pickupLabel,
  dropoffLabel: _dropoffLabel,
}: {
  pickupCoords?: Location;
  dropoffCoords?: Location;
  pickupLabel?: string;
  dropoffLabel?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<'dropoff' | 'pickup'>(dropoffCoords ? 'dropoff' : 'pickup');

  const coords = target === 'dropoff' ? dropoffCoords : pickupCoords;
  if (!coords) return null;

  return (
    <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        {t('driver.map.navigate', 'Navigate')}
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-3 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Target toggle */}
          {pickupCoords && dropoffCoords && (
            <div className="flex gap-1 mb-2.5 p-0.5 rounded-md bg-gray-100 dark:bg-gray-700">
              <button
                onClick={() => setTarget('pickup')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  target === 'pickup'
                    ? 'bg-white dark:bg-gray-600 shadow-sm text-emerald-600 dark:text-emerald-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {t('driver.map.pickupTarget', 'Pickup')}
              </button>
              <button
                onClick={() => setTarget('dropoff')}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  target === 'dropoff'
                    ? 'bg-white dark:bg-gray-600 shadow-sm text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {t('driver.map.dropoffTarget', 'Dropoff')}
              </button>
            </div>
          )}

          {/* Navigator list */}
          <div className="space-y-1">
            {NAVIGATORS.map((nav) => (
              <a
                key={nav.id}
                href={nav.buildUrl(coords.lat, coords.lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="text-base leading-none">{nav.icon}</span>
                <span className="font-medium">{nav.name}</span>
                <svg
                  className="w-3.5 h-3.5 ml-auto text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
