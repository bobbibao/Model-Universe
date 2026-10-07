/** @type {import('next').NextConfig} */
const nextConfig = {
    // Keep Turbopack's dev artifacts separate from Webpack and production builds.
    distDir: process.env.NODE_ENV === 'development' && process.env.TURBOPACK ? 'dist/.next-turbo' : 'dist/.next',
    // Webpack fallback: retain visited routes during long admin/Agent dev sessions.
    onDemandEntries: {
        maxInactiveAge: 30 * 60 * 1000,
        pagesBufferLength: 64,
    },
    images: {
        // Product photos from the seed catalog; uploaded photos are served by the Express server under /uploads.
        remotePatterns: [{ protocol: 'https', hostname: 'images.asos-media.com' }],
    },
    async redirects() {
        return [
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

export default nextConfig;
