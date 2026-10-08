import createMiddleware from 'next-intl/middleware';
import { locales, withoutLocale } from '@/i18n/config';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/shared/server/utils/JwtUtils';

// Page-level guard for navigation only; the Express API enforces authorization on every data request.
const localize = createMiddleware({ locales, defaultLocale: 'vi', localePrefix: 'always', localeDetection: false });
const ACCOUNT_PATHS = ['/user-profile', '/order-history', '/wishlist', '/thank-you', '/account', '/partner'];
const GUEST_ONLY_PATHS = ['/auth/signin', '/auth/signup'];

const matchesPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export async function middleware(request: NextRequest) {
  const { search } = request.nextUrl;
  const pathname = withoutLocale(request.nextUrl.pathname);
  const locale = request.nextUrl.pathname.split('/')[1] === 'en' ? 'en' : 'vi';
  const session = await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  const isAdminPath = matchesPath(pathname, '/admin');
  const requiresLogin = isAdminPath || ACCOUNT_PATHS.some((path) => matchesPath(pathname, path));

  if (requiresLogin && !session) {
    const signInUrl = new URL(`/${locale}/auth/signin`, request.url);
    signInUrl.searchParams.set('redirect', `${request.nextUrl.pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }
  if (isAdminPath && session?.role !== 'ADMIN') {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }
  if (session && GUEST_ONLY_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL(`/${locale}${session.role === 'ADMIN' ? '/admin/dashboard' : ''}`, request.url));
  }
  return localize(request);
}

export const config = { matcher: ['/((?!api|uploads|images|fonts|_next|.*\\..*).*)'] };
