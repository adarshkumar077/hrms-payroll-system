/** @type {import('next').NextConfig} */
const nextConfig = {
  // Served only via HRMS rewrite on :3000 → internal :3010
  basePath: '/orbit',
  output: 'standalone',
  reactStrictMode: true,
  // Monorepo may hoist React 19 types from @eitf/web while Orbit is Next 14.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
