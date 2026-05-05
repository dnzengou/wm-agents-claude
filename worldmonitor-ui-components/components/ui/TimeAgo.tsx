'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface TimeAgoProps {
  timestamp: number | Date;
  className?: string;
  fallback?: string;
}

/**
 * Client-side only time display component
 * Prevents hydration mismatches by only rendering after mount
 */
export function TimeAgo({ timestamp, className, fallback = '...' }: TimeAgoProps) {
  const [timeAgo, setTimeAgo] = useState<string>(fallback);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    const calculateTimeAgo = () => {
      const now = Date.now();
      const then = timestamp instanceof Date ? timestamp.getTime() : timestamp;
      const diff = now - then;

      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) return 'just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days < 30) return `${days}d ago`;

      return new Date(then).toLocaleDateString();
    };

    // Initial calculation
    setTimeAgo(calculateTimeAgo());

    // Update every minute
    const interval = setInterval(() => {
      setTimeAgo(calculateTimeAgo());
    }, 60000);

    return () => clearInterval(interval);
  }, [timestamp]);

  // During SSR, render fallback or suppress warning
  if (!mounted) {
    return (
      <span className={className} suppressHydrationWarning>
        {fallback}
      </span>
    );
  }

  return (
    <span className={className} suppressHydrationWarning>
      {timeAgo}
    </span>
  );
}

/**
 * Absolute time display with client-side only rendering
 */
export function AbsoluteTime({ timestamp, className }: { timestamp: number | Date; className?: string }) {
  const [formatted, setFormatted] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    setFormatted(date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
  }, [timestamp]);

  if (!mounted) {
    return <span className={className} suppressHydrationWarning>--</span>;
  }

  return <span className={className} suppressHydrationWarning>{formatted}</span>;
}

/**
 * Live timestamp that updates in real-time
 */
export function LiveTimestamp({ timestamp, className }: { timestamp: number | Date; className?: string }) {
  const [display, setDisplay] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    const updateDisplay = () => {
      const now = Date.now();
      const then = timestamp instanceof Date ? timestamp.getTime() : timestamp;
      const diff = now - then;
      
      const seconds = Math.floor(diff / 1000);
      
      if (seconds < 60) {
        setDisplay(`${seconds}s ago`);
      } else {
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
          setDisplay(`${minutes}m ago`);
        } else {
          const hours = Math.floor(minutes / 60);
          setDisplay(`${hours}h ago`);
        }
      }
    };

    updateDisplay();
    const interval = setInterval(updateDisplay, 1000);
    
    return () => clearInterval(interval);
  }, [timestamp]);

  if (!mounted) {
    return <span className={className} suppressHydrationWarning>--</span>;
  }

  return <span className={className} suppressHydrationWarning>{display}</span>;
}
