'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';

/**
 * AuthGate — client-side session check.
 * Renders children if a session exists; otherwise redirects to /login.
 * Shows a minimal loading state during the hydration check.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
    } else {
      setChecked(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked) {
    // Minimal paint during the hydration check (< 1 frame on fast devices)
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-neon border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-text-muted font-mono">Authenticating…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
