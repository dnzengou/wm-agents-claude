'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { markOnboarded, saveUserPrefs } from '@/lib/user';

// ─── Types ───────────────────────────────────────────────────────────────────

type Interest = {
  id: string;
  emoji: string;
  label: string;
  description: string;
};

type Region = {
  id: string;
  emoji: string;
  label: string;
};

// ─── Data ────────────────────────────────────────────────────────────────────

const INTERESTS: Interest[] = [
  { id: 'geopolitical', emoji: '🌐', label: 'Geopolitical Risk', description: 'Conflicts, diplomacy, regime changes' },
  { id: 'cyber', emoji: '⚡', label: 'Cyber Threats', description: 'APT groups, zero-days, infrastructure attacks' },
  { id: 'military', emoji: '🛡️', label: 'Military & Naval', description: 'Troop movements, ADS-B, AIS tracking' },
  { id: 'economic', emoji: '📈', label: 'Market Intelligence', description: 'Commodities, sanctions, supply chains' },
  { id: 'disaster', emoji: '🌋', label: 'Natural Disasters', description: 'Seismic events, wildfires, flooding' },
  { id: 'social', emoji: '👥', label: 'Social Unrest', description: 'Protests, strikes, civil tensions' },
];

const REGIONS: Region[] = [
  { id: 'global', emoji: '🌍', label: 'Global' },
  { id: 'middle-east', emoji: '🕌', label: 'Middle East' },
  { id: 'east-asia', emoji: '🏯', label: 'East Asia' },
  { id: 'europe', emoji: '🗼', label: 'Europe' },
  { id: 'americas', emoji: '🗽', label: 'Americas' },
  { id: 'africa', emoji: '🌍', label: 'Africa' },
  { id: 'south-asia', emoji: '🏔️', label: 'South & Central Asia' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full transition-all duration-500',
            i < step ? 'bg-neon' : i === step ? 'bg-neon/40' : 'bg-border-default',
          )}
        />
      ))}
    </div>
  );
}

function SelectCard({
  selected,
  onClick,
  emoji,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  emoji: string;
  label: string;
  description?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'glass-panel rounded-lg p-4 text-left transition-all duration-200 border-2',
        'hover:border-neon/40 hover:shadow-neon-sm',
        selected
          ? 'border-neon bg-neon/5 shadow-neon-sm'
          : 'border-border-default',
      )}
    >
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-sm font-semibold text-text-primary">{label}</div>
      {description && (
        <div className="text-xs text-text-muted mt-1 leading-relaxed">{description}</div>
      )}
    </button>
  );
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center max-w-lg mx-auto animate-fade-in-up">
      {/* Logo */}
      <div className="w-20 h-20 rounded-2xl bg-neon/10 border border-neon/30 flex items-center justify-center mb-8 animate-pulse-neon">
        <svg className="w-10 h-10 text-neon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neon/10 border border-neon/30 text-neon text-xs font-medium tracking-widest uppercase mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse-fast" />
        Live Intelligence Platform
      </div>

      <h1 className="text-4xl font-bold text-text-primary mb-4 leading-tight">
        Real-time global intelligence,
        <br />
        <span className="text-neon">personalized to you.</span>
      </h1>

      <p className="text-base text-text-tertiary mb-10 max-w-sm leading-relaxed">
        WorldMonitor fuses 150+ data sources — GDELT, RSS, ADS-B, AIS — into a
        single, actionable dashboard. Free to start. No credit card needed.
      </p>

      {/* Value props */}
      <div className="grid grid-cols-3 gap-4 w-full mb-10">
        {[
          { label: '150+', sub: 'Data sources' },
          { label: '<1s', sub: 'Load time' },
          { label: '24h', sub: 'Event horizon' },
        ].map(({ label, sub }) => (
          <div key={sub} className="glass-panel rounded-lg p-3 text-center">
            <div className="text-xl font-bold text-neon">{label}</div>
            <div className="text-2xs text-text-muted uppercase tracking-wider mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full max-w-xs px-8 py-3.5 rounded-lg bg-neon text-obsidian font-semibold text-base
          hover:opacity-90 active:scale-95 transition-all duration-150 shadow-neon"
      >
        Get Started →
      </button>

      <p className="text-xs text-text-disabled mt-4">
        No account required. Your data stays local.
      </p>
    </div>
  );
}

function StepInterests({
  selected,
  onToggle,
  onNext,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto w-full animate-fade-in-up">
      <h2 className="text-2xl font-bold text-text-primary mb-2">
        What are you monitoring?
      </h2>
      <p className="text-sm text-text-tertiary mb-8">
        Select all that apply. We'll prioritize your feed accordingly.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {INTERESTS.map(i => (
          <SelectCard
            key={i.id}
            selected={selected.has(i.id)}
            onClick={() => onToggle(i.id)}
            emoji={i.emoji}
            label={i.label}
            description={i.description}
          />
        ))}
      </div>

      <button
        disabled={selected.size === 0}
        onClick={onNext}
        className={cn(
          'w-full py-3 rounded-lg font-semibold text-sm transition-all duration-150',
          selected.size > 0
            ? 'bg-neon text-obsidian hover:opacity-90 active:scale-95 shadow-neon'
            : 'bg-surface text-text-disabled cursor-not-allowed',
        )}
      >
        {selected.size === 0 ? 'Select at least one topic' : `Continue with ${selected.size} topic${selected.size > 1 ? 's' : ''} →`}
      </button>
    </div>
  );
}

