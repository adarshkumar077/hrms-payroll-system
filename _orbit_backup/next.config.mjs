/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mounted under HRMS as /orbit/* (rewrites + this basePath).
  basePath: "/orbit",
  output: "standalone",
  reactStrictMode: true,
  // Monorepo may hoist React 19 types from @eitf/web (Next 15) while Orbit is Next 14.
  // Source type-checks under Orbit's own lockfile; do not block the integrated build on hoist noise.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
