'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export interface ReasoningStep {
  id: string;
  order: number;
  description: string;
  confidence: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  timestamp?: number;
  details?: string;
}

export interface AIInsight {
  id: string;
  title: string;
  conclusion: string;
  overallConfidence: number;
  steps: ReasoningStep[];
  sources: string[];
  generatedAt: number;
  category: 'threat' | 'trend' | 'anomaly' | 'prediction';
}

export interface AIInsightsPanelProps {
  insight: AIInsight;
  onExport?: () => void;
  onShare?: () => void;
  onDeepDive?: () => void;
  className?: string;
}

const categoryIcons: Record<AIInsight['category'], React.ReactNode> = {
  threat: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  trend: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  anomaly: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  prediction: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
};

const categoryColors: Record<AIInsight['category'], string> = {
  threat: 'text-accent-red border-accent-red/30 bg-accent-red/10',
  trend: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10',
  anomaly: 'text-accent-amber border-accent-amber/30 bg-accent-amber/10',
  prediction: 'text-accent-purple border-accent-purple/30 bg-accent-purple/10',
};

export function AIInsightsPanel({
  insight,
  onExport,
  onShare,
  onDeepDive,
  className,
}: AIInsightsPanelProps) {
  const [showChainOfThought, setShowChainOfThought] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const completedSteps = insight.steps.filter(s => s.status === 'completed').length;
  const progress = (completedSteps / insight.steps.length) * 100;

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle bg-bg-tertiary">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center border',
              categoryColors[insight.category]
            )}>
              {categoryIcons[insight.category]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{insight.title}</h3>
                <Badge 
                  variant={insight.overallConfidence >= 90 ? 'green' : 
                          insight.overallConfidence >= 70 ? 'cyan' : 
                          insight.overallConfidence >= 50 ? 'medium' : 'critical'}
                >
                  {insight.overallConfidence}% confidence
                </Badge>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Generated {new Date(insight.generatedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onExport} leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            }>
              Export
            </Button>
            <Button variant="ghost" size="sm" onClick={onShare} leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            }>
              Share
            </Button>
          </div>
        </div>
      </div>

      {/* Chain of Thought */}
      <div className="border-b border-border-subtle">
        <button
          onClick={() => setShowChainOfThought(!showChainOfThought)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-bg-tertiary/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-accent-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-sm font-medium text-text-primary">Chain of Thought</span>
            <span className="text-xs text-text-tertiary">({completedSteps}/{insight.steps.length} steps)</span>
          </div>
          <svg 
            className={cn(
              'w-4 h-4 text-text-tertiary transition-transform duration-fast',
              showChainOfThought && 'rotate-180'
            )} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showChainOfThought && (
          <div className="px-4 pb-4">
            {/* Progress Bar */}
            <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden mb-4">
              <div 
                className="h-full bg-gradient-to-r from-accent-purple to-accent-cyan transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Steps */}
            <div className="space-y-2">
              {insight.steps.map((step, index) => (
                <ReasoningStepItem
                  key={step.id}
                  step={step}
                  index={index}
                  isLast={index === insight.steps.length - 1}
                  isExpanded={expandedSteps.has(step.id)}
                  onToggle={() => toggleStep(step.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Conclusion */}
      <div className="p-4">
        <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
          Conclusion
        </h4>
        <p className="text-sm text-text-primary leading-relaxed">
          {insight.conclusion}
        </p>

        {/* Sources */}
        {insight.sources.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
              Sources
            </h4>
            <div className="flex flex-wrap gap-2">
              {insight.sources.map((source, i) => (
                <span 
                  key={i}
                  className="px-2 py-1 text-xs bg-bg-tertiary border border-border-default rounded text-text-secondary"
                >
                  {source}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border-subtle">
          <Button variant="primary" size="sm" onClick={onDeepDive} leftIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          }>
            Deep Dive
          </Button>
          <Button variant="secondary" size="sm" leftIcon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }>
            Set Alert
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface ReasoningStepItemProps {
  step: ReasoningStep;
  index: number;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function ReasoningStepItem({ step, index, isLast, isExpanded, onToggle }: ReasoningStepItemProps) {
  const statusIcons = {
    pending: (
      <div className="w-5 h-5 rounded-full border-2 border-text-tertiary" />
    ),
    processing: (
      <div className="w-5 h-5 rounded-full border-2 border-accent-cyan border-t-transparent animate-spin" />
    ),
    completed: (
      <div className="w-5 h-5 rounded-full bg-accent-green/20 border border-accent-green flex items-center justify-center">
        <svg className="w-3 h-3 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    ),
    error: (
      <div className="w-5 h-5 rounded-full bg-accent-red/20 border border-accent-red flex items-center justify-center">
        <svg className="w-3 h-3 text-accent-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    ),
  };

  return (
    <div className="relative">
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-2.5 top-6 w-px h-[calc(100%+8px)] bg-border-default" />
      )}

      <div 
        className={cn(
          'flex items-start gap-3 p-2 rounded-md transition-colors cursor-pointer',
          step.status === 'processing' && 'bg-accent-cyan/5',
          step.status === 'completed' && 'hover:bg-bg-tertiary/50'
        )}
        onClick={onToggle}
      >
        {/* Status Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {statusIcons[step.status]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className={cn(
              'text-sm',
              step.status === 'completed' ? 'text-text-primary' : 'text-text-secondary'
            )}>
              {step.description}
            </span>
            {step.confidence > 0 && (
              <span className={cn(
                'text-xs font-mono ml-2',
                step.confidence >= 90 ? 'text-accent-green' :
                step.confidence >= 70 ? 'text-accent-cyan' :
                step.confidence >= 50 ? 'text-accent-amber' : 'text-accent-red'
              )}>
                {step.confidence}%
              </span>
            )}
          </div>

          {/* Expanded Details */}
          {isExpanded && step.details && (
            <div className="mt-2 p-2 bg-bg-tertiary rounded border border-border-subtle">
              <p className="text-xs text-text-secondary">{step.details}</p>
            </div>
          )}

          {/* Timestamp */}
          {step.timestamp && (
            <p className="text-2xs text-text-tertiary mt-1">
              {new Date(step.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Expand Icon */}
        {step.details && (
          <svg 
            className={cn(
              'w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform',
              isExpanded && 'rotate-180'
            )} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
    </div>
  );
}
