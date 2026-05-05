/**
 * Shown by Next.js automatically while the server component (page.tsx) is streaming.
 * Provides instant visual feedback — perceived load time drops to ~0ms.
 */
import {
  AgentSkeleton,
  FeedSkeleton,
  MapSkeleton,
  StatusBarSkeleton,
  TraceSkeleton,
} from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-obsidian flex flex-col">
      <StatusBarSkeleton />

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <div className="w-80 flex-shrink-0 border-r border-border-default">
          <FeedSkeleton />
        </div>

        {/* Center map */}
        <div className="flex-1">
          <MapSkeleton />
        </div>

        {/* Right panel */}
        <div className="w-80 flex-shrink-0 border-l border-border-default flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <AgentSkeleton />
          </div>
          <div className="flex-1 min-h-0 border-t border-border-default">
            <TraceSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
