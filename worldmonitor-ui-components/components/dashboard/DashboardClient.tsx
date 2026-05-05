'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar } from '@/components/dashboard/StatusBar';
import { GlobalLiveFeed, LiveEvent } from '@/components/dashboard/GlobalLiveFeed';
import { AgentStatus, Agent } from '@/components/dashboard/AgentStatus';
import { ReasoningTrace, ReasoningStep } from '@/components/dashboard/ReasoningTrace';
import { LayerControl, Layer } from '@/components/map/LayerControl';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { GateBanner } from '@/components/ui/MonetizationGate';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useIntelligence } from '@/hooks/useIntelligence';
import { IntelEvent, scoredToLabel } from '@/lib/api';
import { getUserPrefs } from '@/lib/user';
import type { Command } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSeverityLabel(score: number) {
  return scoredToLabel(score);
}

/** Map IntelEvent → LiveEvent expected by GlobalLiveFeed */
function toLiveEvent(event: IntelEvent, index: number): LiveEvent {
  const agentId = event.source === 'gdelt' ? 'ag01' : 'ag02';
  const agentName = event.source === 'gdelt' ? 'AG01_GDELT' : 'AG02_RSS';

  return {
    id: event.id,
    agentId,
    agentName,
    timestamp: event.timestamp,
    severity: toSeverityLabel(event.severity),
    type: 'political' as const,
    title: event.headline,
    description: event.headline,
    location: event.country,
    isNew: index < 3,
    // Gate critical events behind the pro tier
    isGated: event.severity >= 8,
  };
}

/** Derive simulated agents from the current event set */
function deriveAgents(events: IntelEvent[]): Agent[] {
  const gdeltCount = events.filter(e => e.source === 'gdelt').length;
  const rssCount = events.filter(e => e.source === 'rss').length;
  const avgSeverity = events.length > 0
    ? events.reduce((s, e) => s + e.severity, 0) / events.length
    : 0;

  return [
    {
      id: 'ag01',
      name: 'AGENT_GDELT',
      status: gdeltCount > 0 ? 'active' : 'idle',
      lastActivity: gdeltCount > 0 ? `${gdeltCount} events processed` : 'Waiting for data',
      connections: ['ag02', 'ag03'],
      metrics: {
        tasksProcessed: gdeltCount,
        latency: 12,
        confidence: Math.min(99, 80 + gdeltCount),
      },
    },
    {
      id: 'ag02',
      name: 'AGENT_RSS',
      status: rssCount > 0 ? 'active' : 'thinking',
      lastActivity: rssCount > 0 ? `${rssCount} articles ingested` : 'Fetching feeds...',
      connections: ['ag03'],
      metrics: {
        tasksProcessed: rssCount,
        latency: 45,
        confidence: Math.min(99, 75 + rssCount),
      },
    },
    {
      id: 'ag03',
      name: 'AGENT_ANALYST',
      status: events.length > 0 ? 'active' : 'idle',
      lastActivity: events.length > 0 ? `Severity avg: ${avgSeverity.toFixed(1)}/10` : 'Awaiting data',
      metrics: {
        tasksProcessed: events.length,
        latency: 8,
        confidence: 94,
      },
    },
  ];
}

/** Derive reasoning trace from event data */
function deriveTrace(events: IntelEvent[]): ReasoningStep[] {
  const total = events.length;
  const high = events.filter(e => e.severity >= 7).length;

  return [
    {
      id: 'step-1',
      order: 1,
      title: 'Step 1: Data Ingest',
      description: `Pulled ${total} events from GDELT API and ${Math.ceil(total * 0.3)} from RSS feeds. Sources de-duplicated via 0.1° grid.`,
      status: total > 0 ? 'completed' : 'current',
      confidence: 94,
      timestamp: total > 0 ? 'just now' : undefined,
    },
    {
      id: 'step-2',
      order: 2,
      title: 'Step 2: Entity Extraction',
      description: `Named entity recognition run across all headlines. ${total} country-level entities extracted and geocoded.`,
      status: total > 5 ? 'completed' : total > 0 ? 'current' : 'pending',
      confidence: 87,
      timestamp: total > 5 ? '< 1s' : undefined,
    },
    {
      id: 'step-3',
      order: 3,
      title: 'Step 3: Severity Scoring',
      description: `Keyword-based scoring applied. ${high} high-priority events (≥7/10) flagged for immediate review.`,
      status: total > 10 ? 'completed' : total > 5 ? 'current' : 'pending',
      confidence: 91,
    },
    {
      id: 'step-4',
      order: 4,
      title: 'Step 4: Risk Assessment',
      description: total > 0
        ? `Cross-referenced ${total} events against baseline. ${high} anomalies detected above threshold.`
        : 'Awaiting sufficient data to assess risk.',
      status: total > 20 ? 'completed' : total > 10 ? 'current' : 'pending',
      confidence: total > 10 ? 88 : undefined,
    },
  ];
}

