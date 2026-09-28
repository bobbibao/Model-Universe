import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/shared/server/utils/JwtUtils';

// Page-level guard for navigation only; the Express API enforces authorization on every data request.
const ACCOUNT_PATHS = ['/user-profile', '/order-history', '/wishlist', '/thank-you'];
const GUEST_ONLY_PATHS = ['/auth/signin', '/auth/signup'];

const matchesPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  const isAdminPath = matchesPath(pathname, '/admin');
  const requiresLogin = isAdminPath || ACCOUNT_PATHS.some((path) => matchesPath(pathname, path));

  if (requiresLogin && !session) {
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }
  if (isAdminPath && session?.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  if (session && GUEST_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL(session.role === 'ADMIN' ? '/admin/dashboard' : '/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/user-profile/:path*',
    '/order-history/:path*',
    '/wishlist/:path*',
    '/thank-you/:path*',
    '/auth/signin',
    '/auth/signup',
  ],
};
