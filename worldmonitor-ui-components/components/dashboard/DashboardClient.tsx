'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { StatusBar } from '@/components/dashboard/StatusBar';
import { GlobalLiveFeed, LiveEvent } from '@/components/dashboard/GlobalLiveFeed';
import { AgentStatus, Agent } from '@/components/dashboard/AgentStatus';
import { ReasoningTrace, ReasoningStep } from '@/components/dashboard/ReasoningTrace';
import { LayerControl, Layer } from '@/components/map/LayerControl';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { GateBanner } from '@/components/ui/MonetizationGate';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useIntelligence } from '@/hooks/useIntelligence';
import { api, Brief, IntelEvent, scoredToLabel } from '@/lib/api';
import { getUserPrefs } from '@/lib/user';
import { Tooltip } from '@/components/ui/Tooltip';
import { WelcomeTour } from '@/components/ui/WelcomeTour';
import type { Command } from '@/types';

// Leaflet uses window at import time — must be loaded client-side only
const WorldMap = dynamic(
  () => import('@/components/map/WorldMap').then(m => m.WorldMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-obsidian gap-3">
        <div className="w-6 h-6 border-2 border-neon border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-text-muted">Loading map…</span>
      </div>
    ),
  },
);

// Globe: Three.js scene — heavy, so also lazy-loaded on demand
const Globe = dynamic(
  () => import('@/components/map/Globe').then(m => m.Globe),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-obsidian gap-3">
        <div className="w-6 h-6 border-2 border-neon border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-text-muted">Loading globe…</span>
      </div>
    ),
  },
);

type ViewMode = 'map' | 'globe';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSeverityLabel(score: number) {
  return scoredToLabel(score);
}

/** Map IntelEvent → LiveEvent expected by GlobalLiveFeed */
function toLiveEvent(event: IntelEvent, index: number): LiveEvent {
  const agentId = event.source === 'gdelt' ? 'ag01' : event.source === 'eonet' ? 'ag04' : 'ag02';
  const agentName = event.source === 'gdelt' ? 'AG01_GDELT' : event.source === 'eonet' ? 'AG04_EONET' : 'AG02_RSS';

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
    domain: event.domain,
    link: event.link,
    isNew: index < 3,
    isGated: event.severity >= 8,
  };
}

// ─── Domain filter metadata ───────────────────────────────────────────────────

const DOMAINS = [
  { id: null,              label: 'All',      emoji: '🌐', color: '#00F5FF', tip: 'Show all domains' },
  { id: 'geopolitical',    label: 'Geo',      emoji: '🌍', color: '#FFB800', tip: 'Conflicts, diplomacy, regime changes' },
  { id: 'cyber',           label: 'Cyber',    emoji: '⚡', color: '#FF3E3E', tip: 'APT attacks, ransomware, infrastructure breaches' },
  { id: 'energy',          label: 'Energy',   emoji: '🛢️', color: '#FF6B35', tip: 'Oil, gas, grid disruptions, OPEC moves' },
  { id: 'climate',         label: 'Climate',  emoji: '🌡️', color: '#00BCD4', tip: 'Extreme weather, drought, sea level events' },
  { id: 'wildfire',        label: 'Wildfire', emoji: '🔥', color: '#FF5722', tip: 'Active fire perimeters from NASA EONET' },
  { id: 'water',           label: 'Water',    emoji: '💧', color: '#2196F3', tip: 'Transboundary water disputes, droughts' },
  { id: 'natural',         label: 'Natural',  emoji: '🌋', color: '#9C27B0', tip: 'Earthquakes, volcanic eruptions, tsunamis' },
  { id: 'nuclear',         label: 'Nuclear',  emoji: '☢️', color: '#F44336', tip: 'Plant safety, proliferation, enrichment' },
  { id: 'mining',          label: 'Mining',   emoji: '⛏️', color: '#A1887F', tip: 'Mining incidents, supply disruptions' },
  { id: 'deforestation',   label: 'Forest',   emoji: '🌳', color: '#43A047', tip: 'Illegal logging, forest cover loss' },
  { id: 'ocean',           label: 'Ocean',    emoji: '🌊', color: '#0288D1', tip: 'Maritime security, piracy, sea-lane disputes' },
  { id: 'demographics',    label: 'Demo',     emoji: '👥', color: '#607D8B', tip: 'Migration, displacement, demographic shifts' },
  { id: 'uninsurability',  label: 'Uninsur.', emoji: '🏚️', color: '#FF8F00', tip: 'Climate-driven insurance market collapse' },
  { id: 'critical_minerals', label: 'Minerals', emoji: '⚗️', color: '#7C4DFF', tip: 'Cobalt, lithium, rare earth supply chains' },
] as const;