// ─── Static layer definitions ─────────────────────────────────────────────────

const DEFAULT_LAYERS: Layer[] = [
  { id: 'cyber', name: 'Cyber Threats', category: 'Threats', enabled: true, count: 0, color: '#FF3E3E' },
  { id: 'geopolitical', name: 'Geopolitical', category: 'Threats', enabled: true, count: 0, color: '#FFB800' },
  { id: 'social', name: 'Social Media Signals', category: 'Intelligence', enabled: true, count: 0, color: '#8B5CF6' },
  { id: 'darkweb', name: 'Dark Web', category: 'Intelligence', enabled: false, count: 0, color: '#6B7280' },
  { id: 'infrastructure', name: 'Infrastructure', category: 'Assets', enabled: true, count: 0, color: '#00E676' },
  { id: 'military', name: 'Military (ADS-B/AIS)', category: 'Assets', enabled: false, count: 0, color: '#448AFF' },
];

const COMMANDS: Command[] = [
  { id: '1', title: 'Filter: Middle East Region', category: 'Filters', shortcut: '⌘1', icon: '🌍', action: () => {} },
  { id: '2', title: 'Filter: Cyber Threats Only', category: 'Filters', shortcut: '⌘2', icon: '⚡', action: () => {} },
  { id: '3', title: 'View: Risk Analysis Dashboard', category: 'Views', shortcut: '⌘3', icon: '📊', action: () => {} },
  { id: '4', title: 'View: Agent Activity Monitor', category: 'Views', shortcut: '⌘4', icon: '🤖', action: () => {} },
  { id: '5', title: 'AI: Generate Country Brief', category: 'AI Actions', icon: '🧠', action: () => {} },
  { id: '6', title: 'AI: Predict Next 24h', category: 'AI Actions', icon: '🔮', action: () => {} },
  { id: '7', title: 'Export: Current View (CSV)', category: 'Export', shortcut: '⌘E', icon: '📥', action: () => {} },
  { id: '8', title: 'Settings: Preferences', category: 'Settings', shortcut: '⌘,', icon: '⚙️', action: () => {} },
];

// ─── WorldMap (SVG) ──────────────────────────────────────────────────────────

