'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/Badge';
import { formatRelativeTime } from '@/lib/utils';

export type EventSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type EventType = 'cyber' | 'physical' | 'economic' | 'political' | 'natural' | 'social';

export interface ActivityEvent {
  id: string;
  timestamp: number;
  severity: EventSeverity;
  type: EventType;
  title: string;
  description: string;
  location?: string;
  source: string;
  confidence: number;
  isNew?: boolean;
}

export interface ActivityFeedProps {
  events: ActivityEvent[];
  onEventClick?: (event: ActivityEvent) => void;
  maxHeight?: string;
  className?: string;
}

const eventTypeIcons: Record<EventType, React.ReactNode> = {
  cyber: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  ),
  physical: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  economic: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  political: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  natural: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  ),
  social: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
  ),
};

export function ActivityFeed({ 
  events, 
  onEventClick, 
  maxHeight = '400px',
  className 
}: ActivityFeedProps) {
  return (
    <div 
      className={cn('flex flex-col', className)}
      style={{ maxHeight }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-bg-secondary">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse-glow" />
          <h3 className="text-sm font-semibold text-text-primary">Live Activity</h3>
          <Badge variant="cyan" dot pulse>
            {events.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
          <button className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
            <svg className="w-12 h-12 mb-3 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {events.map((event, index) => (
              <ActivityEventItem
                key={event.id}
                event={event}
                onClick={() => onEventClick?.(event)}
                isEven={index % 2 === 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ActivityEventItemProps {
  event: ActivityEvent;
  onClick?: () => void;
  isEven?: boolean;
}

function ActivityEventItem({ event, onClick, isEven }: ActivityEventItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'px-4 py-3 cursor-pointer transition-all duration-fast group',
        isEven ? 'bg-bg-secondary' : 'bg-bg-primary',
        'hover:bg-bg-tertiary'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon & Severity */}
        <div className={cn(
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          event.severity === 'critical' && 'bg-accent-red/15 text-accent-red',
          event.severity === 'high' && 'bg-accent-amber/15 text-accent-amber',
          event.severity === 'medium' && 'bg-yellow-500/15 text-yellow-500',
          event.severity === 'low' && 'bg-accent-blue/15 text-accent-blue',
          event.severity === 'info' && 'bg-text-secondary/15 text-text-secondary',
        )}>
          {eventTypeIcons[event.type]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={event.severity}>
              {event.severity}
            </Badge>
            <span className="text-2xs text-text-tertiary font-mono">
              {formatRelativeTime(event.timestamp)}
            </span>
            {event.isNew && (
              <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" />
            )}
          </div>

          <h4 className="text-sm font-medium text-text-primary truncate group-hover:text-accent-cyan transition-colors">
            {event.title}
          </h4>

          <p className="text-xs text-text-secondary line-clamp-2 mt-0.5">
            {event.description}
          </p>

          <div className="flex items-center gap-3 mt-2">
            {event.location && (
              <span className="flex items-center gap-1 text-2xs text-text-tertiary">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {event.location}
              </span>
            )}
            <span className="flex items-center gap-1 text-2xs text-text-tertiary">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
              {event.source}
            </span>
            <span className={cn(
              'text-2xs font-mono',
              event.confidence >= 90 ? 'text-accent-green' :
              event.confidence >= 70 ? 'text-accent-cyan' :
              event.confidence >= 50 ? 'text-accent-amber' : 'text-accent-red'
            )}>
              {event.confidence}% conf
            </span>
          </div>
        </div>

        {/* Arrow */}
        <svg 
          className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1"
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