/** Normalise a search string for NL matching */
function normalise(s: string) { return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' '); }

/** Derive agents from event data + real brief state */
function deriveAgents(
  events: IntelEvent[],
  brief: Brief | null,
  briefLoading: boolean,
): Agent[] {
  const gdeltCount  = events.filter(e => e.source === 'gdelt').length;
  const rssCount    = events.filter(e => e.source === 'rss').length;
  const eonetCount  = events.filter(e => e.source === 'eonet').length;
  const avgSeverity = events.length > 0
    ? events.reduce((s, e) => s + e.severity, 0) / events.length
    : 0;

  const ag03Activity = brief
    ? brief.summary.length > 110
      ? brief.summary.slice(0, 107) + '…'
      : brief.summary
    : briefLoading
    ? 'Synthesising brief via Groq LLaMA-3…'
    : events.length > 0
    ? `Severity avg: ${avgSeverity.toFixed(1)}/10`
    : 'Awaiting data';

  return [
    {
      id: 'ag01',
      name: 'AGENT_GDELT',
      status: gdeltCount > 0 ? 'active' : 'idle',
      lastActivity: gdeltCount > 0 ? `${gdeltCount} events processed` : 'Waiting for data',
      connections: ['ag02', 'ag03'],
      metrics: { tasksProcessed: gdeltCount, latency: 12, confidence: Math.min(99, 80 + gdeltCount) },
    },
    {
      id: 'ag02',
      name: 'AGENT_RSS',
      status: rssCount > 0 ? 'active' : 'thinking',
      lastActivity: rssCount > 0 ? `${rssCount} articles ingested` : 'Fetching feeds...',
      connections: ['ag03'],
      metrics: { tasksProcessed: rssCount, latency: 45, confidence: Math.min(99, 75 + rssCount) },
    },
    {
      id: 'ag03',
      name: 'AGENT_BRIEF',
      status: brief ? 'active' : briefLoading ? 'thinking' : events.length > 0 ? 'active' : 'idle',
      lastActivity: ag03Activity,
      metrics: { tasksProcessed: brief ? brief.event_count : events.length, latency: brief ? 320 : 8, confidence: brief ? 92 : 94 },
    },
    {
      id: 'ag04',
      name: 'AGENT_EONET',
      status: eonetCount > 0 ? 'active' : 'idle',
      lastActivity: eonetCount > 0 ? `${eonetCount} EO events` : 'Awaiting NASA EONET',
      metrics: { tasksProcessed: eonetCount, latency: 22, confidence: 97 },
    },
  ];
}

