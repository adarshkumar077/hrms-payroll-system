/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    const apiInternal = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiInternal}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
