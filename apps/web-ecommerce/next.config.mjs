import createNextIntlPlugin from 'next-intl/plugin';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
// The monorepo checkout and the app-only Docker context have different roots.
const workspaceRoot = fileURLToPath(new URL(existsSync(new URL('../../apps/web-ecommerce/package.json', import.meta.url)) ? '../..' : '.', import.meta.url));
// A second local browser-test process must not overwrite the active preview's compilation cache.
const isolatedBuildDir = process.env.NEXT_DIST_DIR;
if (isolatedBuildDir && !/^dist\/\.next-[a-z0-9-]+$/.test(isolatedBuildDir)) {
    throw new Error('NEXT_DIST_DIR must be a named .next directory inside dist/.');
}
/** @type {import('next').NextConfig} */
const nextConfig = {
    // Keep Turbopack's dev artifacts separate from Webpack and production builds.
    distDir: isolatedBuildDir || (process.env.NODE_ENV === 'development' && process.env.TURBOPACK ? 'dist/.next-turbo' : 'dist/.next'),
    turbopack: { root: workspaceRoot },
    outputFileTracingRoot: workspaceRoot,
    // Webpack fallback: retain visited routes during long admin/Agent dev sessions.
    onDemandEntries: {
        maxInactiveAge: 30 * 60 * 1000,
        pagesBufferLength: 64,
    },
    images: {
        // Retained historical photos may still reference the previous CDN; the new catalog is self-hosted.
        remotePatterns: [{ protocol: 'https', hostname: 'images.asos-media.com' }],
    },
    async redirects() {
        return [
            { source: '/:locale(vi|en)/admin', destination: '/:locale/admin/dashboard', permanent: false },
            { source: '/:locale(vi|en)/admin/agent', destination: '/:locale/admin/agent/inbox', permanent: false },
            { source: '/:locale(vi|en)/login', destination: '/:locale/auth/signin', permanent: false },
            { source: '/:locale(vi|en)/register', destination: '/:locale/auth/signup', permanent: false },
            { source: '/admin', destination: '/admin/dashboard', permanent: false },
            { source: '/login', destination: '/auth/signin', permanent: false },
            { source: '/register', destination: '/auth/signup', permanent: false },
            { source: '/about-us', destination: '/about', permanent: false },
            { source: '/admin/agent', destination: '/admin/agent/inbox', permanent: false },
            // The v1 console moved to /admin/agent (v1 improvement ids do not exist in v2).
            { source: '/admin/ci/tasks', destination: '/admin/agent/tasks', permanent: true },
            { source: '/admin/ci/impact', destination: '/admin/agent/impact', permanent: true },
            { source: '/admin/ci/cases', destination: '/admin/agent/knowledge', permanent: true },
            { source: '/admin/ci/:path*', destination: '/admin/agent/inbox', permanent: true },
            { source: '/admin/ci', destination: '/admin/agent/inbox', permanent: true },
            { source: '/ci/improvements/:id', destination: '/admin/agent/inbox', permanent: true },
        ];
    },
};

export default withNextIntl(nextConfig);
