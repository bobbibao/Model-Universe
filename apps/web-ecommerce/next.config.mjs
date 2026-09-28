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
        ];
    },
};

export default nextConfig;
