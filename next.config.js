/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Ignore TypeScript errors during build (for deployment)
  typescript: {
    ignoreBuildErrors: true,
  },

  // ── Images ───────────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // ── Compiler ─────────────────────────────────────────────────────────────
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // ── General ──────────────────────────────────────────────────────────────
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  // ── Experimental ─────────────────────────────────────────────────────────
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-switch',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      'recharts',
      'date-fns',
      'sonner',
    ],
    // Faster server components rendering
    ppr: false,
    // Optimize CSS - reduces unused CSS shipped to client
    optimizeCss: true,
    // Scroll restoration works better with bfcache
    scrollRestoration: true,
  },

  // ── Turbopack: silence "webpack config but no turbopack config" warning ──
  turbopack: {},

  // ── Webpack: aggressive bundle splitting ──────────────────────────────────
  webpack(config, { isServer }) {
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          minSize: 20000,
          maxSize: 244000,
          cacheGroups: {
            // Framework chunk: React + Next
            framework: {
              name: 'framework',
              test: /[\\/]node_modules[\\/](react|react-dom|next|scheduler)[\\/]/,
              priority: 50,
              chunks: 'all',
              enforce: true,
            },
            // UI chunk: Radix + lucide (tree-shakeable but large combined)
            ui: {
              name: 'ui-vendor',
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|class-variance-authority|tailwind-merge|clsx)[\\/]/,
              priority: 40,
              chunks: 'all',
              enforce: true,
            },
            // Heavy animation lib — deferred until needed
            framerMotion: {
              name: 'framer-motion',
              test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
              priority: 35,
              chunks: 'async', // load only when imported dynamically
            },
            // Charts — only on analytics/reports pages
            charts: {
              name: 'recharts',
              test: /[\\/]node_modules[\\/](recharts|d3-|victory-)[\\/]/,
              priority: 30,
              chunks: 'async',
            },
            // AI SDK — only on chat routes
            aiSdk: {
              name: 'ai-sdk',
              test: /[\\/]node_modules[\\/](@ai-sdk|ai|openai)[\\/]/,
              priority: 30,
              chunks: 'async',
            },
            // Convex realtime client
            convex: {
              name: 'convex',
              test: /[\\/]node_modules[\\/]convex[\\/]/,
              priority: 25,
              chunks: 'all',
            },
            // General vendor fallback
            vendors: {
              name: 'vendors',
              test: /[\\/]node_modules[\\/]/,
              priority: 10,
              chunks: 'all',
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },

  // ── Bundle analyzer (only in ANALYZE mode) ────────────────────────────────
  ...(process.env.ANALYZE === 'true' && {
    // npm install --save-dev @next/bundle-analyzer to use
  }),

  // ── Security + Cache Headers ──────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      // Face recognition model files — cache 1 year
      {
        source: '/models/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Static Next.js assets — cache 1 year
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Public images — cache 7 days with stale-while-revalidate
      {
        source: '/:path*.{png,jpg,jpeg,gif,webp,avif,ico,svg}',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      // Fonts — cache 1 year
      {
        source: '/:path*.{woff,woff2,ttf,otf,eot}',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Landing page — cache with stale-while-revalidate for fast repeat visits
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
          { key: 'Vary', value: 'Accept-Encoding' },
        ],
      },
      // Auth pages — short cache
      {
        source: '/(login|register|forgot-password|reset-password)',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      // API routes — no cache
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },

  // ── Redirects ─────────────────────────────────────────────────────────────
  async redirects() {
    return [
      // Redirect /home to /
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
