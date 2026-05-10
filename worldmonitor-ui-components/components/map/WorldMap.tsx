'use client';

/**
 * WorldMap — OpenStreetMap-backed intelligence overlay.
 *
 * Tiles:   CartoDB Dark Matter (free, no API key, OSM data)
 * Library: react-leaflet v5 + leaflet 1.9
 *
 * CSS is imported in app/layout.tsx (not here) because Next.js App Router
 * cannot reliably bundle relative CSS imports from dynamic() chunks.
 *
 * NOTE: Always loaded via next/dynamic with ssr:false — Leaflet accesses
 * `window` at import time and will crash during server rendering.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import type { IntelEvent } from '@/lib/api';

// ─── Severity helpers ─────────────────────────────────────────────────────────

const SEVERITY = [
  { min: 8, label: 'Critical', color: '#FF3E3E' },
  { min: 6, label: 'High',     color: '#FFB800' },
  { min: 4, label: 'Medium',   color: '#00F5FF' },
  { min: 0, label: 'Low',      color: '#00E676' },
] as const;

function severityMeta(score: number) {
  return SEVERITY.find(s => score >= s.min) ?? SEVERITY[3];
}

// Safe replacements for Math.min/max spread — avoids call-stack overflow on
// large event arrays (100+ items blows the argument limit in some engines).
function arrayMin(arr: number[]) { return arr.reduce((a, b) => Math.min(a, b), Infinity); }
function arrayMax(arr: number[]) { return arr.reduce((a, b) => Math.max(a, b), -Infinity); }

// ─── MapUpdater — fits bounds after first event load ─────────────────────────
// Must be a child of <MapContainer> to access the useMap() context.
// Side effects (fitBounds) happen inside useEffect, never during render.

function MapUpdater({ events }: { events: IntelEvent[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || events.length === 0) return;
    fitted.current = true;

    const lats = events.map(e => e.lat);
    const lons = events.map(e => e.lon);

    const south = arrayMin(lats) - 5;
    const west  = arrayMin(lons) - 5;
    const north = arrayMax(lats) + 5;
    const east  = arrayMax(lons) + 5;

    // Clamp to valid lat/lon ranges
    const bounds: [[number, number], [number, number]] = [
      [Math.max(south, -85), Math.max(west, -180)],
      [Math.min(north,  85), Math.min(east,  180)],
    ];

    map.fitBounds(bounds, { maxZoom: 5, animate: true, duration: 0.8 });
  }, [events, map]);

  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  events: IntelEvent[];
};

export function WorldMap({ events }: Props) {
  const critCount = useMemo(() => events.filter(e => e.severity >= 8).length, [events]);
  const highCount = useMemo(() => events.filter(e => e.severity >= 6 && e.severity < 8).length, [events]);

  const markers = useMemo(
    () =>
      events.slice(0, 250).map(e => {
        const meta = severityMeta(e.severity);
        return {
          id: e.id,
          lat: e.lat,
          lon: e.lon,
          color: meta.color,
          label: meta.label,
          radius: 4 + e.severity * 0.9,   // 4.9 (low) → 13 (critical)
          severity: e.severity,
          country: e.country,
          headline: e.headline,
          source: e.source,
        };
      }),
    [events],
  );

  return (
    <div className="w-full h-full relative">

      {/* ── Stats bar (floats above map) ─────────────────────────────────── */}
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none"
        style={{ whiteSpace: 'nowrap' }}
      >
        <div className="glass-panel rounded-lg px-4 py-2 flex items-center gap-5 text-center">
          <div>
            <div className="text-base font-bold text-alert leading-none">{critCount}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-0.5">Critical</div>
          </div>
          <div className="w-px h-7 bg-border-default" />
          <div>
            <div className="text-base font-bold text-warning leading-none">{highCount}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-0.5">High</div>
          </div>
          <div className="w-px h-7 bg-border-default" />
          <div>
            <div className="text-base font-bold text-neon leading-none">{events.length}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-0.5">Total</div>
          </div>
        </div>
      </div>

      {/* ── Leaflet map ──────────────────────────────────────────────────── */}
      <MapContainer
        center={[20, 15]}
        zoom={2}
        minZoom={2}
        maxZoom={12}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        {/* CartoDB Dark Matter — free OSM-backed dark basemap */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />

        {/* Zoom controls bottom-right, away from the stats bar */}
        <ZoomControl position="bottomright" />

        {/* Fit map bounds to the event set on first load */}
        <MapUpdater events={events} />

        {/* Event markers */}
        {markers.map(m => (
          <CircleMarker
            key={m.id}
            center={[m.lat, m.lon]}
            radius={m.radius}
            pathOptions={{
              color: m.color,
              fillColor: m.color,
              fillOpacity: 0.75,
              weight: 1.5,
              opacity: 1,
            }}
          >
            <Popup maxWidth={280}>
              <div className="wm-popup-inner">
                <div className="wm-popup-header" style={{ color: m.color }}>
                  <span className="wm-popup-sev">{m.label} {m.severity}/10</span>
                  <span className="wm-popup-country">{m.country}</span>
                </div>
                <p className="wm-popup-headline">{m.headline}</p>
                <div className="wm-popup-meta">
                  <span className="wm-popup-source">{m.source.toUpperCase()}</span>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Legend (floats above map) ─────────────────────────────────────── */}
      <div className="absolute bottom-8 right-12 z-[1000] glass-panel rounded-lg px-3 py-2 flex items-center gap-3 pointer-events-none">
        {SEVERITY.map(({ color, label, min }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-2xs text-text-muted">
              {label} {min > 0 ? `${min}+` : '1–3'}
            </span>
          </div>
        ))}
      </div>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {events.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[500] pointer-events-none">
          <div className="text-4xl mb-3">🛰️</div>
          <p className="text-sm text-text-muted">Ingesting live intelligence data…</p>
          <p className="text-xs text-text-disabled mt-1">First run takes ~30 seconds</p>
        </div>
      )}
    </div>
  );
}
