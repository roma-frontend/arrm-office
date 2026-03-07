/** @type {import('next').NextConfig} */

// Bundle analyzer (опционально для разработки)
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  // ===== PERFORMANCE OPTIMIZATIONS =====
  
  // Компиляция только необходимых страниц в dev режиме
  experimental: {
    // Оптимизированный tree shaking для server components
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      'framer-motion',
      'recharts',
      'date-fns',
      'react',
      'react-dom',
    ],
    // Оптимизация CSS - критично!
    optimizeCss: true,
  },
  
  // Компрессия
  compress: true,
  
  // Оптимизация production build
  productionBrowserSourceMaps: false, // Отключить source maps в production
  
  // Transpile только необходимое
  transpilePackages: ['@radix-ui/react-icons'],
  
  // Оптимизация webpack - ЭКСТРЕМАЛЬНАЯ
  webpack: (config, { isServer, dev }) => {
    // Production оптимизации
    if (!dev) {
      // КРИТИЧНО: Минимизация JS
      config.optimization = {
        ...config.optimization,
        
        minimize: true,
        
        // Улучшенный code splitting
        splitChunks: {
          chunks: 'all',
          maxAsyncRequests: 30,
          maxInitialRequests: 25,
          minSize: 20000,
          cacheGroups: {
            default: false,
            vendors: false,
            
            // React core - отдельно
            react: {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 50,
              chunks: 'all',
              enforce: true,
            },
            
            // UI библиотеки - ВЫСШИЙ ПРИОРИТЕТ
            ui: {
              name: 'ui',
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|class-variance-authority|tailwind-merge|clsx)[\\/]/,
              priority: 45,
              chunks: 'all',
              enforce: true,
            },
            
            // Framer Motion - ASYNC
            framerMotion: {
              name: 'framer-motion',
              test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
              priority: 40,
              chunks: 'async',
            },
            
            // Charts - ASYNC
            charts: {
              name: 'recharts',
              test: /[\\/]node_modules[\\/](recharts|d3-)[\\/]/,
              priority: 35,
              chunks: 'async',
            },
            
            // AI SDK - ASYNC
            aiSdk: {
              name: 'ai-sdk',
              test: /[\\/]node_modules[\\/](@ai-sdk|ai|openai)[\\/]/,
              priority: 35,
              chunks: 'async',
            },
            
            // Convex - критичный
            convex: {
              name: 'convex',
              test: /[\\/]node_modules[\\/]convex[\\/]/,
              priority: 30,
              chunks: 'all',
            },
            
            // Vendor fallback
            vendors: {
              name: 'vendors',
              test: /[\\/]node_modules[\\/]/,
              priority: 10,
              chunks: 'all',
              reuseExistingChunk: true,
            },
          },
        },
        
        // Минимизация runtime
        runtimeChunk: {
          name: 'runtime',
        },
        
        // НОВОЕ: Module concatenation для меньшего размера
        concatenateModules: true,
        
        // НОВОЕ: Удаление мёртвого кода
        usedExports: true,
        sideEffects: true,
      };
    }
    
    // КРИТИЧНО: Исключаем ненужные модули
    config.resolve.alias = {
      ...config.resolve.alias,
      // Уменьшаем размер moment.js если используется
      moment$: 'moment/moment.js',
    };
    
    return config;
  },
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
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel.app https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://*.convex.cloud https://*.googleapis.com https://api.groq.com https://api.openai.com https://api.stripe.com https://sentry.io https://*.sentry.io https://*.ingest.sentry.io wss://*.convex.cloud https://*.metered.live https://*.metered.ca; frame-src 'self' https://challenges.cloudflare.com; worker-src 'self'; manifest-src 'self';",
          },
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
      // Redirect /superadmin to /superadmin/organizations
      {
        source: '/superadmin',
        destination: '/superadmin/organizations',
        permanent: false,
      },
    ];
  },
};

// Injected content via Sentry wizard

// const { withSentryConfig } = require("@sentry/nextjs");

// module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), {
module.exports = withBundleAnalyzer(nextConfig);
/*
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "adb-arrm",
  project: "hr-project",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
*/
