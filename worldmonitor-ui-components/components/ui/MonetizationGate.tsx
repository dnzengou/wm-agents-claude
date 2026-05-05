'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface MonetizationGateProps {
  children: React.ReactNode;
  requiredTier: SubscriptionTier;
  userTier: SubscriptionTier;
  title?: string;
  description?: string;
  upgradeText?: string;
  onUpgrade?: () => void;
  className?: string;
  blurAmount?: 'sm' | 'md' | 'lg';
}

const tierHierarchy: Record<SubscriptionTier, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

const tierLabels: Record<SubscriptionTier, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export function MonetizationGate({
  children,
  requiredTier,
  userTier,
  title = 'Access Restricted',
  description,
  upgradeText = 'Upgrade to Unlock',
  onUpgrade,
  className,
  blurAmount = 'md',
}: MonetizationGateProps) {
  const isLocked = tierHierarchy[userTier] < tierHierarchy[requiredTier];

  const blurClasses = {
    sm: 'blur-sm',
    md: 'blur-md',
    lg: 'blur-lg',
  };

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative', className)}>
      {/* Blurred Content */}
      <div className={cn(blurClasses[blurAmount], 'select-none pointer-events-none')}>
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="glass-panel rounded-xl p-6 max-w-xs text-center mx-4">
          {/* Lock Icon */}
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-neon/10 border border-neon/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-neon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          {/* Title */}
          <h4 className="text-sm font-semibold text-text-primary mb-2">
            {title}
          </h4>

          {/* Description */}
          <p className="text-xs text-text-secondary mb-4">
            {description || `This feature requires ${tierLabels[requiredTier]} access. Upgrade your plan to unlock.`}
          </p>

          {/* Required Tier Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neon/10 border border-neon/30 rounded-md mb-4">
            <span className="text-2xs text-neon uppercase tracking-wider font-semibold">
              {tierLabels[requiredTier]} Required
            </span>
          </div>

          {/* Upgrade Button */}
          <Button
            variant="primary"
            size="sm"
            onClick={onUpgrade}
            className="w-full"
            leftIcon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            }
          >
            {upgradeText}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Simplified inline gate for text/content blur
export interface InlineGateProps {
  children: React.ReactNode;
  requiredTier: SubscriptionTier;
  userTier: SubscriptionTier;
  placeholder?: string;
  className?: string;
}

export function InlineGate({
  children,
  requiredTier,
  userTier,
  placeholder = '••••••••••••',
  className,
}: InlineGateProps) {
  const isLocked = tierHierarchy[userTier] < tierHierarchy[requiredTier];

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <span className={cn('relative inline-block', className)}>
      <span className="blur-sm select-none">{children}</span>
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="text-text-muted font-mono">{placeholder}</span>
      </span>
    </span>
  );
}

// Gate banner for larger sections
export interface GateBannerProps {
  title: string;
  description: string;
  requiredTier: SubscriptionTier;
  features: string[];
  onUpgrade: () => void;
  className?: string;
}

export function GateBanner({
  title,
  description,
  requiredTier,
  features,
  onUpgrade,
  className,
}: GateBannerProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-alert/30 bg-gradient-to-br from-alert/10 to-obsidian p-6',
        className
      )}
    >
      {/* Alert Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-alert/20 rounded-full blur-3xl" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-alert/20 border border-alert/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-alert" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
            <span className="text-2xs text-alert uppercase tracking-wider font-semibold">
              {tierLabels[requiredTier]} Feature
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-text-secondary mb-4">{description}</p>

        {/* Features List */}
        <ul className="space-y-2 mb-4">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-text-secondary">
              <svg className="w-4 h-4 text-neon flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {feature}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Button variant="primary" size="sm" onClick={onUpgrade} className="w-full">
          Upgrade to {tierLabels[requiredTier]}
        </Button>
      </div>
    </div>
  );
}
