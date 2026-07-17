'use client';

import { useEffect, useRef } from 'react';
import type { IntelEvent } from '@/lib/api';

type Options = {
  /** Called each time a new batch of events arrives from the SSE stream. */
  onBatch: (events: IntelEvent[]) => void;
  /** Called when the SSE connection is established. */
  onConnect?: () => void;
  /** Called when the connection closes or fails permanently. */
  onDisconnect?: () => void;
  /** Max reconnection attempts before giving up (default: 5). */
  maxRetries?: number;
};

/**
 * Kafka-style SSE consumer.
 *
 * Connects to /api/stream (which proxies Railway's broadcast channel).
 * Browser EventSource handles automatic reconnection with exponential backoff.
 *
 * Returns `connected` state (useful for showing a live indicator).
 *
 * Falls back gracefully: if the stream endpoint returns an error the hook
 * calls onDisconnect and stops retrying after maxRetries attempts.
 */
export function useEventStream({
  onBatch,
  onConnect,
  onDisconnect,
  maxRetries = 5,
}: Options): { connected: boolean } {
  const connectedRef  = useRef(false);
  const retriesRef    = useRef(0);
  const esRef         = useRef<EventSource | null>(null);

  useEffect(() => {
    let closed = false;

    function connect() {
      if (closed) return;

      const es = new EventSource('/api/stream');
      esRef.current = es;

      es.addEventListener('open', () => {
        retriesRef.current = 0;
        connectedRef.current = true;
        onConnect?.();
      });

      // "intel" events carry a JSON array of IntelEvent from the ingestion batch
      es.addEventListener('intel', (e: MessageEvent) => {
        try {
          const events = JSON.parse(e.data) as IntelEvent[];
          if (Array.isArray(events) && events.length > 0) {
            onBatch(events);
          }
        } catch {
          // malformed JSON — ignore
        }
      });

      es.addEventListener('error', () => {
        connectedRef.current = false;
        es.close();
        esRef.current = null;

        if (retriesRef.current >= maxRetries) {
          onDisconnect?.();
          return;
        }

        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = Math.min(2000 * 2 ** retriesRef.current, 32000);
        retriesRef.current += 1;
        setTimeout(connect, delay);
      });
    }

    connect();

    return () => {
      closed = true;
      esRef.current?.close();
      esRef.current = null;
      connectedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected: connectedRef.current };
}
