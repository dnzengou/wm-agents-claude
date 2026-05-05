'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { StatusPulse } from '../ui/StatusPulse';
import { TimeAgo } from '../ui/TimeAgo';

export interface StatusBarProps {
  version: string;
  isLive: boolean;
  region: string;
  lastUpdate: number;
  alertCount: number;
  agentsActive?: number;
  latency?: number;
  className?: string;
}

export function StatusBar({
  version,
  isLive,
  region,
  lastUpdate,
  alertCount,
  agentsActive = 7,
  latency = 9,
  className,
}: StatusBarProps) {
  return (
    <div 
      className={cn(
        'flex items-center justify-between px-4 py-2.5 bg-void border-b border-border-default',
        className
      )}
    >
      {/* Left Section - Logo & Brand */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon to-info flex items-center justify-center">
            <span className="text-obsidian font-bold text-sm">W</span>
          </div>
          <span className="text-sm font-bold text-text-primary tracking-wide">WorldMonitor</span>
        </div>

        <div className="w-px h-4 bg-border-default" />

        {/* Live Status */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <StatusPulse status="active" size="sm" />
              <span className="text-xs font-medium text-neon uppercase tracking-wider">Live</span>
            </>
          ) : (
            <>
              <StatusPulse status="idle" size="sm" />
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Center Section - Search */}
      <div className="flex-1 max-w-md mx-4">
        <div className="glass-panel rounded-lg flex items-center gap-2 px-3 py-1.5">
          <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-sm text-text-muted">CMD+K to search</span>
        </div>
      </div>

      {/* Right Section - Stats & Actions */}
      <div className="flex items-center gap-4">
        {/* Agents Active */}
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-muted uppercase tracking-wider">Agents Active:</span>
          <span className="text-sm font-mono font-semibold text-neon">{agentsActive}</span>
        </div>

        <div className="w-px h-4 bg-border-default" />

        {/* Latency */}
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-muted uppercase tracking-wider">Latency:</span>
          <span className={cn(
            'text-sm font-mono font-semibold',
            latency < 20 ? 'text-success' : latency < 50 ? 'text-neon' : 'text-warning'
          )}>
            {latency}ms
          </span>
        </div>

        <div className="w-px h-4 bg-border-default" />

        {/* Last Update - Client-side only */}
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-muted uppercase tracking-wider">Updated:</span>
          <TimeAgo 
            timestamp={lastUpdate} 
            className="text-sm font-mono text-text-secondary"
            fallback="--"
          />
        </div>

        <div className="w-px h-4 bg-border-default" />

        {/* Notifications */}
        <button className="relative p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {alertCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-alert rounded-full flex items-center justify-center text-2xs font-bold text-white">
              {alertCount}
            </span>
          )}
        </button>

        {/* User Profile */}
        <button className="flex items-center gap-2 px-3 py-1.5 glass-panel rounded-lg hover:border-neon/30 transition-colors">
          <div className="w-6 h-6 rounded-full bg-neon/20 border border-neon/40 flex items-center justify-center">
            <span className="text-xs font-medium text-neon">F</span>
          </div>
          <span className="text-xs text-text-secondary">FREE TIER</span>
        </button>
      </div>
    </div>
  );
}
