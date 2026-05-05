/**
 * Root dashboard page — SERVER COMPONENT.
 *
 * Fetches intelligence data at render time so the client receives
 * pre-rendered HTML with real data on the very first paint.
 * The DashboardClient then takes over and polls for incremental updates.
 */
import type { Metadata } from 'next';
import { DashboardClient } from '@/components/dashboard/DashboardClient';
import { api } from '@/lib/api';

export const metadata: Metadata = {
  title: 'WorldMonitor | Live Intelligence Dashboard',
  description:
    'Real-time OSINT dashboard fusing 150+ data sources into actionable intelligence. Monitor global threats, cyber incidents, and geopolitical events.',
};

// Revalidate the page every 60 seconds so SSR cache stays warm without going stale.
export const revalidate = 60;

export default async function DashboardPage() {
  // Pre-fetch on the server — this data is streamed with the HTML, so the
  // client component renders immediately with real data (no loading spinner).
  let initialEvents = await api.intelligence.getLatest().catch(() => []);

  return <DashboardClient initialEvents={initialEvents} />;
}
