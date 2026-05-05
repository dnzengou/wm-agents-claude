import { cn } from '@/lib/utils';

// ─── Primitive ───────────────────────────────────────────────────────────────

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded bg-surface/60', className)}
      {...props}
    />
  );
}

/** @internal */
const Shimmer = Skeleton;

// ─── Status bar ──────────────────────────────────────────────────────────────

export function StatusBarSkeleton() {
  return (
    <div className="h-12 bg-void border-b border-border-default flex items-center px-4 gap-4">
      <Shimmer className="h-5 w-24" />
      <Shimmer className="h-3 w-2 rounded-full" />
      <Shimmer className="h-4 w-32" />
      <div className="ml-auto flex items-center gap-3">
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-3 w-8" />
        <Shimmer className="h-6 w-6 rounded" />
      </div>
    </div>
  );
}

// ─── Feed panel ──────────────────────────────────────────────────────────────

function FeedItem() {
  return (
    <div className="p-3 space-y-2 border-b border-border-subtle">
      <div className="flex items-center gap-2">
        <Shimmer className="h-2 w-2 rounded-full flex-shrink-0" />
        <Shimmer className="h-2.5 w-16" />
        <Shimmer className="h-2.5 w-20 ml-auto" />
      </div>
      <Shimmer className="h-3 w-full" />
      <Shimmer className="h-3 w-3/4" />
      <div className="flex gap-2">
        <Shimmer className="h-4 w-14 rounded-full" />
        <Shimmer className="h-4 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border-subtle">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-border-default">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="h-4 w-4 rounded ml-auto" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <FeedItem key={i} />
      ))}
    </div>
  );
}

// ─── Agent panel ─────────────────────────────────────────────────────────────

function AgentCard() {
  return (
    <div className="p-3 rounded border border-border-subtle space-y-2 mb-2">
      <div className="flex items-center gap-2">
        <Shimmer className="h-2 w-2 rounded-full flex-shrink-0" />
        <Shimmer className="h-3 w-24" />
        <Shimmer className="h-4 w-14 rounded-full ml-auto" />
      </div>
      <Shimmer className="h-2.5 w-40" />
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[0, 1, 2].map(j => (
          <div key={j} className="text-center space-y-1">
            <Shimmer className="h-3 w-full" />
            <Shimmer className="h-2 w-2/3 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="p-3">
      <Shimmer className="h-4 w-36 mb-3" />
      {Array.from({ length: count }).map((_, i) => (
        <AgentCard key={i} />
      ))}
    </div>
  );
}

// ─── Map center ──────────────────────────────────────────────────────────────

export function MapSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-obsidian relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-10" />
      <div className="flex flex-col items-center gap-4 z-10">
        <Shimmer className="w-20 h-20 rounded-full" />
        <Shimmer className="h-4 w-48" />
        <Shimmer className="h-3 w-32" />
        <div className="flex gap-6 mt-2">
          <div className="text-center space-y-1">
            <Shimmer className="h-5 w-10" />
            <Shimmer className="h-2 w-14" />
          </div>
          <div className="text-center space-y-1">
            <Shimmer className="h-5 w-10" />
            <Shimmer className="h-2 w-14" />
          </div>
          <div className="text-center space-y-1">
            <Shimmer className="h-5 w-10" />
            <Shimmer className="h-2 w-14" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reasoning trace ─────────────────────────────────────────────────────────

export function TraceSkeleton({ steps = 4 }: { steps?: number }) {
  return (
    <div className="p-3 space-y-3">
      <Shimmer className="h-4 w-32" />
      {Array.from({ length: steps }).map((_, i) => (
        <div key={i} className="flex gap-3 items-start">
          <Shimmer className="h-5 w-5 rounded-full flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-3 w-32" />
            <Shimmer className="h-2.5 w-full" />
            <Shimmer className="h-2.5 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
