# Landing Page Files - Quick Reference

## 📂 File Locations

### Entry Point
```
src/app/page.tsx
```

### Components
```
src/components/landing/
├── LandingClient.tsx              (968 lines) ⭐ MAIN COMPONENT
├── FeatureCard.tsx                (134 lines)
├── FAQSection.tsx                 (147 lines)
├── PricingPreview.tsx             (377 lines)
├── TestimonialsSection.tsx        (117 lines)
├── NewsletterSection.tsx          (106 lines)
├── FloatingParticles.tsx          (57 lines)
├── StatsCard.tsx                  (108 lines)
├── MobileMenu.tsx                 (157 lines)
├── SocialProof.tsx                (referenced, details in main component)
└── SphereMesh.tsx                 (121 lines) [3D/unused]
```

---

## 📋 File Details at a Glance

| File | Purpose | Key Props | Dynamic |
|------|---------|-----------|---------|
| **LandingClient.tsx** | Main landing page orchestrator | — | Yes (auth, theme) |
| **FeatureCard.tsx** | Feature display card | icon, title, description, gradient, accentColor, badge, delay | Yes (scroll) |
| **FAQSection.tsx** | Expandable FAQ accordion | — | Yes (toggle state) |
| **PricingPreview.tsx** | Pricing tier display | — | Yes (user plan, loading) |
| **TestimonialsSection.tsx** | Customer testimonials grid | — | Yes (scroll) |
| **NewsletterSection.tsx** | Email subscription form | — | Yes (form state) |
| **FloatingParticles.tsx** | Background particle animation | — | No (pure CSS) |
| **StatsCard.tsx** | Animated counter card | value, label, icon, color, delay | Yes (count-up) |
| **MobileMenu.tsx** | Mobile navigation menu | isOpen, onClose | Yes (menu state) |
| **SphereMesh.tsx** | 3D sphere visualization | — | Yes (Three.js) |

---

## 🎯 Component Imports & Dependencies

### LandingClient.tsx imports:
```typescript
// UI Components
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, ... } from '@/components/ui/dropdown-menu'

// Icons
import { Calendar, Heart, Users, Activity, Stethoscope, BarChart3, ... } from 'lucide-react'

// Landing Components (static imports)
import StatsCard from './StatsCard'
import FeatureCard from './FeatureCard'
import MobileMenu from './MobileMenu'

// Dynamic imports (lazy load below-fold)
const FloatingParticles = dynamic(() => import('./FloatingParticles'), { ssr: false, loading: () => null })
const TestimonialsSection = dynamic(() => import('./TestimonialsSection'), { loading: () => <div /> })
const FAQSection = dynamic(() => import('./FAQSection'), { loading: () => <div /> })
const NewsletterSection = dynamic(() => import('./NewsletterSection'), { loading: () => <div /> })
const PricingPreview = dynamic(() => import('./PricingPreview'), { loading: () => <div /> })
const SocialProof = dynamic(() => import('./SocialProof'), { loading: () => <div /> })

// Utilities
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { useAuthStore } from '@/store/useAuthStore'
import { useRouter } from 'next/navigation'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { logoutAction } from '@/actions/auth'
```

---

## 🎨 Styling Approach

### CSS Variables (Theming)
- All colors defined as CSS custom properties
- Light/dark mode switching via theme provider
- Brand colors: Blue (`#2563eb`), Light Blue (`#93c5fd`), Slate (`#94a3b8`)

### Animation Classes
```css
/* Hero section fade-in stagger */
.hero-fade-1, .hero-word-1, .hero-word-2
.hero-subtitle-line

/* Badge animation */
.badge-shimmer

/* Particle animations */
.particle-float-1, .particle-float-2, .particle-float-3

/* Card reveal animation */
.card-reveal

/* Scroll indicator */
.scroll-line

/* Icon animations */
.logo-spin, .spin-slow

/* Hover effects */
.badge-pulse, .arrow-bounce

/* Floating effect */
.animate-float

/* Pulse effects */
.pulse-dot, .orb-pulse-1, .orb-pulse-2, .orb-pulse-3
```

### Gradients Used
```
linear-gradient(135deg, #2563eb, #93c5fd)           // Primary CTA
linear-gradient(135deg, rgba(37,99,235,0.12), ...)  // Feature card 1
linear-gradient(135deg, rgba(56,189,248,0.12), ...) // Feature card 2
linear-gradient(135deg, rgba(14,165,233,0.12), ...) // Feature card 3
linear-gradient(135deg, rgba(96,165,250,0.12), ...) // Feature card 4
radial-gradient(circle, var(--landing-orb-*), ...)  // Background orbs
```

---

