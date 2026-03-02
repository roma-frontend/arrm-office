# Landing Page Structure - Desktop/office Project

## Overview
This is a modern, performance-optimized landing page built with Next.js, React, TypeScript, and Tailwind CSS. The page uses CSS-based animations instead of JavaScript frameworks like Framer Motion to minimize runtime overhead.

---

## 📁 File Structure

### Main Page Entry Point
- **`Desktop/office/src/app/page.tsx`** (5 lines)
  - Root landing page that renders `<LandingClient />`
  - Simple wrapper component

---

## 🎨 Landing Page Components

All landing components are located in: `Desktop/office/src/components/landing/`

### 1. **LandingClient.tsx** (968 lines) - Main Landing Page Component
The core landing page component that orchestrates all sections.

**Key Features:**
- Uses `'use client'` directive (client-side component)
- Imports i18n for multi-language support (English, Russian, Armenian)
- Dynamically loads sections below the fold (lazy loading)
- Theme switching (light/dark mode)
- User authentication state management
- Responsive navigation with mobile menu

**Sections Included:**
1. **Navbar** - Fixed navigation with logo, links, theme toggle, user dropdown, language switcher
2. **HeroSection** - Main banner with title, subtitle, CTA buttons, social proof
3. **SocialProof** - Trusted companies section
4. **StatsSection** - "By the numbers" section with animated counter cards
5. **FeaturesSection** - Leave types features (vacation, sick leave, family, doctor visits)
6. **PricingPreview** - Pricing tiers (Free, Professional, Enterprise)
7. **TestimonialsSection** - Customer testimonials (lazy loaded)
8. **FAQSection** - FAQ accordion (lazy loaded)
9. **NewsletterSection** - Email subscription (lazy loaded)
10. **CTABanner** - Call-to-action banner
11. **Footer** - Footer with links and copyright

**Styling:**
- CSS variable-based theming (`--landing-bg`, `--landing-text-primary`, etc.)
- Gradient orbs background animations
- Pure CSS animations (no Framer Motion)
- IntersectionObserver for scroll-triggered animations

**Data Structures:**
- `getStatsData()` - Returns stats with icons and labels
- `getFeaturesData()` - Returns feature cards
- `TRUSTED` array - Company logos for social proof

---

### 2. **FeatureCard.tsx** (134 lines)
Reusable card component for displaying features with hover animations.

**Props:**
- `icon: React.ReactNode` - Feature icon
- `title: string` - Feature title
- `description: string` - Feature description
- `gradient: string` - Gradient background
- `accentColor: string` - Card accent color
- `badge?: string` - Optional badge text
- `delay?: number` - Animation delay

**Features:**
- IntersectionObserver-based fade-in animation
- Hover effects: glow, scale, icon rotation
- Glass-morphism design with backdrop blur
- Top shimmer border
- Corner glow decoration
- Smooth CSS transitions

---

### 3. **FAQSection.tsx** (147 lines)
Accordion-style FAQ section with expandable items.

**Features:**
- Translation keys for questions and answers
- Smooth height animation when opening/closing
- Icon rotation on toggle (Plus → Minus)
- "Contact Support" email link
- Staggered fade-in animation for items
- Semantic HTML with `aria-expanded` attributes

**Data:**
- 6 FAQ items with question/answer translation keys

---

### 4. **PricingPreview.tsx** (377 lines)
Pricing tier cards with subscription management.

**Features:**
- Three pricing tiers: Free, Professional, Enterprise
- Current plan highlighting (if user logged in)
- "Free trial" and "Start free" labels
- Loading states during checkout
- Trust badges (SSL, no setup fees, cancel anytime, GDPR)
- Shimmer effect on buttons
- Gradient borders for featured plan
- Integration with Stripe checkout

**Props (PricingCard):**
- `tier` - Pricing tier object
- `delay` - Animation delay
- `currentPlan` - User's current plan

---

### 5. **TestimonialsSection.tsx** (117 lines)
Customer testimonial cards with ratings.

**Features:**
- 3 hardcoded testimonials (Sarah, Michael, Emily)
- 5-star ratings with Star icons
- Quote icon decoration
- Avatar with fallback initials
- Hover lift animation (translate -Y)
- Grid layout (1 col mobile, 2 cols tablet, 3 cols desktop)

