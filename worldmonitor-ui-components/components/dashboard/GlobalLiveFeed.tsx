'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/Badge';
import { StatusPulse } from '../ui/StatusPulse';
import { TimeAgo } from '../ui/TimeAgo';
import type { EventSeverity, EventType } from '@/types';

export interface LiveEvent {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: number;
  severity: EventSeverity;
  type: EventType;
  title: string;
  description: string;
  location?: string;
  isNew?: boolean;
  isGated?: boolean;
}

export interface GlobalLiveFeedProps {
  events: LiveEvent[];
  onEventClick?: (event: LiveEvent) => void;
  onUpgrade?: () => void;
  maxHeight?: string;
  className?: string;
}

const severityBadges: Record<EventSeverity, { variant: string; icon: React.ReactNode }> = {
  critical: {
    variant: 'alert',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  high: {
    variant: 'warning',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  medium: {
    variant: 'neon',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  low: {
    variant: 'success',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  info: {
    variant: 'default',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export function GlobalLiveFeed({
  events,
  onEventClick,
  onUpgrade,
  maxHeight = '100%',
  className,
}: GlobalLiveFeedProps) {
  return (
    <div className={cn('panel flex flex-col h-full', className)}>
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Global Live Feed</h3>
            <StatusPulse status="active" size="sm" showLabel />
          </div>
          <div className="flex items-center gap-1">
            <button className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface rounded transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            <button className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface rounded transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ maxHeight }}
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm">No recent activity</p>
            <p className="text-xs text-text-muted mt-1">Agents are monitoring...</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {events.map((event, index) => (
              <EventItem
                key={event.id}
                event={event}
                onClick={() => onEventClick?.(event)}
                onUpgrade={onUpgrade}
                isEven={index % 2 === 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface EventItemProps {
  event: LiveEvent;
  onClick?: () => void;
  onUpgrade?: () => void;
  isEven?: boolean;
}

function EventItem({ event, onClick, onUpgrade, isEven }: EventItemProps) {
  const severity = severityBadges[event.severity];

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-4 cursor-pointer transition-all duration-fast group',
        isEven ? 'bg-void' : 'bg-obsidian',
        'hover:bg-surface'
      )}
    >
      {/* Agent Label */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon animate-pulse" />
          <span className="text-2xs font-mono text-neon uppercase tracking-wider">
            {event.agentName}
          </span>
          {event.isNew && (
            <Badge variant="neon" className="text-2xs">
              NEW
            </Badge>
          )}
        </div>
        {/* Use client-side only TimeAgo component */}
        <TimeAgo 
          timestamp={event.timestamp} 
          className="text-2xs text-text-muted font-mono"
          fallback="--"
        />
      </div>

      {/* Content */}
      <div className="flex items-start gap-3">
        {/* Severity Icon */}
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
            event.severity === 'critical' && 'bg-alert/15 text-alert',
            event.severity === 'high' && 'bg-warning/15 text-warning',
            event.severity === 'medium' && 'bg-neon/15 text-neon',
            event.severity === 'low' && 'bg-success/15 text-success',
            event.severity === 'info' && 'bg-surface text-text-muted'
          )}
        >
          {severity.icon}
        </div>

        {/* Event Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-text-primary truncate group-hover:text-neon transition-colors">
            {event.title}
          </h4>

          <p className="text-xs text-text-secondary line-clamp-2 mt-1">
            {event.description}
          </p>

          {/* Footer */}
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={severity.variant as any} className="text-2xs">
              {event.severity}
            </Badge>
            
            {event.location && (
              <span className="flex items-center gap-1 text-2xs text-text-muted">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Monetization Gate */}
      {event.isGated && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpgrade?.();
            }}
            className="btn btn-upgrade w-full justify-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Upgrade to View PII
          </button>
        </div>
      )}
    </div>
  );
}
