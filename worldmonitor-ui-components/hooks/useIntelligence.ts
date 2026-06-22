'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, IntelEvent } from '@/lib/api';
import { getUserId } from '@/lib/user';
import { useEventStream } from './useEventStream';

type Options = {
  /** Pre-fetched data from the server component — avoids a client-side round-trip on mount. */
  initialData?: IntelEvent[];
  /** How often to poll for updates (ms). Default: 30 000. */
  pollInterval?: number;
};

type State = {
  events:      IntelEvent[];
  isLoading:   boolean;
  error:       string | null;
  lastUpdated: number | null;
  /** true while SSE stream is connected (Kafka-style real-time push active) */
  streaming:   boolean;
};

export function useIntelligence({ initialData = [], pollInterval = 30_000 }: Options = {}) {
  const [state, setState] = useState<State>({
    events:      initialData,
    isLoading:   initialData.length === 0,
    error:       null,
    lastUpdated: initialData.length > 0 ? Date.now() : null,
    streaming:   false,
  });

  const lastSync   = useRef<number>(Date.now() - 60_000);
  const mounted    = useRef(true);
  const streamingRef = useRef(false); // shadow state for interval callbacks

  const setPartial = (patch: Partial<State>) =>
    setState(prev => ({ ...prev, ...patch }));

  /** Full refresh — replaces all events. */
  const refresh = useCallback(async () => {
    setPartial({ isLoading: true, error: null });
    try {
      const data = await api.intelligence.getLatest();
      if (!mounted.current) return;
      lastSync.current = Date.now();
      setState(prev => ({
        ...prev,
        events:      data,
        isLoading:   false,
        error:       null,
        lastUpdated: Date.now(),
      }));
    } catch {
      if (!mounted.current) return;
      setPartial({ isLoading: false, error: 'Unable to reach intelligence server' });
    }
  }, []);

  /** Incremental sync — prepends only new events. Silent on failure. */
  const syncNew = useCallback(async () => {
    try {
      const userId = getUserId();
      const { new_events, server_time } = await api.intelligence.sync(lastSync.current, userId);
      if (!mounted.current || new_events.length === 0) return;
      setState(prev => {
        const existingIds = new Set(prev.events.map(e => e.id));
        const fresh = new_events.filter(e => !existingIds.has(e.id));
        if (fresh.length === 0) return prev;
        return {
          ...prev,
          events:      [...fresh, ...prev.events].slice(0, 100),
          lastUpdated: Date.now(),
        };
      });
      lastSync.current = server_time;
    } catch {
      // Sync failures are silent — full refresh handles recovery
    }
  }, []);

  // ── SSE: Kafka-style real-time push ──────────────────────────────────────
  // When connected, the ingestion loop's broadcast arrives here directly.
  // Polling stays active at full rate as fallback; SSE just pre-empts it.
  useEventStream({
    onBatch: (incoming) => {
      if (!mounted.current) return;
      setState(prev => {
        const existingIds = new Set(prev.events.map(e => e.id));
        const fresh = incoming.filter(e => !existingIds.has(e.id));
        if (fresh.length === 0) return prev;
        return {
          ...prev,
          events:      [...fresh, ...prev.events].slice(0, 100),
          lastUpdated: Date.now(),
          streaming:   true,
        };
      });
      lastSync.current = Date.now();
    },
    onConnect:    () => { streamingRef.current = true;  setPartial({ streaming: true }); },
    onDisconnect: () => { streamingRef.current = false; setPartial({ streaming: false }); },
    maxRetries: 5,
  });

  // ── Polling: reliable fallback regardless of SSE state ───────────────────
  useEffect(() => {
    mounted.current = true;

    if (initialData.length === 0) refresh();

    // Differential sync — still runs even when SSE is active (belt-and-suspenders)
    const poll = setInterval(syncNew, pollInterval);

    // Full refresh on tab focus
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      mounted.current = false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, refresh };
}
