import React from 'react';

/**
 * Shared type definitions for WorldMonitor UI
 */

// Command type for Command Palette
export interface Command {
  id: string;
  title: string;
  shortcut?: string;
  icon?: React.ReactNode;
  category: string;
  action: () => void;
}

// Agent status types
export type AgentStatus = 'active' | 'thinking' | 'alert' | 'idle';

// Event severity types
export type EventSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

// Event type categories
export type EventType = 'cyber' | 'physical' | 'economic' | 'political' | 'natural' | 'social';

// Subscription tiers
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

// Reasoning step status
export type StepStatus = 'completed' | 'current' | 'pending';

// WebSocket status
export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
