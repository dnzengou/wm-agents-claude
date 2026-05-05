'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type PulseStatus = 'active' | 'thinking' | 'alert' | 'idle';

export interface StatusPulseProps {
  status: PulseStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
  label?: string;
}

const statusConfig: Record<PulseStatus, { color: string; animation: string; defaultLabel: string }> = {
  active: {
    color: 'bg-neon',
    animation: 'animate-pulse-neon',
    defaultLabel: 'Active',
  },
  thinking: {
    color: 'bg-warning',
    animation: 'animate-pulse-fast',
    defaultLabel: 'Processing',
  },
  alert: {
    color: 'bg-alert',
    animation: 'animate-pulse-fast',
    defaultLabel: 'Alert',
  },
  idle: {
    color: 'bg-text-muted',
    animation: '',
    defaultLabel: 'Idle',
  },
};

const sizeConfig = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

export const StatusPulse = React.forwardRef<HTMLDivElement, StatusPulseProps>(
  ({ status, size = 'md', className, showLabel = false, label }, ref) => {
    const config = statusConfig[status];
    const displayLabel = label || config.defaultLabel;

    return (
      <div ref={ref} className={cn('flex items-center gap-2', className)}>
        <span
          className={cn(
            'rounded-full',
            sizeConfig[size],
            config.color,
            config.animation
          )}
        />
        {showLabel && (
          <span className={cn(
            'text-xs font-medium',
            status === 'active' && 'text-neon',
            status === 'thinking' && 'text-warning',
            status === 'alert' && 'text-alert',
            status === 'idle' && 'text-text-muted'
          )}>
            {displayLabel}
          </span>
        )}
      </div>
    );
  }
);

StatusPulse.displayName = 'StatusPulse';
