'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/Badge';

export type StepStatus = 'completed' | 'current' | 'pending';

export interface ReasoningStep {
  id: string;
  order: number;
  title: string;
  description: string;
  status: StepStatus;
  confidence?: number;
  timestamp?: string;
  details?: string;
}

export interface ReasoningTraceProps {
  steps: ReasoningStep[];
  title?: string;
  showProgress?: boolean;
  className?: string;
}

export function ReasoningTrace({
  steps,
  title = 'Reasoning Trace',
  showProgress = true,
  className,
}: ReasoningTraceProps) {
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const progress = (completedSteps / steps.length) * 100;

  return (
    <div className={cn('panel flex flex-col h-full', className)}>
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <span className="text-xs text-text-tertiary">
            {completedSteps}/{steps.length} steps
          </span>
        </div>
        
        {/* Progress Bar */}
        {showProgress && (
          <div className="h-1 bg-void-light rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-neon to-success transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {steps.map((step, index) => (
          <StepItem
            key={step.id}
            step={step}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

interface StepItemProps {
  step: ReasoningStep;
  isLast: boolean;
}

function StepItem({ step, isLast }: StepItemProps) {
  const statusConfig: Record<StepStatus, { dotClass: string; bgClass: string }> = {
    completed: {
      dotClass: 'bg-success text-obsidian',
      bgClass: 'bg-success/5 border-success/20',
    },
    current: {
      dotClass: 'bg-neon text-obsidian shadow-neon',
      bgClass: 'bg-neon/5 border-neon/30',
    },
    pending: {
      dotClass: 'bg-void-light text-text-muted border-border-default',
      bgClass: 'bg-transparent border-transparent',
    },
  };

  const config = statusConfig[step.status];

  return (
    <div className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div
          className={cn(
            'absolute left-4 top-8 w-px h-[calc(100%-16px)]',
            step.status === 'completed' ? 'bg-success/30' : 'bg-border-default'
          )}
        />
      )}

      <div
        className={cn(
          'flex gap-3 p-3 rounded-lg border transition-all duration-fast',
          config.bgClass,
          step.status === 'current' && 'shadow-neon-sm'
        )}
      >
        {/* Step Number */}
        <div
          className={cn(
            'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
            config.dotClass
          )}
        >
          {step.status === 'completed' ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            step.order
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              'text-sm font-medium',
              step.status === 'pending' ? 'text-text-muted' : 'text-text-primary'
            )}>
              {step.title}
            </span>
            {step.confidence !== undefined && step.status !== 'pending' && (
              <Badge
                variant={step.confidence >= 90 ? 'success' : step.confidence >= 70 ? 'neon' : 'warning'}
                className="text-2xs"
              >
                {step.confidence}%
              </Badge>
            )}
          </div>

          <p className={cn(
            'text-xs leading-relaxed',
            step.status === 'pending' ? 'text-text-muted' : 'text-text-secondary'
          )}>
            {step.description}
          </p>

          {step.details && step.status !== 'pending' && (
            <p className="text-2xs text-text-muted mt-2 font-mono">
              {step.details}
            </p>
          )}

          {step.timestamp && step.status === 'completed' && (
            <p className="text-2xs text-text-muted mt-1">
              {step.timestamp}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
