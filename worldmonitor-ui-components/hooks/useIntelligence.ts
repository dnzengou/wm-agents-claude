'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, IntelEvent } from '@/lib/api';
import { getUserId } from '@/lib/user';

type Options = {
  /** Pre-fetched data from the server component — avoids a client-side round-trip on mount. */
  initialData?: IntelEvent[];
  /** How often to poll for updates (ms). Default: 30 000. */
  pollInterval?: number;
};

type State = {
  events: IntelEvent[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
};

export function useIntelligence({ initialData = [], pollInterval = 30_000 }: Options = {}) {
  const [state, setState] = useState<State>({
    events: initialData,
    isLoading: initialData.length === 0,
    error: null,
    lastUpdated: initialData.length > 0 ? Date.now() : null,
  });

  // Track the last sync timestamp for differential updates
  const lastSync = useRef<number>(Date.now() - 60_000);
  const mounted = useRef(true);

  const setPartial = (patch: Partial<State>) =>
    setState(prev => ({ ...prev, ...patch }));

  /** Full refresh — replaces all events. */
  const refresh = useCallback(async () => {
    setPartial({ isLoading: true, error: null });
    try {
      const data = await api.intelligence.getLatest();
      if (!mounted.current) return;
      lastSync.current = Date.now();
      setState({ events: data, isLoading: false, error: null, lastUpdated: Date.now() });
    } catch (err) {
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
        const merged = [...fresh, ...prev.events].slice(0, 100);
        return { ...prev, events: merged, lastUpdated: Date.now() };
      });
      lastSync.current = server_time;
    } catch {
      // Sync failures are silent — full refresh handles recovery
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    // If no server-side data was provided, fetch immediately
    if (initialData.length === 0) {
      refresh();
    }

    // Differential sync on interval
    const poll = setInterval(syncNew, pollInterval);

    // Full refresh on tab focus (catches long idle sessions)
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
