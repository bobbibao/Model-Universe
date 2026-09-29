/** @type {import('next').NextConfig} */
const nextConfig = {
    distDir: 'dist/.next',
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
            { source: '/admin/ci', destination: '/admin/ci/improvements', permanent: false },
            // Links in the CI agent's notifications (Telegram, email) point at /ci/improvements/<id>.
            { source: '/ci/improvements/:id', destination: '/admin/ci/improvements/:id', permanent: false },
        ];
    },
};

export default nextConfig;