function StepRegions({
  selected,
  onToggle,
  onNext,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto w-full animate-fade-in-up">
      <h2 className="text-2xl font-bold text-text-primary mb-2">
        Which regions matter most?
      </h2>
      <p className="text-sm text-text-tertiary mb-8">
        Pick the areas you track most closely. You can change this anytime.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
        {REGIONS.map(r => (
          <SelectCard
            key={r.id}
            selected={selected.has(r.id)}
            onClick={() => onToggle(r.id)}
            emoji={r.emoji}
            label={r.label}
          />
        ))}
      </div>

      <button
        disabled={selected.size === 0}
        onClick={onNext}
        className={cn(
          'w-full py-3 rounded-lg font-semibold text-sm transition-all duration-150',
          selected.size > 0
            ? 'bg-neon text-obsidian hover:opacity-90 active:scale-95 shadow-neon'
            : 'bg-surface text-text-disabled cursor-not-allowed',
        )}
      >
        {selected.size === 0 ? 'Select at least one region' : `Set up my dashboard →`}
      </button>
    </div>
  );
}

function StepActivate({
  interests,
  regions,
  onLaunch,
}: {
  interests: Set<string>;
  regions: Set<string>;
  onLaunch: () => void;
}) {
  const interestLabels = INTERESTS.filter(i => interests.has(i.id)).map(i => i.label);
  const regionLabels = REGIONS.filter(r => regions.has(r.id)).map(r => r.label);

  return (
    <div className="max-w-lg mx-auto w-full text-center animate-fade-in-up">
      {/* Check icon */}
      <div className="w-16 h-16 rounded-full bg-success/10 border border-success/30 flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-text-primary mb-2">
        Your dashboard is ready.
      </h2>
      <p className="text-sm text-text-tertiary mb-8">
        We've personalized your intelligence feed based on your selections.
      </p>

      {/* Summary */}
      <div className="glass-panel rounded-xl p-5 text-left mb-8 space-y-4">
        <div>
          <div className="text-2xs text-text-muted uppercase tracking-widest mb-2">Monitoring</div>
          <div className="flex flex-wrap gap-1.5">
            {interestLabels.map(l => (
              <span key={l} className="px-2 py-0.5 rounded-full bg-neon/10 border border-neon/20 text-neon text-xs">
                {l}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-2xs text-text-muted uppercase tracking-widest mb-2">Regions</div>
          <div className="flex flex-wrap gap-1.5">
            {regionLabels.map(l => (
              <span key={l} className="px-2 py-0.5 rounded-full bg-surface border border-border-default text-text-secondary text-xs">
                {l}
              </span>
            ))}
          </div>
        </div>
        <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
          <span className="text-xs text-text-muted">Plan</span>
          <span className="text-xs font-semibold text-success">Free — No card required</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onLaunch}
        className="w-full py-3.5 rounded-lg bg-neon text-obsidian font-bold text-sm
          hover:opacity-90 active:scale-95 transition-all duration-150 shadow-neon mb-4"
      >
        Launch Dashboard →
      </button>

      {/* Upgrade hint */}
      <p className="text-xs text-text-disabled">
        <span className="text-text-muted">Want real-time alerts & 90-day history?</span>{' '}
        <a href="#" className="text-neon hover:underline" onClick={e => e.preventDefault()}>
          Upgrade to Pro — $29/mo
        </a>
      </p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const TOTAL_STEPS = 3; // Interests, Regions, Activate (Welcome is step 0)

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [regions, setRegions] = useState<Set<string>>(new Set(['global']));

  const toggleSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  const handleLaunch = () => {
    saveUserPrefs({
      interests: [...interests],
      countries: [...regions],
      tier: 'free',
    });
    markOnboarded();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-obsidian bg-grid flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-neon/20 border border-neon/30 flex items-center justify-center">
            <span className="text-neon text-xs font-bold">W</span>
          </div>
          <span className="text-text-secondary text-sm font-medium">WorldMonitor</span>
        </div>
        {step > 0 && (
          <div className="w-40">
            <ProgressBar step={step} total={TOTAL_STEPS} />
          </div>
        )}
        {step > 0 && step < TOTAL_STEPS && (
          <button
            onClick={handleLaunch}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Skip setup
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
        {step === 1 && (
          <StepInterests
            selected={interests}
            onToggle={id => setInterests(prev => toggleSet(prev, id))}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <StepRegions
            selected={regions}
            onToggle={id => setRegions(prev => toggleSet(prev, id))}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepActivate interests={interests} regions={regions} onLaunch={handleLaunch} />
        )}
      </div>
    </div>
  );
}
