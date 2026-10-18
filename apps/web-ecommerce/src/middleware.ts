import createMiddleware from 'next-intl/middleware';
import { locales, withoutLocale } from '@/i18n/config';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/shared/server/utils/JwtUtils';

// Page-level guard for navigation only; the Express API enforces authorization on every data request.
const localize = createMiddleware({ locales, defaultLocale: 'vi', localePrefix: 'always', localeDetection: false });
const ACCOUNT_PATHS = ['/user-profile', '/order-history', '/wishlist', '/thank-you', '/account', '/partner'];
const GUEST_ONLY_PATHS = ['/auth/signin', '/auth/signup'];

const matchesPath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

// Older product links (/shop/product/<id>) move permanently to the SEO path (/san-pham/<slug>): a real 308 for search
// engines, resolved through the public product endpoint.
const LEGACY_PRODUCT = /^\/(vi|en)\/shop\/product\/(\d+)\/?$/;
async function legacyProductRedirect(request: NextRequest) {
  const match = LEGACY_PRODUCT.exec(request.nextUrl.pathname);
  if (!match) return null;
  try {
    const port = Number(process.env.PORT || 6050);
    const response = await fetch(`http://127.0.0.1:${port}/api/products/${match[2]}`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const product = (await response.json()) as { slug?: string };
    if (!product.slug) return null;
    return NextResponse.redirect(new URL(`/${match[1]}/san-pham/${product.slug}${request.nextUrl.search}`, request.url), 308);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const legacy = await legacyProductRedirect(request);
  if (legacy) return legacy;
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