/** Derive reasoning trace from event data + real brief */
function deriveTrace(
  events: IntelEvent[],
  brief: Brief | null,
  briefLoading: boolean,
): ReasoningStep[] {
  const total = events.length;
  const high  = events.filter(e => e.severity >= 7).length;

  const briefDesc = brief
    ? (() => {
        const firstSentence = brief.summary.split(/[.!?]/)[0].trim();
        return `AG03 brief (${brief.country}, ${brief.event_count} events): "${firstSentence}."`;
      })()
    : briefLoading
    ? 'AG03 querying Groq LLaMA-3 to synthesise country brief…'
    : 'Pending sufficient event data for brief generation.';

  return [
    { id: 'step-1', order: 1, title: 'Step 1: Data Ingest',      description: `Pulled ${total} events from GDELT, NASA EONET, and ${Math.ceil(total * 0.3)} from RSS feeds. Sources de-duplicated via 0.1° grid.`,          status: total > 0 ? 'completed' : 'current',  confidence: 94, timestamp: total > 0 ? 'just now' : undefined },
    { id: 'step-2', order: 2, title: 'Step 2: Entity Extraction', description: `Named entity recognition run across all headlines. ${total} country-level entities extracted and geocoded.`,                                  status: total > 5 ? 'completed' : total > 0 ? 'current' : 'pending', confidence: 87, timestamp: total > 5 ? '< 1s' : undefined },
    { id: 'step-3', order: 3, title: 'Step 3: Severity Scoring',  description: `Keyword-based scoring applied. ${high} high-priority events (≥7/10) flagged for immediate review.`,                                           status: total > 10 ? 'completed' : total > 5 ? 'current' : 'pending', confidence: 91 },
    { id: 'step-4', order: 4, title: 'Step 4: Risk Assessment',   description: total > 0 ? `Cross-referenced ${total} events against baseline. ${high} anomalies detected above threshold.` : 'Awaiting sufficient data.',    status: total > 20 ? 'completed' : total > 10 ? 'current' : 'pending', confidence: total > 10 ? 88 : undefined },
    { id: 'step-5', order: 5, title: 'Step 5: AI Brief',          description: briefDesc,                                                                                                                                     status: brief ? 'completed' : briefLoading ? 'current' : 'pending', confidence: brief ? 92 : undefined, timestamp: brief ? 'Groq LLaMA-3' : undefined },
  ];
}

// ─── Static layer definitions ─────────────────────────────────────────────────

const DEFAULT_LAYERS: Layer[] = [
  { id: 'cyber',          name: 'Cyber Threats',       category: 'Threats',      enabled: true,  count: 0, color: '#FF3E3E' },
  { id: 'geopolitical',   name: 'Geopolitical',        category: 'Threats',      enabled: true,  count: 0, color: '#FFB800' },
  { id: 'social',         name: 'Social Media Signals', category: 'Intelligence', enabled: true,  count: 0, color: '#8B5CF6' },
  { id: 'darkweb',        name: 'Dark Web',            category: 'Intelligence', enabled: false, count: 0, color: '#6B7280' },
  { id: 'infrastructure', name: 'Infrastructure',      category: 'Assets',       enabled: true,  count: 0, color: '#00E676' },
  { id: 'military',       name: 'Military (ADS-B/AIS)', category: 'Assets',      enabled: false, count: 0, color: '#448AFF' },
];

const COMMANDS: Command[] = [
  { id: '1', title: 'Filter: Middle East Region',    category: 'Filters',    shortcut: '⌘1', icon: '🌍', action: () => {} },
  { id: '2', title: 'Filter: Cyber Threats Only',    category: 'Filters',    shortcut: '⌘2', icon: '⚡', action: () => {} },
  { id: '3', title: 'View: Risk Analysis Dashboard', category: 'Views',      shortcut: '⌘3', icon: '📊', action: () => {} },
  { id: '4', title: 'View: Agent Activity Monitor',  category: 'Views',      shortcut: '⌘4', icon: '🤖', action: () => {} },
  { id: '5', title: 'AI: Generate Country Brief',    category: 'AI Actions', icon: '🧠', action: () => {} },
  { id: '6', title: 'AI: Predict Next 24h',          category: 'AI Actions', icon: '🔮', action: () => {} },
  { id: '7', title: 'Export: Current View (CSV)',    category: 'Export',     shortcut: '⌘E', icon: '📥', action: () => {} },
  { id: '8', title: 'Settings: Preferences',         category: 'Settings',   shortcut: '⌘,', icon: '⚙️', action: () => {} },
];

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  initialEvents: IntelEvent[];
};

