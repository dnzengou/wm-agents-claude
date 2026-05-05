import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a timestamp to relative time (e.g., "2m ago", "3h ago")
 * 
 * NOTE: This function uses Date.now() which can cause hydration mismatches
 * in Next.js. For client-side rendering, use the TimeAgo component instead:
 * 
 * import { TimeAgo } from '@/components/ui/TimeAgo';
 * <TimeAgo timestamp={timestamp} />
 */
export function formatRelativeTime(timestamp: number | Date): string {
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
}

/**
 * Format a timestamp to absolute time (e.g., "14:32:07 UTC")
 * 
 * NOTE: For client-side rendering, use the AbsoluteTime component instead:
 * 
 * import { AbsoluteTime } from '@/components/ui/TimeAgo';
 * <AbsoluteTime timestamp={timestamp} />
 */
export function formatAbsoluteTime(timestamp: number | Date): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/**
 * Format a number with commas as thousands separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format a number with compact notation (e.g., 1.2K, 3.5M)
 */
export function formatCompactNumber(num: number): string {
  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  });
  return formatter.format(num);
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Get severity color based on severity level
 */
export function getSeverityColor(severity: 'critical' | 'high' | 'medium' | 'low' | 'info'): string {
  const colors = {
    critical: 'text-alert border-alert bg-alert/15',
    high: 'text-warning border-warning bg-warning/15',
    medium: 'text-neon border-neon bg-neon/15',
    low: 'text-success border-success bg-success/15',
    info: 'text-text-secondary border-border-default bg-surface',
  };
  return colors[severity];
}

/**
 * Get severity label
 */
export function getSeverityLabel(severity: 'critical' | 'high' | 'medium' | 'low' | 'info'): string {
  const labels = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    info: 'Info',
  };
  return labels[severity];
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Group an array by a key function
 */
export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Sort an array by a key function
 */
export function sortBy<T>(array: T[], keyFn: (item: T) => number, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aKey = keyFn(a);
    const bKey = keyFn(b);
    return direction === 'asc' ? aKey - bKey : bKey - aKey;
  });
}

/**
 * Calculate confidence score color
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'text-success';
  if (confidence >= 70) return 'text-neon';
  if (confidence >= 50) return 'text-warning';
  return 'text-alert';
}

/**
 * Format confidence as percentage
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence)}%`;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Sleep for a given duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
