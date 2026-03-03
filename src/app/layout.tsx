import type { Metadata, Viewport } from "next";
import { 
  IBM_Plex_Sans,
  Montserrat,
  Work_Sans,
  Inter 
} from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/lib/convex";
import { SessionProvider } from '@/components/providers/SessionProvider'
import { AuthSyncProvider } from '@/components/providers/AuthSyncProvider'
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { I18nProvider } from "@/components/I18nProvider";

// Corporate & Professional - IBM PLEX SANS
const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["400", "500", "600", "700"],
  fallback: ["sans-serif"],
  adjustFontFallback: true,
});

// Modern & Bold - MONTSERRAT
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["400", "500", "600", "700", "800", "900"],
  fallback: ["sans-serif"],
  adjustFontFallback: true,
});

// Clean & Serious - WORK SANS
const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["400", "500", "600", "700", "800"],
  fallback: ["sans-serif"],
  adjustFontFallback: true,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["400", "500", "600"],
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
  adjustFontFallback: true,
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://hroffice.app";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#60a5fa" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "HR Office — All-in-One HR Management Platform",
    template: "%s | HR Office",
  },
  description:
    "HR Office is a powerful all-in-one HR platform with real-time attendance tracking, leave management, task management, employee analytics, face recognition check-in, and AI assistant. Built for modern teams.",
  keywords: [
    "HR software", "HR management", "leave management", "attendance tracking",
    "employee management", "task management", "HR platform", "absence management",
    "face recognition HR", "AI HR assistant", "workforce management",
    "employee scheduling", "HR analytics", "team management",
    "remote work tracking", "performance management",
  ],
  authors: [{ name: "HR Office Team", url: APP_URL }],
  creator: "HR Office",
  publisher: "HR Office",
  category: "Business Software",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    title: "HR Office — All-in-One HR Management Platform",
    description:
      "Manage your entire workforce with real-time attendance, AI-powered analytics, task management, and smart leave tracking.",
    siteName: "HR Office",
    images: [{
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "HR Office — All-in-One HR Management Platform",
      type: "image/png",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HR Office — All-in-One HR Management Platform",
    description:
      "Manage your entire workforce with real-time attendance, AI-powered analytics, and smart task management.",
    images: ["/og-image.png"],
    creator: "@hrofficeapp",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-animated.svg?v=3", type: "image/svg+xml" },
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/favicon-32x32.svg?v=3", sizes: "32x32", type: "image/svg+xml" },
      { url: "/favicon-16x16.svg?v=3", sizes: "16x16", type: "image/svg+xml" },
    ],
    shortcut: "/favicon-animated.svg?v=3",
    apple: [
      { url: "/apple-touch-icon.svg?v=3", sizes: "180x180", type: "image/svg+xml" },
      { url: "/apple-touch-icon.png?v=3", sizes: "180x180" },
    ],
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${APP_URL}/#software`,
      "name": "HR Office",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "url": APP_URL,
      "description": "All-in-one HR management platform with real-time attendance, leave management, tasks, and AI assistant.",
      "featureList": [
        "Real-time attendance tracking with face recognition",
        "Leave management with AI assistant",
        "Task management with Kanban board",
        "Employee performance analytics",
        "Multi-role access control (Admin, Supervisor, Employee)",
        "Real-time notifications",
        "Calendar integration (Google, Outlook)",
        "AI-powered HR assistant",
      ],
      "offers": {
        "@type": "Offer",
        "price": "29",
        "priceCurrency": "USD",
        "priceValidUntil": "2027-12-31",
        "availability": "https://schema.org/InStock",
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "bestRating": "5",
        "worstRating": "1",
        "ratingCount": "500",
        "reviewCount": "120",
      },
      "publisher": {
        "@type": "Organization",
        "name": "HR Office",
        "url": APP_URL,
      },
    },
    {
      "@type": "Organization",
      "@id": `${APP_URL}/#organization`,
      "name": "HR Office",
      "url": APP_URL,
      "logo": {
        "@type": "ImageObject",
        "url": `${APP_URL}/icon.png`,
      },
      "sameAs": [],
    },
    {
      "@type": "WebSite",
      "@id": `${APP_URL}/#website`,
      "url": APP_URL,
      "name": "HR Office",
      "description": "All-in-one HR management platform",
      "publisher": { "@id": `${APP_URL}/#organization` },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${APP_URL}/employees?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Animated SVG Favicon - works in all modern browsers */}
        <link rel="icon" href="/favicon-animated.svg?v=3" type="image/svg+xml" />
        
        {/* Multiple sizes for better browser support */}
        <link rel="icon" type="image/svg+xml" sizes="16x16" href="/favicon-16x16.svg?v=3" />
        <link rel="icon" type="image/svg+xml" sizes="32x32" href="/favicon-32x32.svg?v=3" />
        
        {/* Safari pinned tab */}
        <link rel="mask-icon" href="/favicon.svg?v=3" color="#2563eb" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.svg?v=3" />
        
        {/* Web App Manifest */}
        <link rel="manifest" href="/site.webmanifest" />

        {/* ── Critical resource hints ── */}
        {/* Cloudinary for avatars/images */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        {/* NOTE: fonts.googleapis.com NOT needed — Inter is self-hosted via next/font */}
        {/* Convex real-time backend */}
        <link rel="preconnect" href="https://steady-jaguar-712.convex.cloud" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://steady-jaguar-712.convex.cloud" />

        {/* ── Prefetch key navigation pages ── */}
        <link rel="prefetch" href="/login" as="document" />

        {/* JSON-LD Structured Data — async so it never blocks rendering */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          async
        />
      </head>
      <body className={`${ibmPlexSans.variable} ${montserrat.variable} ${workSans.variable} ${inter.variable} antialiased`}>
        <SessionProvider>
          <I18nProvider>
            <ConvexClientProvider>
              <AuthSyncProvider>
                <ThemeProvider
                  attribute="class"
                  defaultTheme="system"
                  enableSystem={true}
                  disableTransitionOnChange
                >
                  {children}
                <Toaster
                  position="top-right"
                  closeButton
                  expand={false}
                  duration={4000}
                  toastOptions={{
                    style: {
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    },
                    className: 'sonner-toast',
                  }}
                />
                </ThemeProvider>
              </AuthSyncProvider>
            </ConvexClientProvider>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
