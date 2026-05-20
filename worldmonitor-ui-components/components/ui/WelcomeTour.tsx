'use client';

import React, { useEffect, useState } from 'react';

const TOUR_KEY = 'wm_tour_v1_done';

type Step = {
  title: string;
  body: string;
  icon: string;
  hint?: string;
};

const STEPS: Step[] = [
  {
    icon: '🛰️',
    title: 'Live Intelligence Feed',
    body: 'The left panel streams real-time events from GDELT, NASA EONET, HackerNews, and 30+ RSS sources — ranked by severity. Click any card to fly the map to that location.',
    hint: 'Events with severity ≥ 8 are gated behind Pro access.',
  },
  {
    icon: '🗺️',
    title: 'Geospatial Map',
    body: 'Every event is geocoded and plotted. Circle size = severity. Use the domain filter pills at the bottom to isolate a threat category. Click a marker for full details and source link.',
    hint: 'CartoDB Dark Matter tiles — free, no API key required.',
  },
  {
    icon: '🤖',
    title: 'Agent Status & Reasoning',
    body: 'Four AI agents run continuously: AG01 (GDELT), AG02 (RSS/HN), AG03 (AI Brief via Groq LLaMA-3), AG04 (NASA EONET). The Reasoning Trace panel shows step-by-step CoT for the top-severity country.',
    hint: 'AG03 generates a fresh brief whenever the top country changes.',
  },
  {
    icon: '⌨️',
    title: 'Power Features',
    body: 'Press ⌘K (or Ctrl+K) to open the Command Palette for quick actions. Use the search bar to filter events by keyword, country, or domain. Layer toggles control which threat categories appear on the map.',
    hint: 'Guest sessions are local-only. Sign in with Google or GitHub for alerts and 90-day history.',
  },
];

export function WelcomeTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep]       = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) setVisible(true);
    } catch { /* SSR or storage blocked */ }
  }, []);

  function dismiss() {
    try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* */ }
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    /* full-screen backdrop */
    <div
      className="fixed inset-0 z-[9000] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      <div className="w-full max-w-sm glass-panel rounded-2xl p-6 relative animate-fade-in-up">

        {/* Skip */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-text-disabled hover:text-text-muted transition-colors text-lg leading-none"
          aria-label="Skip tour"
        >
          ×
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 bg-neon'
                  : i < step
                  ? 'w-3 bg-neon/40'
                  : 'w-3 bg-border-default'
              }`}
            />
          ))}
        </div>

        {/* Icon + title */}
        <div className="flex items-start gap-4 mb-4">
          <div className="text-3xl flex-shrink-0 mt-0.5">{current.icon}</div>
          <div>
            <h3 className="text-base font-bold text-text-primary leading-tight">
              {current.title}
            </h3>
            <p className="text-sm text-text-muted leading-relaxed mt-2">{current.body}</p>
          </div>
        </div>

        {/* Hint pill */}
        {current.hint && (
          <div className="flex items-start gap-2 bg-neon/5 border border-neon/15 rounded-lg px-3 py-2 mb-5">
            <span className="text-neon text-xs mt-0.5 flex-shrink-0">💡</span>
            <p className="text-2xs text-text-muted font-mono leading-relaxed">{current.hint}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-xs text-text-disabled hover:text-text-muted transition-colors disabled:opacity-0"
          >
            ← Back
          </button>

          <span className="text-2xs font-mono text-text-disabled">
            {step + 1} / {STEPS.length}
          </span>

          {isLast ? (
            <button
              onClick={dismiss}
              className="px-4 py-1.5 rounded-lg bg-neon/15 border border-neon/40 text-neon text-xs font-semibold hover:bg-neon/25 transition-all"
            >
              Get Started →
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-4 py-1.5 rounded-lg bg-surface border border-border-default text-text-primary text-xs font-semibold hover:border-neon/30 transition-all"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