export function DashboardClient({ initialEvents }: Props) {
  const { events, isLoading, lastUpdated, refresh, streaming } = useIntelligence({
    initialData: initialEvents,
    pollInterval: 30_000,
  });

  const prefs = useMemo(() => {
    try { return getUserPrefs(); } catch { return { tier: 'free' as const, interests: [], countries: [] }; }
  }, []);

  // ── CoT: real Groq brief via AG03 ─────────────────────────────────────────
  const [brief, setBrief]             = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const lastBriefCountry              = useRef<string | null>(null);

  const topCountry = useMemo(
    () => events.length > 0 ? [...events].sort((a, b) => b.severity - a.severity)[0].country : null,
    [events],
  );

  useEffect(() => {
    if (!topCountry) return;
    if (topCountry === lastBriefCountry.current) return;
    lastBriefCountry.current = topCountry;
    setBriefLoading(true);
    api.brief
      .generate(topCountry, prefs.interests)
      .then(b => { setBrief(b); setBriefLoading(false); })
      .catch(() => setBriefLoading(false));
  }, [topCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  // ── Collapsible panels — both hidden on mobile, open on desktop ────────────
  const [leftOpen,  setLeftOpen]  = useState(false); // SSR-safe default: closed
  const [rightOpen, setRightOpen] = useState(false);

  useEffect(() => {
    // Open both panels only when enough horizontal space is available.
    // Runs after first paint — SSR-safe (default: both closed).
    const open = window.innerWidth >= 1024;
    setLeftOpen(open);
    setRightOpen(open);
  }, []);

  // ── Domain filter ──────────────────────────────────────────────────────────
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  // ── NL search ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Card → map fly-to ─────────────────────────────────────────────────────
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [layers, setLayers] = useState<Layer[]>(() =>
    DEFAULT_LAYERS.map(l => ({ ...l, count: l.id === 'geopolitical' ? events.length : l.count }))
  );

  // ── Combined filter: domain + NL search ───────────────────────────────────
  const filteredEvents = useMemo(() => {
    let result = selectedDomain ? events.filter(e => e.domain === selectedDomain) : events;
    if (searchQuery.trim()) {
      const q = normalise(searchQuery.trim());
      const terms = q.split(/\s+/).filter(Boolean);
      result = result.filter(e => {
        const haystack = normalise(`${e.headline} ${e.country} ${e.domain ?? ''}`);
        return terms.every(t => haystack.includes(t));
      });
    }
    return result;
  }, [events, selectedDomain, searchQuery]);

  const liveEvents  = useMemo(() => filteredEvents.map(toLiveEvent), [filteredEvents]);
  const agents      = useMemo(() => deriveAgents(events, brief, briefLoading), [events, brief, briefLoading]);
  const traceSteps  = useMemo(() => deriveTrace(events, brief, briefLoading), [events, brief, briefLoading]);

  const handleToggleLayer    = useCallback((id: string) =>
    setLayers(prev => prev.map(l => l.id === id ? { ...l, enabled: !l.enabled } : l)), []);
  const handleToggleCategory = useCallback((category: string, enabled: boolean) =>
    setLayers(prev =>
      category === 'all'
        ? prev.map(l => ({ ...l, enabled }))
        : prev.map(l => l.category === category ? { ...l, enabled } : l)
    ), []);

  /** When the user clicks a feed card, select it and fly the map to it */
  const handleEventClick = useCallback((event: LiveEvent) => {
    setSelectedEventId(event.id);
  }, []);

  const {
    isOpen, searchQuery: cmdQuery, filteredCommands, selectedIndex,
    close, setSearchQuery: setCmdQuery, executeSelected,
  } = useCommandPalette(COMMANDS);

  const alertCount = filteredEvents.filter(e => e.severity >= 8).length;

  return (
    <div className="min-h-screen bg-obsidian flex flex-col overflow-hidden">
      {/* First-run welcome tour — renders only once, localStorage-gated */}
      <WelcomeTour />

      {/* Status bar */}
      <StatusBar
        version="2.7.0"
        isLive={!isLoading}
        isStreaming={streaming}
        region="Global"
        lastUpdate={lastUpdated ?? Date.now()}
        alertCount={alertCount}
        agentsActive={agents.filter(a => a.status === 'active').length}
        latency={12}
      />

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* ── Mobile backdrops — tap to close panel ──────────────────────── */}
        {leftOpen && (
          <div
            className="lg:hidden fixed inset-0 z-[2999] bg-black/50 backdrop-blur-sm"
            onClick={() => setLeftOpen(false)}
          />
        )}
        {rightOpen && (
          <div
            className="lg:hidden fixed inset-0 z-[2999] bg-black/50 backdrop-blur-sm"
            onClick={() => setRightOpen(false)}
          />
        )}

        {/* ── Left panel — Feed ────────────────────────────────────────────── */}
        {/* Desktop: inline column; mobile: fixed left drawer */}
        <div className={[
          'flex-shrink-0 border-r border-border-default flex flex-col min-h-0',
          'bg-void transition-all duration-300 ease-in-out overflow-hidden',
          // Desktop: collapse inline (width → 0)
          'lg:relative lg:z-auto',
          leftOpen ? 'lg:w-80' : 'lg:w-0 lg:border-r-0',
          // Mobile: slide-in drawer (fixed left)
          leftOpen
            ? 'fixed inset-y-0 left-0 z-[3000] w-80 shadow-2xl'
            : 'fixed inset-y-0 -left-80 z-[3000] w-80',
        ].join(' ')}>

          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle flex-shrink-0">
            <span className="text-2xs font-mono font-bold text-text-muted uppercase tracking-widest">Live Feed</span>
            <button
              onClick={() => setLeftOpen(false)}
              title="Close panel"
              className="text-text-disabled hover:text-text-muted transition-colors p-1 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* NL Search bar */}
          <div className="px-3 py-2 border-b border-border-subtle flex-shrink-0">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search events, countries, domains…"
                title="Filter by keyword, country name, or domain (e.g. 'cyber', 'Ukraine', 'energy')"
                className="w-full bg-surface border border-border-subtle rounded-md pl-8 pr-8 py-1.5 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-neon/50 transition-colors font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-2xs text-text-muted mt-1 font-mono pl-0.5">
                {filteredEvents.length} result{filteredEvents.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Live Feed */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <GlobalLiveFeed
              events={liveEvents}
              onEventClick={handleEventClick}
              onUpgrade={() => {}}
              maxHeight="100%"
            />
          </div>
        </div>

        {/* Center — Map */}
        {/* overflow-visible so Leaflet popups/tooltips can extend beyond bounds */}
        <div className="flex-1 relative">
          {/* Layer control + view toggle — sits above map via z-[1001] */}
          <div className="absolute top-3 left-3 z-[1001] flex items-center gap-2">
        {/* ── Center — Map (always fills remaining space) ──────────────────── */}
        <div className="flex-1 min-h-0 relative">

          {/* Panel toggle tabs — float at map edges */}
          <Tooltip text={leftOpen ? 'Close feed' : 'Open live feed'} side="right">
            <button
              onClick={() => setLeftOpen(o => !o)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-[1002] w-6 h-14 flex items-center justify-center rounded-md bg-[rgba(5,7,10,0.85)] border border-[rgba(0,245,255,0.15)] text-text-muted hover:text-neon hover:border-neon/40 transition-all duration-150 backdrop-blur-sm"
              aria-label={leftOpen ? 'Close feed panel' : 'Open feed panel'}
            >
              <span className="text-xs font-mono select-none">{leftOpen ? '‹' : '›'}</span>
            </button>
          </Tooltip>

          <Tooltip text={rightOpen ? 'Close agents' : 'Open agent panel'} side="left">
            <button
              onClick={() => setRightOpen(o => !o)}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-[1002] w-6 h-14 flex items-center justify-center rounded-md bg-[rgba(5,7,10,0.85)] border border-[rgba(0,245,255,0.15)] text-text-muted hover:text-neon hover:border-neon/40 transition-all duration-150 backdrop-blur-sm"
              aria-label={rightOpen ? 'Close agent panel' : 'Open agent panel'}
            >
              <span className="text-xs font-mono select-none">{rightOpen ? '›' : '‹'}</span>
            </button>
          </Tooltip>

          {/* Layer control */}
          <div className="absolute top-3 left-10 z-[1001] flex items-center gap-2">
            <LayerControl
              layers={layers}
              onToggleLayer={handleToggleLayer}
              onToggleCategory={handleToggleCategory}
            />
            {/* Map / Globe view switch */}
            <div
              role="tablist"
              className="glass-panel rounded-lg p-0.5 flex items-center gap-0.5"
            >
              {(['map', 'globe'] as const).map(m => {
                const active = viewMode === m;
                return (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setViewMode(m)}
                    className="px-2.5 py-1 rounded text-2xs font-mono uppercase tracking-wider transition-colors"
                    style={{
                      background: active ? 'rgba(0,245,255,0.18)' : 'transparent',
                      color: active ? '#00F5FF' : 'rgba(255,255,255,0.55)',
                      border: `1px solid ${active ? 'rgba(0,245,255,0.4)' : 'transparent'}`,
                    }}
                    title={m === 'map' ? 'Flat 2D map' : 'Immersive 3D globe — scenario planning'}
                  >
                    {m === 'map' ? '2D Map' : '3D Globe'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Domain filter pills — single scrollable row */}
          <div className="absolute bottom-14 left-0 right-0 z-[1001] flex items-center gap-1 overflow-x-auto no-scrollbar px-3 pointer-events-auto">
            {DOMAINS.map(d => {
              const active = selectedDomain === d.id;
              return (
                <Tooltip key={String(d.id)} text={d.tip} side="top">
                  <button
                    onClick={() => setSelectedDomain(active ? null : (d.id as string | null))}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-2xs font-mono transition-all duration-150"
                    style={{
                      background: active ? d.color + '33' : 'rgba(10,14,20,0.75)',
                      border: `1px solid ${active ? d.color : 'rgba(255,255,255,0.12)'}`,
                      color: active ? d.color : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <span>{d.emoji}</span>
                    <span>{d.label}</span>
                    {selectedDomain === d.id && d.id !== null && (
                      <span className="opacity-60">({filteredEvents.length})</span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>

          {viewMode === 'map'
            ? <WorldMap events={filteredEvents} />
            : <Globe events={filteredEvents} />
          }
          {/* Map */}
          <WorldMap events={filteredEvents} selectedEventId={selectedEventId} />
        </div>

        {/* ── Right panel — Agents + Reasoning ────────────────────────────── */}
        <div className={[
          'flex-shrink-0 border-l border-border-default flex flex-col min-h-0 overflow-hidden',
          'bg-void transition-all duration-300 ease-in-out',
          'lg:relative lg:z-auto',
          rightOpen ? 'lg:w-80' : 'lg:w-0 lg:border-l-0',
          rightOpen
            ? 'fixed inset-y-0 right-0 z-[3000] w-80 shadow-2xl'
            : 'fixed inset-y-0 -right-80 z-[3000] w-80',
        ].join(' ')}>

          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle flex-shrink-0">
            <button
              onClick={() => setRightOpen(false)}
              title="Close panel"
              className="text-text-disabled hover:text-text-muted transition-colors p-1 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="text-2xs font-mono font-bold text-text-muted uppercase tracking-widest">Intel</span>
          </div>

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
        searchQuery={cmdQuery}
        onSearchChange={setCmdQuery}
        commands={filteredCommands}
        selectedIndex={selectedIndex}
        onSelect={() => {}}
        onExecute={executeSelected}
      />
    </div>
  );
}
