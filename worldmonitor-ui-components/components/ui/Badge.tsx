'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 
  | 'critical' 
  | 'high' 
  | 'medium' 
  | 'low' 
  | 'info' 
  | 'cyan' 
  | 'green' 
  | 'purple' 
  | 'default';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', dot = false, pulse = false, children, ...props }, ref) => {
    const variants: Record<BadgeVariant, string> = {
      critical: 'bg-accent-red/15 text-accent-red border-accent-red/30',
      high: 'bg-accent-amber/15 text-accent-amber border-accent-amber/30',
      medium: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
      low: 'bg-accent-blue/15 text-accent-blue border-accent-blue/30',
      info: 'bg-text-secondary/15 text-text-secondary border-text-secondary/30',
      cyan: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30',
      green: 'bg-accent-green/15 text-accent-green border-accent-green/30',
      purple: 'bg-accent-purple/15 text-accent-purple border-accent-purple/30',
      default: 'bg-bg-tertiary text-text-secondary border-border-default',
    };

    const dotColors: Record<BadgeVariant, string> = {
      critical: 'bg-accent-red',
      high: 'bg-accent-amber',
      medium: 'bg-yellow-500',
      low: 'bg-accent-blue',
      info: 'bg-text-secondary',
      cyan: 'bg-accent-cyan',
      green: 'bg-accent-green',
      purple: 'bg-accent-purple',
      default: 'bg-text-secondary',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide border rounded',
          variants[variant],
          className
        )}
        {...props}
      >
        {dot && (
          <span 
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              dotColors[variant],
              pulse && 'animate-pulse-glow'
            )} 
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
