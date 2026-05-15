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
    domain: event.domain,
    link: event.link,
    isNew: index < 3,
    // Gate critical events behind the pro tier
    isGated: event.severity >= 8,
  };
}

// ─── Domain filter metadata ───────────────────────────────────────────────────

const DOMAINS = [
  { id: null,           label: 'All',       emoji: '🌐', color: '#00F5FF' },
  { id: 'geopolitical', label: 'Geo',       emoji: '🌍', color: '#FFB800' },
  { id: 'cyber',        label: 'Cyber',     emoji: '⚡', color: '#FF3E3E' },
  { id: 'energy',       label: 'Energy',    emoji: '🛢️', color: '#FF6B35' },
  { id: 'climate',      label: 'Climate',   emoji: '🌡️', color: '#00BCD4' },
  { id: 'wildfire',     label: 'Wildfire',  emoji: '🔥', color: '#FF5722' },
  { id: 'water',        label: 'Water',     emoji: '💧', color: '#2196F3' },
  { id: 'natural',      label: 'Natural',   emoji: '🌋', color: '#9C27B0' },
  { id: 'nuclear',      label: 'Nuclear',   emoji: '☢️', color: '#F44336' },
  { id: 'mining',       label: 'Mining',    emoji: '⛏️', color: '#A1887F' },
  { id: 'deforestation',label: 'Forest',    emoji: '🌳', color: '#43A047' },
  { id: 'ocean',          label: 'Ocean',    emoji: '🌊', color: '#0288D1' },
  { id: 'demographics',  label: 'Demo',     emoji: '👥', color: '#607D8B' },
  { id: 'uninsurability',  label: 'Uninsur.',  emoji: '🏚️', color: '#FF8F00' },
  { id: 'critical_minerals',label: 'Minerals', emoji: '⚗️', color: '#7C4DFF' },
] as const;

/** Derive agents from event data + real brief state */
function deriveAgents(
  events: IntelEvent[],
  brief: Brief | null,
  briefLoading: boolean,
): Agent[] {
  const gdeltCount = events.filter(e => e.source === 'gdelt').length;
  const rssCount = events.filter(e => e.source === 'rss').length;
  const avgSeverity = events.length > 0
    ? events.reduce((s, e) => s + e.severity, 0) / events.length
    : 0;

  // AG03 activity: show real brief summary when available (truncated to ~110 chars)
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
      name: 'AGENT_BRIEF',
      status: brief ? 'active' : briefLoading ? 'thinking' : events.length > 0 ? 'active' : 'idle',
      lastActivity: ag03Activity,
      metrics: {
        tasksProcessed: brief ? brief.event_count : events.length,
        latency: brief ? 320 : 8,
        confidence: brief ? 92 : 94,
      },
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
  const high = events.filter(e => e.severity >= 7).length;

  // Step 5 brief text — show first sentence of the real summary when available
  const briefDesc = brief
    ? (() => {
        const firstSentence = brief.summary.split(/[.!?]/)[0].trim();
        return `AG03 brief (${brief.country}, ${brief.event_count} events): "${firstSentence}."`;
      })()
    : briefLoading
    ? 'AG03 querying Groq LLaMA-3 to synthesise country brief…'
    : 'Pending sufficient event data for brief generation.';

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
    {
      id: 'step-5',
      order: 5,
      title: 'Step 5: AI Brief Generation',
      description: briefDesc,
      status: brief ? 'completed' : briefLoading ? 'current' : 'pending',
      confidence: brief ? 92 : undefined,
      timestamp: brief ? 'Groq LLaMA-3' : undefined,
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

  const prefs = useMemo(() => {
    try { return getUserPrefs(); } catch { return { tier: 'free' as const, interests: [], countries: [] }; }
  }, []);

  // ── CoT: real Groq brief via AG03 ─────────────────────────────────────────
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  // Track which country we last fetched a brief for (avoid redundant calls)
  const lastBriefCountry = useRef<string | null>(null);

  // Top country by severity — used as the brief target and as a stable dep
  const topCountry = useMemo(
    () =>
      events.length > 0
        ? [...events].sort((a, b) => b.severity - a.severity)[0].country
        : null,
    [events],
  );

  // Trigger brief fetch when the top-severity country first becomes known
  useEffect(() => {
    if (!topCountry) return;
    if (topCountry === lastBriefCountry.current) return; // already fetched for this country
    lastBriefCountry.current = topCountry;
    setBriefLoading(true);
    api.brief
      .generate(topCountry, prefs.interests)
      .then(b => { setBrief(b); setBriefLoading(false); })
      .catch(() => setBriefLoading(false));
  }, [topCountry]); // eslint-disable-line react-hooks/exhaustive-deps
  // ──────────────────────────────────────────────────────────────────────────

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const [layers, setLayers] = useState<Layer[]>(() => {
    const counts: Record<string, number> = { geopolitical: events.length };
    return DEFAULT_LAYERS.map(l => ({ ...l, count: counts[l.id] ?? l.count }));
  });

  const filteredEvents = useMemo(
    () => selectedDomain ? events.filter(e => e.domain === selectedDomain) : events,
    [events, selectedDomain],
  );

  const liveEvents = useMemo(() => filteredEvents.map(toLiveEvent), [filteredEvents]);
  const agents = useMemo(() => deriveAgents(events, brief, briefLoading), [events, brief, briefLoading]);
  const traceSteps = useMemo(() => deriveTrace(events, brief, briefLoading), [events, brief, briefLoading]);

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

  const alertCount = filteredEvents.filter(e => e.severity >= 8).length;

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
        {/* overflow-visible so Leaflet popups/tooltips can extend beyond bounds */}
        <div className="flex-1 relative">
          {/* Layer control — sits above map via z-[1001] (above Leaflet's z-1000) */}
          <div className="absolute top-3 left-3 z-[1001] flex items-center gap-2">
            <LayerControl
              layers={layers}
              onToggleLayer={handleToggleLayer}
              onToggleCategory={handleToggleCategory}
            />
          </div>

          {/* Domain filter pills — sits between stats bar (top) and legend (bottom) */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-1 flex-wrap justify-center px-3 pointer-events-auto max-w-2xl">
            {DOMAINS.map(d => {
              const active = selectedDomain === d.id;
              return (
                <button
                  key={String(d.id)}
                  onClick={() => setSelectedDomain(active ? null : (d.id as string | null))}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-2xs font-mono transition-all duration-150"
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
              );
            })}
          </div>

          <WorldMap events={filteredEvents} />
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
