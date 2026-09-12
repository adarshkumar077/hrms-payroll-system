/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (server.js + minimal node_modules)
  // so the Docker runner stage stays tiny. Does not affect `next dev`.
  output: "standalone",
  reactStrictMode: true,
  // ESLint stays lenient (no eslint config in the repo). TS errors now FAIL the build
  // (GAPS #3) — the codebase type-checks clean; keep it that way.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          // Only takes effect over HTTPS — browsers ignore Strict-Transport-Security on plain HTTP,
          // so this is a no-op for local `next dev` / demo HTTP deploys and only matters behind TLS.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
