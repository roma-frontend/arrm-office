/** @type {import('next').NextConfig} */

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  // ═══════════════════════════════════════════════════════════════
  // CORE SETTINGS
  // ═══════════════════════════════════════════════════════════════
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,

  // Dev-only floating badge, bottom-left. It sits exactly on top of the mobile
  // bottom dock (see MobileTabBar) and covered the first tab's label on a phone
  // viewport. Build and runtime errors are still surfaced with this off — only
  // the indicator is hidden. Set to `{ position: 'bottom-left' }` to restore it.
  devIndicators: false,

  // Emit browser source maps in production.
  // Lighthouse flags "Missing source maps for large first-party JavaScript"
  // without them, and Sentry needs them to un-minify stack traces. The .map
  // files are only fetched when DevTools is open, so they cost real users
  // nothing — they are not referenced by the page's critical path.
  productionBrowserSourceMaps: true,

  // TypeScript: DO NOT ignore build errors — catch type issues early
  typescript: { ignoreBuildErrors: false },

  // Transpile Radix UI icons (face-api is pre-built, no transpilation needed)
  transpilePackages: ['@radix-ui/react-icons'],

  // ═══════════════════════════════════════════════════════════════
  // NFT TRACING — exclude dynamic fs routes to prevent warnings
  // ═══════════════════════════════════════════════════════════════
  outputFileTracingExcludes: {
    '/api/ai-site-editor/apply': ['**/node_modules/@vladmandic/face-api/**'],
  },

  // ═══════════════════════════════════════════════════════════════
  // IMAGES — OPTIMIZED
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // COMPILER — strip console.log in production
  // ═══════════════════════════════════════════════════════════════
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // ═══════════════════════════════════════════════════════════════
  // EXPERIMENTAL — OPTIMIZED
  // ═══════════════════════════════════════════════════════════════
  experimental: {
    serverActions: {
      // 10mb to match uploadDocument()'s own size check — signed PDFs bake in
      // signature images and can exceed the old 2mb cap, which stalled uploads.
      bodySizeLimit: '10mb',
      // SECURITY: restrict to your actual domain(s)
      allowedOrigins: [
        process.env.NEXT_PUBLIC_APP_URL || 'https://hr-project.vercel.app',
        'https://hr-project.vercel.app',
      ],
    },
    // Aggressive package imports optimization
    optimizePackageImports: [
      'lucide-react',
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
      'react-i18next',
      'convex',
    ],
    optimizeCss: true,
    scrollRestoration: true,
    cssChunking: true,
  },

  // Enable Turbopack for production builds (faster, smaller bundles)
  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': { loaders: ['@svgr/webpack'], as: '*.js' },
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // WEBPACK — fallback bundler only (`next build --webpack`)
  //
  // Next.js 16 builds with Turbopack by default, so this hook does NOT run on
  // a normal `next build`. It is kept minimal and only carries settings that
  // must survive an explicit `--webpack` build (e.g. `build:analyze`).
  // Do NOT put performance tuning here expecting it to affect production:
  // chunk splitting and minification are Turbopack's job. The previous large
  // splitChunks/optimization block lived here and never ran.
  // ═══════════════════════════════════════════════════════════════
  webpack(config) {
    // Silence the face-api size warning — it is lazy-loaded, never in the
    // initial bundle, so the recommended-size limit does not apply.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@vladmandic\/face-api/, message: /exceeds the recommended size limit/ },
    ];

    return config;
  },

  // ═══════════════════════════════════════════════════════════════
  // CACHE HEADERS
  // NOTE: Security headers (CSP, HSTS, X-Frame-Options, etc.)
  //       are set ONLY in src/proxy.ts to avoid conflicts.
  //       next.config.js headers are only used for CDN-level caching.
  // ═══════════════════════════════════════════════════════════════
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';

    return [
      // Face recognition model weights.
      //
      // `immutable` used to be set here, which tells the browser never to
      // revalidate — so the moment any bad response for a weights file landed in
      // the cache (a 404 for a file added mid-session, a truncated body), it was
      // pinned for a year and no reload could dislodge it. tfjs then failed with
      // "the tensor should have N values but has 0" against a file that was
      // perfectly fine on the server.
      //
      // Weights are content-addressed by filename in practice, so a long max-age
      // is still right; dropping `immutable` only costs a conditional request
      // after a year and keeps the cache recoverable. In development the files
      // change as models are added, so caching is disabled outright.
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: isDev ? 'no-store, max-age=0' : 'public, max-age=31536000',
          },
        ],
      },
      // Images — cache 7 days + stale-while-revalidate
      {
        source: '/:path*.{png,jpg,jpeg,gif,webp,avif,ico,svg}',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      // Fonts — immutable cache
      {
        source: '/:path*.{woff,woff2,ttf,otf,eot}',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Landing page — fast repeat visits
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
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
      // Chat pages — stale-while-revalidate for fast updates
      {
        source: '/chat',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
    ];
  },

  // ═══════════════════════════════════════════════════════════════
  // REDIRECTS
  // ═══════════════════════════════════════════════════════════════
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
