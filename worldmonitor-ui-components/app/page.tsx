/**
 * Root dashboard page — SERVER COMPONENT.
 *
 * Fetches intelligence data at render time so the client receives
 * pre-rendered HTML with real data on the very first paint.
 * The DashboardClient then takes over and polls for incremental updates.
 * AuthGate (client) checks for a local session and redirects to /login if absent.
 */
import type { Metadata } from 'next';
import { DashboardClient } from '@/components/dashboard/DashboardClient';
import { AuthGate } from '@/components/auth/AuthGate';
import { api } from '@/lib/api';
import { SEED_EVENTS } from '@/lib/seed-events';

export const metadata: Metadata = {
  title: 'WorldMonitor | Live Intelligence Dashboard',
  description:
    'Real-time OSINT dashboard fusing 150+ data sources into actionable intelligence. Monitor global threats, cyber incidents, and geopolitical events.',
};

// Revalidate the page every 60 seconds so SSR cache stays warm without going stale.
export const revalidate = 60;

export default async function DashboardPage() {
  const live = await api.intelligence.getLatest().catch(() => []);
  // Use seed events when Railway backend is unreachable or returns no data.
  const initialEvents = live.length > 0 ? live : SEED_EVENTS;

  return (
    <AuthGate>
      <DashboardClient initialEvents={initialEvents} />
    </AuthGate>
  );
}
