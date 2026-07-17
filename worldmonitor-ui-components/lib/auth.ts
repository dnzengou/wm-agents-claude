/**
 * Auth utilities — localStorage-based guest session.
 * DB-backed OAuth (Google / GitHub) will replace this later.
 */

export type UserSession = {
  id: string;
  mode: 'guest' | 'user';
  name: string;
  email?: string;
  createdAt: number;
};

const SESSION_KEY = 'wm_session';

/** Generate a short random ID (not cryptographically strong — placeholder) */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Read the current session from localStorage (SSR-safe). */
export function getSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

/** Create a guest session and persist it. */
export function createGuestSession(): UserSession {
  const session: UserSession = {
    id: uuid(),
    mode: 'guest',
    name: 'Guest Analyst',
    createdAt: Date.now(),
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  return session;
}

/** Destroy the current session. */
export function clearSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

/** Returns true if the user is authenticated (guest or signed-in). */
export function isAuthenticated(): boolean {
  return getSession() !== null;
}
