/** @type {import('next').NextConfig} */
const nextConfig = {
  // The browser calls /api on the frontend's own origin and Next forwards it to the backend,
  // so only port 3000 needs to be reachable and CORS doesn't apply.
  // Set NEXT_PUBLIC_API_URL instead to have the browser call the backend directly (e.g. Docker).
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/:path*`
      }
    ];
  },
  experimental: {
    // AI tailoring and cover letters can take longer than the 30s default
    proxyTimeout: 120_000
  }
};

module.exports = nextConfig;