## 🔗 Navigation & Links

### Header Navigation
- Home (`#home` anchor)
- Features (`#features` anchor)
- Pricing (`#pricing` anchor)
- Testimonials (`#testimonials` anchor)
- FAQ (`#faq` anchor)

### Action Links
- Sign In → `/login`
- Register/Get Started → `/register`
- Dashboard → `/app/dashboard` (if logged in)
- Settings → `/app/settings` (if logged in)

### Footer Links (By Category)
- **Product**: Features, Pricing, Security
- **Platform**: Integrations, API, Status
- **Account**: Login, Register, Billing
- **Legal**: Privacy, Terms, Cookies

---

## 📊 Translation Keys Mapping

### Landing Page (`landing.*`)
```
landing.exclusiveHR          → "Exclusive HR Platform"
landing.heroTitle            → Main headline
landing.heroSubtitle         → Subheading
landing.getStartedFree       → CTA button text
landing.signIn               → Sign in button
landing.viewAnalytics        → Analytics button
landing.goToDashboard        → Dashboard button
landing.scroll               → "Scroll down" text
landing.byTheNumbers         → Section eyebrow
landing.trustedAt            → Stats section
landing.scale                → "scale" (highlighted)
landing.trustedByElite       → Trusted companies section
landing.leaveTypes           → Features section eyebrow
landing.perfectlyManaged      → "perfectly managed" (highlighted)
landing.vacationTracking      → Feature 1 title
landing.vacationDesc          → Feature 1 description
landing.sickLeave             → Feature 2 title
landing.sickLeaveDesc         → Feature 2 description
landing.familyLeave           → Feature 3 title
landing.familyLeaveDesc       → Feature 3 description
landing.doctorVisits          → Feature 4 title
landing.doctorVisitsDesc      → Feature 4 description
landing.mostUsed              → Badge 1
landing.policyAware           → Badge 2
landing.complianceReady        → Badge 3
landing.premium               → Badge 4
landing.features              → Nav link
landing.pricing               → Nav link
landing.testimonials          → Nav link
landing.faq                   → Nav link
landing.contactUs             → Contact link
landing.privacyPolicy         → Privacy link
landing.termsOfService        → Terms link
```

### Landing Extra (`landingExtra.*`)
```
landingExtra.statsEmployees          → "500+ Employees Tracked"
landingExtra.statsAccuracy           → "99% Accuracy"
landingExtra.statsRealtime           → "24/7 Real-time"
landingExtra.statsAnalytics          → "Advanced Analytics"
landingExtra.everyLeaveType          → "Every Leave Type"
landingExtra.featuresSubtitle        → Features description
landingExtra.ctaTitle                → CTA banner title
landingExtra.ctaTitleHighlight       → "Highlight" part of CTA
landingExtra.ctaSubtitle             → CTA subtitle
landingExtra.footerBrand             → Brand name
landingExtra.footerProduct           → Product section header
landingExtra.footerPlatform          → Platform section header
landingExtra.footerAccount           → Account section header
landingExtra.footerLegal             → Legal section header
landingExtra.footerCopyright         → Copyright text
landingExtra.footerSsl               → "SSL Secured"
landingExtra.footerGdprCompliant     → "GDPR Compliant"
landingExtra.footerSoc2              → "SOC2 Certified"
landingExtra.switchToLight           → "Switch to light theme"
landingExtra.switchToDark            → "Switch to dark theme"
landingExtra.myAccount               → "My Account" label
landingExtra.logOut                  → "Log Out"
landingExtra.signIn                  → "Sign In"
landingExtra.getStarted              → "Get Started"
```

### Pricing (`pricing.*`)
```
pricing.eyebrow                → Section label
pricing.headingStart           → "Transparent,"
pricing.headingHighlight       → "Flexible Pricing"
pricing.subtitle               → Price description
pricing.allPlansInclude        → "All plans include:"
pricing.sslSecured             → Trust badge
pricing.noSetupFees            → Trust badge
pricing.cancelAnytime          → Trust badge
pricing.gdprCompliant          → Trust badge
pricing.free                   → Free tier name
pricing.freeDesc               → Free tier description
pricing.professional           → Pro tier name
pricing.professionalDesc       → Pro tier description
pricing.enterprise             → Enterprise tier name
pricing.enterpriseDesc         → Enterprise tier description
pricing.priceZero              → "Free"
pricing.priceStarting          → Pricing text
pricing.perMonth               → "/month"
pricing.freeTrial              → "Start free trial"
pricing.currentPlan            → "Current plan"
pricing.upgradeNow             → "Upgrade now"
pricing.footerNote             → "All payments secured by"
```

