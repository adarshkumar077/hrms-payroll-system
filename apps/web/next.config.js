/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.1.69',
    '192.168.80.1',
    '192.168.119.1',
    '172.28.16.1',
    'trycloudflare.com',
    '*.trycloudflare.com',
    'than-structured-expects-genesis.trycloudflare.com',
    'tablets-tee-collected-sword.trycloudflare.com',
    'cfargotunnel.com',
    '*.cfargotunnel.com',
  ],
  async rewrites() {
    const apiInternal = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiInternal}/api/v1/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      { source: '/login', destination: '/', permanent: false },
      { source: '/crm', destination: '/dashboard', permanent: false },
      { source: '/crm/:path*', destination: '/dashboard', permanent: false },
      { source: '/orbit', destination: '/dashboard', permanent: false },
      { source: '/orbit/:path*', destination: '/dashboard', permanent: false },
      { source: '/sso/orbit', destination: '/dashboard', permanent: false },
      { source: '/leads', destination: '/dashboard', permanent: false },
      { source: '/leads/:path*', destination: '/dashboard', permanent: false },
      { source: '/opportunities', destination: '/dashboard', permanent: false },
      { source: '/opportunities/:path*', destination: '/dashboard', permanent: false },
      { source: '/accounts', destination: '/dashboard', permanent: false },
      { source: '/accounts/:path*', destination: '/dashboard', permanent: false },
      { source: '/contacts', destination: '/dashboard', permanent: false },
      { source: '/contacts/:path*', destination: '/dashboard', permanent: false },
      { source: '/quotations', destination: '/dashboard', permanent: false },
      { source: '/quotations/:path*', destination: '/dashboard', permanent: false },
      { source: '/contracts', destination: '/dashboard', permanent: false },
      { source: '/contracts/:path*', destination: '/dashboard', permanent: false },
      { source: '/installed', destination: '/dashboard', permanent: false },
      { source: '/installed/:path*', destination: '/dashboard', permanent: false },
      { source: '/calls', destination: '/dashboard', permanent: false },
      { source: '/messages', destination: '/dashboard', permanent: false },
      { source: '/products', destination: '/dashboard', permanent: false },
      { source: '/activities', destination: '/dashboard', permanent: false },
      { source: '/inventory', destination: '/dashboard', permanent: false },
      { source: '/inventory/:path*', destination: '/dashboard', permanent: false },
      { source: '/finance', destination: '/dashboard', permanent: false },
      { source: '/finance/:path*', destination: '/dashboard', permanent: false },
      { source: '/copilot', destination: '/assistant', permanent: false },
      { source: '/ai', destination: '/assistant', permanent: false },
    ];
  },
};

module.exports = nextConfig;
