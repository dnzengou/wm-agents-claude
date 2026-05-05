'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { StatusPulse } from '../ui/StatusPulse';

export type AgentStatus = 'active' | 'thinking' | 'alert' | 'idle';

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  lastActivity?: string;
  connections?: string[];
  metrics?: {
    tasksProcessed?: number;
    latency?: number;
    confidence?: number;
  };
}

export interface AgentStatusProps {
  agents: Agent[];
  title?: string;
  className?: string;
}

export function AgentStatus({ agents, title = 'Agent Status Overview', className }: AgentStatusProps) {
  return (
    <div className={cn('panel flex flex-col h-full', className)}>
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <div className="flex items-center gap-2">
          <StatusPulse status="active" size="sm" />
          <span className="text-xs text-text-tertiary">
            {agents.filter(a => a.status === 'active').length}/{agents.length} Active
          </span>
        </div>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {agents.map((agent) => (
          <AgentNode key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

interface AgentNodeProps {
  agent: Agent;
}

function AgentNode({ agent }: AgentNodeProps) {
  const statusColors: Record<AgentStatus, string> = {
    active: 'border-neon shadow-neon-sm',
    thinking: 'border-warning',
    alert: 'border-alert shadow-alert',
    idle: 'border-border-default',
  };

  return (
    <div
      className={cn(
        'agent-node relative',
        agent.status === 'active' && 'agent-node-active',
        statusColors[agent.status]
      )}
    >
      {/* Connection Lines (Visual) */}
      {agent.connections && agent.connections.length > 0 && (
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {agent.connections.map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-4 h-px',
                agent.status === 'active' ? 'bg-neon/50' : 'bg-border-default'
              )}
            />
          ))}
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              agent.status === 'active' ? 'bg-neon animate-pulse' : 'bg-border-default'
            )}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* Status Indicator */}
        <StatusPulse status={agent.status} size="sm" />

        {/* Agent Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {agent.name}
            </span>
            {agent.metrics?.confidence && (
              <span className="text-2xs font-mono text-neon">
                {agent.metrics.confidence}%
              </span>
            )}
          </div>
          
          {agent.lastActivity && (
            <p className="text-2xs text-text-muted mt-0.5">
              {agent.lastActivity}
            </p>
          )}
        </div>

        {/* Metrics */}
        {agent.metrics && (
          <div className="flex items-center gap-3 text-2xs text-text-tertiary">
            {agent.metrics.tasksProcessed !== undefined && (
              <span className="font-mono">{agent.metrics.tasksProcessed} tasks</span>
            )}
            {agent.metrics.latency !== undefined && (
              <span className="font-mono text-success">{agent.metrics.latency}ms</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
