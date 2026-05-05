import { NextRequest, NextResponse } from 'next/server';

/**
 * Redirect first-time visitors to onboarding.
 * Cookie `wm_onboarded` is set by `markOnboarded()` in lib/user.ts after onboarding completes.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate the root dashboard; let /onboarding and /api pass through
  if (pathname === '/') {
    const cookie = request.cookies.get('wm_onboarded');
    if (!cookie) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run only on the root path; exclude Next.js internals and static files
  matcher: ['/((?!_next|api|favicon|onboarding).*)'],
};
