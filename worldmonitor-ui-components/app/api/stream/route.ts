/**
 * GET /api/stream — SSE proxy to the Railway Rust backend.
 *
 * Runs on Vercel Edge Runtime so the streaming response body is piped
 * directly without buffering — essential for SSE.
 *
 * If Railway is unreachable the endpoint returns 503; the frontend
 * EventSource will retry automatically (standard browser behaviour).
 *
 * Protocol (from Railway /api/stream):
 *   event: intel
 *   data: <JSON IntelEvent[]>   — new batch after each 15-min ingestion
 *
 *   (keepalive comment every 30 s keeps the connection alive through proxies)
 */
export const runtime = 'edge';

export async function GET() {
  const backendUrl = process.env.RUST_BACKEND_URL;

  if (!backendUrl) {
    return new Response('SSE backend not configured', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl}/api/stream`, {
      // No timeout — SSE is a long-lived connection
      headers: { Accept: 'text/event-stream' },
    });
  } catch {
    return new Response('SSE backend unreachable', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response('SSE upstream error', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Pipe the upstream body directly — Edge Runtime streams this without buffering
  return new Response(upstream.body, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',    // disable nginx/Vercel buffering
      'Connection':    'keep-alive',
    },
  });
}
