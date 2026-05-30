import { NextResponse } from 'next/server';
import { SEED_EVENTS } from '@/lib/seed-events';

// Edge runtime: zero cold-start latency, global PoP distribution.
export const runtime = 'edge';

// Takes precedence over the next.config.js rewrite for /api/intelligence.
// Tries the Railway backend first; falls back to seed events if unreachable or empty.
export async function GET() {
  const backendUrl = process.env.RUST_BACKEND_URL;

  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/intelligence`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return NextResponse.json(data, {
            headers: {
              'X-Source': 'railway-backend',
              // Vercel edge: serve fresh for 30s, stale for 60s while revalidating
              'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
          });
        }
      }
    } catch {
      // Backend unreachable — fall through to seed data
    }
  }

  return NextResponse.json(SEED_EVENTS, {
    headers: {
      'X-Source': 'seed-data',
      // Seed data is static — cache for 5 min, stale for 10 min
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
