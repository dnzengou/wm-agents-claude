'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createGuestSession } from '@/lib/auth';

// ─── Social button ────────────────────────────────────────────────────────────

function SocialButton({
  icon, label, onClick, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border-default bg-surface hover:bg-surface/80 hover:border-neon/30 transition-all duration-150 text-sm text-text-primary font-medium disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <span className="w-5 h-5 flex-shrink-0">{icon}</span>
      <span>{label}</span>
      {disabled && (
        <span className="ml-auto text-2xs text-text-disabled font-mono">COMING SOON</span>
      )}
    </button>
  );
}

// ─── Main LoginPage ───────────────────────────────────────────────────────────

export function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleGuest() {
    setLoading(true);
    createGuestSession();
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] bg-alert/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">

        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neon/10 border border-neon/20 mb-4">
            <svg className="w-8 h-8 text-neon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
              <line x1="12" y1="3" x2="12" y2="6" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="18" x2="12" y2="21" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="3" y1="12" x2="6" y2="12" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="18" y1="12" x2="21" y2="12" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">WorldMonitor Agents</h1>
          <p className="text-xs text-text-muted mt-1 font-mono">Multi-Domain Intelligence Platform</p>
        </div>

        {/* Panel */}
        <div className="glass-panel rounded-xl p-6 space-y-4">
          <div className="space-y-1 mb-2">
            <h2 className="text-sm font-semibold text-text-primary">Sign in to continue</h2>
            <p className="text-xs text-text-muted">Choose your sign-in method to access the live intelligence dashboard.</p>
          </div>

          {/* Social logins (placeholder) */}
          <div className="space-y-2">
            <SocialButton
              disabled
              label="Continue with Google"
              onClick={() => {}}
              icon={
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              }
            />
            <SocialButton
              disabled
              label="Continue with GitHub"
              onClick={() => {}}
              icon={
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-text-primary" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
              }
            />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-2xs text-text-disabled font-mono uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          {/* Guest login */}
          <button
            onClick={handleGuest}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-neon/10 border border-neon/30 hover:bg-neon/20 hover:border-neon/50 transition-all duration-150 text-sm font-semibold text-neon disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-neon border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
            {loading ? 'Entering…' : 'Continue as Guest'}
          </button>

          <p className="text-2xs text-text-disabled text-center leading-relaxed">
            Guest mode has limited access. No account required — sessions are local-only.
            Sign-in with Google or GitHub unlocks full history, alerts, and API access.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-2xs text-text-disabled mt-6 font-mono">
          WorldMonitor Agents · Open Intelligence · v2.7
        </p>
      </div>
    </div>
  );
}
