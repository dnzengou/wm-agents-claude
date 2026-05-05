/**
 * Client-side user session management.
 * Persists a random UUID so the backend can track preferences + streaks.
 * All functions are safe to call during SSR (return safe defaults when window is unavailable).
 */

const KEY_USER_ID = 'wm_user_id';
const KEY_ONBOARDED = 'wm_onboarded';
const KEY_PREFS = 'wm_prefs';

export type UserPrefs = {
  interests: string[];
  countries: string[];
  tier: 'free' | 'pro' | 'enterprise';
};

const DEFAULT_PREFS: UserPrefs = {
  interests: [],
  countries: [],
  tier: 'free',
};

// ─── User ID ─────────────────────────────────────────────────────────────────

/** Returns a stable UUID for this browser. Creates one on first call. */
export function getUserId(): string {
  if (typeof window === 'undefined') return 'ssr-anonymous';
  let id = localStorage.getItem(KEY_USER_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY_USER_ID, id);
  }
  return id;
}

// ─── Onboarding state ────────────────────────────────────────────────────────

export function isOnboarded(): boolean {
  if (typeof window === 'undefined') return true; // SSR: don't redirect
  return localStorage.getItem(KEY_ONBOARDED) === '1';
}

/** Call after the user completes onboarding. Sets a long-lived cookie for middleware. */
export function markOnboarded(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY_ONBOARDED, '1');
  // Also set a cookie so the Next.js middleware can read it on the server
  document.cookie = 'wm_onboarded=1; path=/; max-age=31536000; SameSite=Lax';
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export function getUserPrefs(): UserPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(KEY_PREFS);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) } as UserPrefs;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveUserPrefs(partial: Partial<UserPrefs>): void {
  if (typeof window === 'undefined') return;
  const current = getUserPrefs();
  localStorage.setItem(KEY_PREFS, JSON.stringify({ ...current, ...partial }));
}