**Testimonial Data:**
- Name, role, company
- Avatar URL (currently empty)
- 5-star rating
- Testimonial text
- Custom gradient per card

---

### 6. **NewsletterSection.tsx** (106 lines)
Email subscription section.

**Features:**
- Email input validation
- Loading state with spinner
- Success state with CheckCircle2 icon
- Toast notifications (using Sonner)
- Mail icon with float animation
- Glowing background orb
- Form submission timeout (1 second)

---

### 7. **FloatingParticles.tsx** (57 lines)
Background particles using pure CSS animations.

**Features:**
- 12 particles (reduced from 23 for performance)
- Pure CSS animations (no JavaScript runtime cost)
- Seeded random values for consistent SSR/client rendering
- Three color variants (blue, purple, green)
- Three different float animation durations
- `aria-hidden="true"` for accessibility
- `will-change` optimization for compositor

**Animations:**
- `particle-float-1`, `particle-float-2`, `particle-float-3` CSS classes
- Randomized durations: 15-35 seconds
- Pre-started animations with negative delays

---

### 8. **StatsCard.tsx** (108 lines)
Animated statistics card with count-up animation.

**Props:**
- `value: string` - Stat value (e.g., "500+", "99%")
- `label: string` - Stat label
- `icon: React.ReactNode` - Icon element
- `color: string` - Background color
- `delay?: number` - Animation delay

**Features:**
- IntersectionObserver-based visibility detection
- Count-up animation using `requestAnimationFrame`
- Cubic bezier easing (ease-out)
- Hover: scale up, translate up, glow
- Icon rotates with `logo-spin` CSS class
- Shimmer top border

---

### 9. **SphereMesh.tsx** (121 lines)
3D sphere mesh using Three.js and React Three Fiber.

**Features:**
- 80 floating indigo particles
- 200 distant stars (backdrop)
- Smooth rotation animations
- Additive blending for particles
- Point lighting (indigo accents)
- Depth sorting and attenuation

**Note:** This component appears to be available but may not be actively used in the main landing page.

---

### 10. **MobileMenu.tsx** (157 lines)
Slide-in mobile navigation menu.

**Features:**
- Backdrop overlay with blur
- Slide-in animation from right
- Escape key to close
- Body scroll lock when open
- Staggered menu item animations
- Language switcher in footer
- Sign in / Get started CTA buttons
- Responsive (hidden on md+ screens)

**Menu Items:**
- Home, Features, Analytics, Pricing, About (with icons)

---

### 11. **SocialProof.tsx** (Referenced in LandingClient)
Component showing trusted companies (imported dynamically).

---

## 🎯 Key Technologies & Patterns

### Animations & Performance
- **Pure CSS Animations** - No Framer Motion, minimal JS overhead
- **IntersectionObserver** - Scroll-triggered animations
- **RequestAnimationFrame** - Smooth count-up animations
- **CSS Variables** - Dynamic theming support
- **Will-change** - GPU optimization hints
- **Contain: strict** - Layout containment for particles

### Internationalization (i18n)
- **react-i18next** for translations
- Translation keys in English (en.json), Russian (ru.json), Armenian (hy.json)
- Keys used:
  - `landing.*` - Main landing page text
  - `landingExtra.*` - Additional landing page text
  - `pricing.*` - Pricing section
  - `testimonials.*` - Testimonials section
  - `faq.*` - FAQ section
  - `newsletter.*` - Newsletter section
  - `mobileMenu.*` - Mobile menu text

### State Management
- **Zustand** (`useAuthStore`) - Authentication state
- **next-themes** - Theme switching (light/dark)
- **React Context** - Subscription/plan info

### UI Components
- **Shadcn/ui** - Avatar, DropdownMenu
- **Lucide React** - Icons (Calendar, Heart, Users, Activity, etc.)
- **Sonner** - Toast notifications

### Styling
- **Tailwind CSS** - Utility-first styling
- **CSS Modules** - Component-scoped styles (via style prop)
- **CSS Grid/Flexbox** - Layout

---

## 📊 Section Data Structures