### FAQ (`faq.*`)
```
faq.title                      → "Frequently Asked Questions"
faq.subtitle                   → "Got questions?"
faq.subtitleHighlight          → "We have answers"
faq.description                → FAQ section description
faq.q1-q6                      → Question texts
faq.a1-a6                      → Answer texts
faq.stillHaveQuestions         → "Still have questions?"
faq.contactSupport             → "Contact our support team"
```

### Testimonials (`testimonials.*`)
```
testimonials.eyebrow           → "Loved by Teams"
testimonials.headingStart      → "Trusted by"
testimonials.headingHighlight  → "Industry Leaders"
testimonials.subtitle          → Testimonials description
```

### Newsletter (`newsletter.*`)
```
newsletter.title               → "Stay Updated"
newsletter.subtitle            → Newsletter description
newsletter.placeholder         → "Enter your email"
newsletter.submit              → "Subscribe"
newsletter.invalidEmail        → "Invalid email" (toast)
newsletter.successMessage      → "Subscribed!" (toast)
```

### Mobile Menu (`mobileMenu.*`)
```
mobileMenu.home                → "Home"
mobileMenu.features            → "Features"
mobileMenu.analytics           → "Analytics"
mobileMenu.pricing             → "Pricing"
mobileMenu.about               → "About"
mobileMenu.signIn              → "Sign In"
mobileMenu.getStartedFree      → "Get Started Free"
mobileMenu.closeMenu           → "Close menu"
```

---

## 🎭 Theme Colors

### Light Mode
- Background: White/Light Gray
- Text Primary: Dark Gray/Black
- Text Secondary: Medium Gray
- Cards: Light Gray with subtle borders
- Accents: Blue (`#2563eb`)

### Dark Mode
- Background: Dark Gray/Black
- Text Primary: White
- Text Secondary: Light Gray
- Cards: Dark Gray with subtle borders
- Accents: Light Blue (`#93c5fd`)

---

## 🚀 Performance Metrics

### Static Imports
- `StatsCard` (eager) - Above the fold
- `FeatureCard` (eager) - Above the fold
- `MobileMenu` (eager) - May be needed on mount
- All `lucide-react` icons (eager) - Hero section

### Dynamic Imports (Code Split)
- `FloatingParticles` - Non-critical, `ssr: false`
- `TestimonialsSection` - Below the fold
- `FAQSection` - Below the fold
- `NewsletterSection` - Below the fold
- `PricingPreview` - Below the fold
- `SocialProof` - Below the fold

### Loading Placeholders
- Skeleton divs with `animate-pulse` while loading
- Consistent heights to prevent layout shift

---

## 🔐 Authentication Integration

### Auth Store
- `useAuthStore()` from `@/store/useAuthStore`
- Properties:
  - `user` - Current logged-in user
  - `logout()` - Logout function

### Auth Actions
- `logoutAction()` from `@/actions/auth` - Server action

### Conditional UI
- Show "Sign In" + "Get Started" if no user
- Show user avatar + dropdown if logged in
- Dropdown options:
  - Profile → `/app/profile`
  - Dashboard → `/app/dashboard`
  - Settings → `/app/settings`
  - Logout → calls `logoutAction()`

---

## 🎯 CTA Flow

```
Hero Section (above fold)
    ↓
["Go to Dashboard"] (if logged in) | ["Get Started Free"] (if not)
    ↓
Features Section (mid-page)
    ↓
Pricing Section (scroll)
    ↓
Testimonials Section (scroll)
    ↓
FAQ Section (scroll)
    ↓
Newsletter Signup (scroll)
    ↓
CTA Banner (bottom)
    ↓
Footer with links
```

---

## 📱 Mobile Responsiveness

### Breakpoints
- **xs** (< 640px) - Mobile
- **sm** (≥ 640px) - Small mobile
- **md** (≥ 768px) - Tablet
- **lg** (≥ 1024px) - Desktop
- **xl** (≥ 1280px) - Large desktop
- **2xl** (≥ 1536px) - Extra large

### Mobile-Specific
- `MobileMenu` component (hidden on `lg+`)
- Mobile menu button in navbar
- Hamburger icon (3 horizontal lines)
- Stack layout instead of grid on mobile
- Reduced font sizes on small screens
- Touch-optimized buttons (larger hit areas)

---

## 🔧 Key Dependencies

- **next** - Framework
- **react** - UI library
- **react-i18next** - Translations
- **next-themes** - Dark mode
- **lucide-react** - Icons
- **zustand** - State management
- **sonner** - Toast notifications
- **tailwindcss** - Styling
- **three** - 3D graphics (SphereMesh)
- **@react-three/fiber** - React Three.js renderer

