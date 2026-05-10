/**
 * Type-safe API client for the WorldMonitor Rust backend.
 * Base URL is read from NEXT_PUBLIC_API_URL (defaults to localhost:8080 for dev).
 */

/**
 * Base URL strategy:
 *  - Browser: '' (relative) → Next.js rewrite proxy (/api/* → Rust backend, see next.config.js)
 *  - Server (SSR): RUST_BACKEND_URL env var → direct fetch to Rust (no extra hop)
 * In development both point to http://localhost:8080.
 */
const BASE_URL =
  typeof window === 'undefined'
    ? (process.env.RUST_BACKEND_URL ?? 'http://localhost:8080')
    : '';

// ─── Domain types (mirror the Rust model structs) ───────────────────────────

export type IntelEvent = {
  id: string;
  country: string;
  lat: number;
  lon: number;
  /** 1–10 severity score */
  severity: number;
  headline: string;
  source: 'gdelt' | 'rss' | 'manual';
  /** Unix millis */
  timestamp: number;
};

export type Brief = {
  summary: string;
  event_count: number;
  country: string;
  generated_at: number;
};

export type UserProfile = {
  user_id: string;
  streak: number;
  interests: string[];
  countries: string[];
  is_new?: boolean;
};

export type GeoData = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { country: string; severity: number; headline: string };
  }>;
};

export type SyncResult = {
  new_events: IntelEvent[];
  server_time: number;
};

// ─── Internal fetch wrapper ──────────────────────────────────────────────────

async function req<T>(
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init?: RequestInit & { next?: any },
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...(init as RequestInit),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ─── Public API surface ──────────────────────────────────────────────────────

export const api = {
  intelligence: {
    /** Get latest 100 events (24h window), sorted by severity. Cached 60s. */
    getLatest: (opts?: RequestInit) =>
      req<IntelEvent[]>('/api/intelligence', {
        cache: 'no-store',
        ...opts,
      }),

    /** Differential sync — returns events newer than `since` (Unix ms). */
    sync: (since: number, userId: string) =>
      req<SyncResult>(`/api/sync?since=${since}`, {
        headers: { 'X-User-Id': userId },
        cache: 'no-store',
      }),
  },

  brief: {
    /** Generate an AI intelligence brief for a country + user interests. */
    generate: (country: string, interests: string[]) =>
      req<Brief>('/api/brief', {
        method: 'POST',
        body: JSON.stringify({ country, interests }),
      }),
  },

  geo: {
    /** GeoJSON FeatureCollection of current events for map rendering. */
    getGeoJSON: () =>
      req<GeoData>('/api/geo', { next: { revalidate: 3600 } } as RequestInit),
  },

  user: {
    /** Get or create a user profile (creates on first call). */
    get: (userId: string) =>
      req<UserProfile>('/api/user', {
        headers: { 'X-User-Id': userId },
        cache: 'no-store',
      }),

    /** Persist user interests / watched countries. */
    update: (userId: string, data: { interests?: string[]; countries?: string[] }) =>
      req<UserProfile>('/api/user', {
        method: 'POST',
        headers: { 'X-User-Id': userId },
        body: JSON.stringify(data),
        cache: 'no-store',
      }),
  },

  alerts: {
    /** Subscribe to a country alert (free tier: max 3). */
    create: (userId: string, country: string, threshold: number) =>
      req<{ success: boolean; message: string }>('/api/alerts', {
        method: 'POST',
        headers: { 'X-User-Id': userId },
        body: JSON.stringify({ country, threshold }),
        cache: 'no-store',
      }),
  },

  health: {
    check: () =>
      req<{ status: string; version: string; timestamp: number }>('/health'),
  },
} as const;

// ─── Severity helpers ────────────────────────────────────────────────────────

export type SeverityLabel = 'critical' | 'high' | 'medium' | 'low' | 'info';

export function scoredToLabel(score: number): SeverityLabel {
  if (score >= 8) return 'critical';
  if (score >= 6) return 'high';
  if (score >= 4) return 'medium';
  if (score >= 2) return 'low';
  return 'info';
}