### Stats Data
```typescript
{
  value: '500+',           // Display value
  label: 'Employees',      // Label text (translated)
  icon: <Users />,         // Lucide icon
  color: 'rgba(...)',      // Background color
}
```

### Feature Data
```typescript
{
  icon: <Calendar />,
  title: 'Vacation Tracking',     // Translated
  description: 'Manage...',       // Translated
  gradient: 'linear-gradient(...)',
  accentColor: '#2563eb',
  badge: 'Most Used',             // Optional
}
```

### Pricing Tier Data
```typescript
{
  id: 1,
  nameKey: 'pricing.free',
  descriptionKey: 'pricing.freeDesc',
  priceKey: 'pricing.priceZero',
  features: [...],
  accentFrom: '#60a5fa',
  accentTo: '#3b82f6',
  // ... more properties
}
```

---

## 🎨 CSS Custom Properties Used

```css
--landing-bg                  /* Background color */
--landing-card-bg            /* Card background */
--landing-card-border        /* Card border color */
--landing-text-primary       /* Primary text */
--landing-text-secondary     /* Secondary text */
--landing-text-muted         /* Muted text */
--landing-orb-1/2/3         /* Gradient orb colors */
--primary                    /* Primary brand color (#2563eb) */
--card-hover                 /* Card hover state */
--background                 /* Page background */
```

---

## 🔄 Component Hierarchy

```
page.tsx
└── LandingClient (main client component)
    ├── GradientOrbs (background)
    ├── FloatingParticles (background, lazy)
    ├── Navbar
    │   ├── Logo + Nav links
    │   ├── Theme toggle
    │   ├── User dropdown
    │   ├── Language switcher
    │   └── Mobile menu button
    ├── HeroSection
    │   ├── Badge
    │   ├── Title + Subtitle
    │   ├── CTA Buttons
    │   └── Trusted by section
    ├── SocialProof (lazy)
    ├── StatsSection
    │   └── StatsCard (x4)
    ├── FeaturesSection
    │   └── FeatureCard (x4)
    ├── PricingPreview (lazy)
    │   └── PricingCard (x3)
    ├── TestimonialsSection (lazy)
    │   └── TestimonialCard (x3)
    ├── FAQSection (lazy)
    │   └── FAQItem (x6)
    ├── NewsletterSection (lazy)
    ├── CTABanner
    └── Footer
        └── Footer links by category
```

---

## 🚀 Performance Optimizations

1. **Code Splitting** - Lazy load sections below the fold
2. **CSS Animations** - No JavaScript animation libraries
3. **IntersectionObserver** - Only animate when visible
4. **Seeded Randomness** - Prevent hydration mismatches
5. **Dynamic Imports** - Load Three.js only when needed
6. **Will-change hints** - GPU optimization
7. **Layout containment** - Isolate repaints
8. **Responsive images** - Next.js image optimization

---

## 🌍 Responsive Design

- **Mobile (< 768px)** - Single column, mobile menu, touch-optimized
- **Tablet (768px - 1024px)** - Two-column layout, larger cards
- **Desktop (1024px+)** - Three-column grid, full features

---

## 🔐 Security & Compliance

- SSL security badge
- GDPR compliant notation
- SOC2 mention
- No setup fees guarantee
- Cancel anytime guarantee
- Face recognition login available

---

## 📝 Translation Keys Reference

See `Desktop/office/src/i18n/locales/` for full translation files:
- `en.json` - English translations
- `ru.json` - Russian translations
- `hy.json` - Armenian translations

Common key prefixes:
- `landing.*` - Landing page main content
- `landingExtra.*` - Additional landing page content
- `pricing.*` - Pricing section
- `faq.*` - FAQ section
- `testimonials.*` - Testimonials section
- `newsletter.*` - Newsletter section
- `mobileMenu.*` - Mobile menu labels

---

## 📌 Notes

- All components use `'use client'` directive (client-side rendering)
- Animations trigger on scroll using IntersectionObserver
- Theme switching uses Next.js built-in theme support
- Stripe integration for payments
- Multi-language support with i18n
- Accessibility features: ARIA labels, semantic HTML, keyboard navigation
- Dark mode support with CSS variables