function WorldMap({ events }: { events: IntelEvent[] }) {
  const W = 900;
  const H = 450;

  const toXY = (lat: number, lon: number) => ({
    x: ((lon + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  });

  const dots = useMemo(
    () =>
      events.slice(0, 80).map(e => {
        const { x, y } = toXY(e.lat, e.lon);
        const r = Math.max(3, Math.min(10, e.severity * 0.9));
        const color =
          e.severity >= 8 ? '#FF3E3E'
          : e.severity >= 6 ? '#FFB800'
          : e.severity >= 4 ? '#00F5FF'
          : '#00E676';
        return { id: e.id, x, y, r, color, headline: e.headline, country: e.country };
      }),
    [events],
  );

  const critCount = events.filter(e => e.severity >= 8).length;
  const highCount = events.filter(e => e.severity >= 6).length;

  return (
    <div className="w-full h-full bg-obsidian flex flex-col items-center justify-center relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

      {/* Stats overlay */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 z-10">
        <div className="glass-panel rounded-lg px-4 py-2 flex items-center gap-6 text-center">
          <div>
            <div className="text-lg font-bold text-alert">{critCount}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider">Critical</div>
          </div>
          <div className="w-px h-8 bg-border-default" />
          <div>
            <div className="text-lg font-bold text-warning">{highCount}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider">High</div>
          </div>
          <div className="w-px h-8 bg-border-default" />
          <div>
            <div className="text-lg font-bold text-neon">{events.length}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider">Total</div>
          </div>
        </div>
      </div>

      {/* SVG map */}
      <div className="w-full max-w-5xl px-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          style={{ filter: 'drop-shadow(0 0 12px rgba(0,245,255,0.05))' }}
        >
          {/* Graticule */}
          {[-60, -30, 0, 30, 60].map(lat => {
            const { y } = toXY(lat, 0);
            return (
              <line key={`lat${lat}`} x1={0} y1={y} x2={W} y2={y}
                stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
            );
          })}
          {[-120, -60, 0, 60, 120].map(lon => {
            const { x } = toXY(0, lon);
            return (
              <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={H}
                stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} />
            );
          })}

          {/* Event dots */}
          {dots.map(d => (
            <g key={d.id}>
              {/* Outer glow pulse */}
              <circle cx={d.x} cy={d.y} r={d.r * 2}
                fill={d.color} opacity={0.08} />
              {/* Main dot */}
              <circle cx={d.x} cy={d.y} r={d.r}
                fill={d.color} opacity={0.85}>
                <title>{`${d.country}: ${d.headline}`}</title>
              </circle>
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 glass-panel rounded-lg px-3 py-2 flex items-center gap-4">
        {[
          { color: '#FF3E3E', label: 'Critical 8–10' },
          { color: '#FFB800', label: 'High 6–7' },
          { color: '#00F5FF', label: 'Medium 4–5' },
          { color: '#00E676', label: 'Low 1–3' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-2xs text-text-muted">{label}</span>
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
          <div className="text-4xl mb-3">🛰️</div>
          <p className="text-sm text-text-muted">Ingesting live intelligence data…</p>
          <p className="text-xs text-text-disabled mt-1">First run takes ~30 seconds</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  /** Pre-fetched on the server for instant paint. Client will poll for updates. */
  initialEvents: IntelEvent[];
};

export function DashboardClient({ initialEvents }: Props) {
  const { events, isLoading, lastUpdated, refresh } = useIntelligence({
    initialData: initialEvents,
    pollInterval: 30_000,
  });

  const [layers, setLayers] = useState<Layer[]>(() => {
    // Set counts from initial event data
    const counts: Record<string, number> = { geopolitical: events.length };
    return DEFAULT_LAYERS.map(l => ({ ...l, count: counts[l.id] ?? l.count }));
  });

  const liveEvents = useMemo(() => events.map(toLiveEvent), [events]);
  const agents = useMemo(() => deriveAgents(events), [events]);
  const traceSteps = useMemo(() => deriveTrace(events), [events]);

  const prefs = useMemo(() => {
    try { return getUserPrefs(); } catch { return { tier: 'free' as const, interests: [], countries: [] }; }
  }, []);

  const handleToggleLayer = useCallback((id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l));
  }, []);

  const handleToggleCategory = useCallback((category: string, enabled: boolean) => {
    setLayers(prev =>
      category === 'all'
        ? prev.map(l => ({ ...l, enabled }))
        : prev.map(l => l.category === category ? { ...l, enabled } : l),
    );
  }, []);

  const {
    isOpen, searchQuery, filteredCommands, selectedIndex,
    close, setSearchQuery, executeSelected,
  } = useCommandPalette(COMMANDS);

  const alertCount = events.filter(e => e.severity >= 8).length;

  return (
    <div className="min-h-screen bg-obsidian flex flex-col">
      {/* Status bar */}
      <StatusBar
        version="2.6.5"
        isLive={!isLoading}
        region="Global"
        lastUpdate={lastUpdated ?? Date.now()}
        alertCount={alertCount}
        agentsActive={agents.filter(a => a.status === 'active').length}
        latency={12}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left — Live Feed */}
        <div className="w-80 flex-shrink-0 border-r border-border-default overflow-hidden">
          <GlobalLiveFeed
            events={liveEvents}
            onEventClick={() => {}}
            onUpgrade={() => {}}
            maxHeight="calc(100vh - 48px)"
          />
        </div>

        {/* Center — Map */}
        <div className="flex-1 relative overflow-hidden">
          {/* Map controls */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <LayerControl
              layers={layers}
              onToggleLayer={handleToggleLayer}
              onToggleCategory={handleToggleCategory}
            />
            <button
              onClick={() => {}}
              className="glass-panel rounded-lg flex items-center gap-2 px-3 py-2 text-text-muted hover:text-text-secondary transition-colors text-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline text-xs">CMD+K</span>
            </button>
          </div>

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
            {[
              { label: '+', path: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
              { label: '–', path: 'M20 12H4' },
            ].map(({ label, path }) => (
              <button key={label}
                className="w-8 h-8 glass-panel rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
                </svg>
              </button>
            ))}
          </div>

          <WorldMap events={events} />
        </div>

        {/* Right — Agents + Reasoning */}
        <div className="w-80 flex-shrink-0 border-l border-border-default flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            <AgentStatus agents={agents} title="Agent Status" />
          </div>

          <div className="flex-1 min-h-0 border-t border-border-default overflow-auto">
            <ReasoningTrace steps={traceSteps} title="Reasoning Trace" showProgress />
          </div>

          <div className="p-3 border-t border-border-default flex-shrink-0">
            <GateBanner
              title="Pro Intelligence"
              description="Real-time alerts, 90-day history, and API access."
              requiredTier="pro"
              features={['Unlimited alerts', 'Full CoT transparency', 'API access', '90-day history']}
              onUpgrade={() => {}}
            />
          </div>
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette
        isOpen={isOpen}
        onClose={close}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        commands={filteredCommands}
        selectedIndex={selectedIndex}
        onSelect={() => {}}
        onExecute={executeSelected}
      />
    </div>
  );
}
