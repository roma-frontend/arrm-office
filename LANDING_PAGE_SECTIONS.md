# Landing Page - Section-by-Section Breakdown

## 1️⃣ NAVBAR (Fixed at Top)

**Component:** Part of `LandingClient.tsx` → `Navbar()` function

**Content:**
- Logo: "HRLeave" (with gradient styling)
- Navigation Links (desktop only):
  - Features → `#features`
  - Pricing → `#pricing`
  - Testimonials → `#testimonials`
  - FAQ → `#faq`
- Theme Toggle: Sun/Moon icons
- Language Switcher: Dropdown with locale options
- User Menu (if logged in):
  - Avatar with initials
  - Dropdown with:
    - Profile → `/app/profile`
    - Dashboard → `/app/dashboard`
    - Settings → `/app/settings`
    - Logout
- Mobile Menu Button: Hamburger icon (visible on mobile/tablet)
- Auth Buttons (if not logged in):
  - Sign In → `/login` (text link)
  - Get Started → `/register` (gradient button)

**Styling:**
- Fixed position, z-index: 50
- Glass morphism with backdrop blur
- Gradient buttons
- Responsive: Nav links hidden on mobile (< lg)

**Key Classes:**
```tsx
h-16                           // Height: 64px
fixed top-0 left-0 right-0     // Fixed positioning
z-50                           // Above other content
backdrop-blur-xl               // Glass effect
border-b                       // Bottom border
```

---

## 2️⃣ HERO SECTION (Main Banner)

**Component:** Part of `LandingClient.tsx` → `HeroSection()` function

**Visual Elements:**
```
┌─────────────────────────────────────────┐
│         ✨ Exclusive HR Platform         │ ← Badge (animated pulse)
│                                         │
│     TRANSFORM YOUR HR WORKFLOWS         │ ← Main Title (staggered fade-in)
│                                         │
│  Manage leaves, attendance, and...      │ ← Subtitle (animated)
│                                         │
│  [Go to Dashboard] [Get Started Free]   │ ← CTA Buttons
│  or [Sign In]                           │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ Trusted by Acme Corp, GlobalTech...     │ ← Social Proof
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                         │
│           ↓ scroll ↓                    │ ← Scroll indicator
└─────────────────────────────────────────┘
```

**Content:**
- Badge: "✨ Exclusive HR Platform" (glowing, pulsing dot)
- Main Headline: Translation key `landing.heroTitle`
- Subtitle: Translation key `landing.heroSubtitle`
- CTA Buttons (conditional):
  - If logged in: 
    - "Go to Dashboard" → `/app/dashboard`
    - "View Analytics" → `/app/dashboard/analytics`
  - If not logged in:
    - "Get Started Free" → `/register` (primary gradient)
    - "Sign In" → `/login` (secondary)
- Trusted Companies: 5 text logos (Acme Corp, GlobalTech, NovaSoft, etc.)
- Scroll Indicator: Animated down arrow

**Animations:**
- Badge: `hero-fade-1` (fade in from transparent)
- Title words: `hero-word-1`, `hero-word-2` (staggered)
- Subtitle: `hero-subtitle-line` (slide up)
- Buttons: Hover scale + shadow
- Scroll line: Gradient line animation

**Styling:**
- Min height: `min-h-screen`
- Flex centered: `flex flex-col items-center justify-center`
- Padding: `pt-56 pb-20 px-6`
- Background: Gradient orbs (fixed position)

---

## 3️⃣ SOCIAL PROOF (Companies Section)

**Component:** `SocialProof.tsx` (lazy loaded)

**Content:**
```
┌─────────────────────────────────────────┐
│  TRUSTED BY   Acme Corp  GlobalTech    │
│             NovaSoft  Meridian Co.      │
│             Apex Industries             │
└─────────────────────────────────────────┘
```

**Features:**
- Text-based company logos (no images currently)
- Horizontal scrolling on mobile
- Subtle animations on hover
- Gray text with low opacity

---

## 4️⃣ STATS SECTION (By the Numbers)

**Component:** Part of `LandingClient.tsx` → `StatsSection()` function

**Layout:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      BY THE NUMBERS
  TRUSTED AT SCALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────┬─────────────┬─────────────┬──────────────┐
│     📊      │     ✓       │      ⏰      │      📈      │
│    500+     │     99%     │      24      │   Advanced   │
│ Employees   │  Accuracy   │  Real-time   │  Analytics   │
└─────────────┴─────────────┴─────────────┴──────────────┘
```

**Data:**
- **Card 1:** 500+ | Employees Tracked | `<Users />` icon | Blue background
- **Card 2:** 99% | Accuracy | `<CheckCircle2 />` icon | Light blue background
- **Card 3:** 24 | Real-time Tracking | `<Activity />` icon | Cyan background
- **Card 4:** Advanced | Analytics | `<BarChart3 />` icon | Sky blue background

**Component:** `StatsCard.tsx`
- Props: `value`, `label`, `icon`, `color`, `delay`
- Features:
  - Count-up animation (triggered on scroll)
  - Hover: Scale up 1.03x, translate up, glow
  - Icon spinner animation
  - Shimmer top border

**Styling:**
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- Cards: Rounded glass effect with gradient backgrounds
- Spacing: `gap-6`

---

## 5️⃣ FEATURES SECTION (Leave Types)

**Component:** Part of `LandingClient.tsx` → `FeaturesSection()` function

**Section Header:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    LEAVE TYPES
  EVERY LEAVE TYPE
  PERFECTLY MANAGED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Everything from vacation to sick leave,
family events to doctor visits—all in one place.
```

**Features (4 Cards):**

### Feature 1: Vacation Tracking
- Icon: `<Calendar />`
- Title: `landing.vacationTracking`
- Description: `landing.vacationDesc`
- Badge: "Most Used"
- Gradient: Blue gradient
- Accent Color: `#2563eb` (blue)

### Feature 2: Sick Leave
- Icon: `<Heart />`
- Title: `landing.sickLeave`
- Description: `landing.sickLeaveDesc`
- Badge: "Policy Aware"
- Gradient: Cyan gradient
- Accent Color: `#60a5fa` (light blue)

### Feature 3: Family Leave
- Icon: `<Users />`
- Title: `landing.familyLeave`
- Description: `landing.familyLeaveDesc`
- Badge: "Compliance Ready"
- Gradient: Slate gradient
- Accent Color: `#94a3b8` (gray)

### Feature 4: Doctor Visits
- Icon: `<Stethoscope />`
- Title: `landing.doctorVisits`
- Description: `landing.doctorVisitsDesc`
- Badge: "Premium"
- Gradient: Light blue gradient
- Accent Color: `#93c5fd` (light blue)

**Component:** `FeatureCard.tsx`
- Hover effects:
  - Glow around card
  - Icon rotates 3°
  - Arrow appears at bottom
  - Scale 1.02x
- IntersectionObserver reveals on scroll

**Styling:**
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- Cards: Rounded-3xl, glass morphism, `p-7`
- Spacing: `gap-6`

---

## 6️⃣ PRICING SECTION

**Component:** `PricingPreview.tsx` (lazy loaded)

**Section Header:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    PRICING
  TRANSPARENT,
  FLEXIBLE PRICING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Simple, transparent pricing that scales with your organization.
All plans include 24/7 support, analytics, and compliance tools.

✓ SSL Secured  ✓ No Setup Fees  ✓ Cancel Anytime  ✓ GDPR Compliant
```

**Pricing Tiers (3 Cards):**

### Tier 1: FREE
- Name: "Free"
- Price: "$0" / month
- Button: "Start free trial"
- Features: (basic features listed)
- Button Style: Secondary (no gradient)
- Accent: Light blue

### Tier 2: PROFESSIONAL (Featured)
- Name: "Professional"
- Price: "$49" / month
- Button: "Start free trial" (highlighted)
- Features: (all features)
- Button Style: Primary gradient (blue to light blue)
- Accent: Purple/Indigo
- Highlighted: Slightly larger, elevated shadow

### Tier 3: ENTERPRISE
- Name: "Enterprise"
- Price: "Custom" / month
- Button: "Contact sales"
- Features: (premium features)
- Button Style: Secondary
- Accent: Slate/Gray

**Features:**
- Current plan highlighting (if user logged in)
- Loading state on button click
- Shimmer effect on hover
- Trust badges at bottom

**Styling:**
- Grid: `grid-cols-1 md:grid-cols-3`
- Featured tier: Larger, `scale-105`, higher z-index
- Spacing: `gap-6`
- Gradient backgrounds on buttons

---

## 7️⃣ TESTIMONIALS SECTION

**Component:** `TestimonialsSection.tsx` (lazy loaded)

**Section Header:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    LOVED BY TEAMS
  TRUSTED BY
  INDUSTRY LEADERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
See what industry leaders are saying about HRLeave.
```

**Testimonials (3 Cards):**

### Testimonial 1: Sarah Johnson
- Name: "Sarah Johnson"
- Role: "HR Director"
- Company: "TechCorp Inc."
- Avatar: Empty (shows initials "SJ" in gradient)
- Rating: ⭐⭐⭐⭐⭐
- Quote: "HRLeave transformed our leave management process. What used to take hours now takes minutes. The analytics are incredible!"
- Gradient: Indigo/Purple

### Testimonial 2: Michael Chen
- Name: "Michael Chen"
- Role: "Operations Manager"
- Company: "GlobalTech"
- Avatar: Empty (shows initials "MC" in gradient)
- Rating: ⭐⭐⭐⭐⭐
- Quote: "The real-time tracking and automated approvals have saved us countless hours. Best HR tool we've ever used."
- Gradient: Indigo/Blue

### Testimonial 3: Emily Rodriguez
- Name: "Emily Rodriguez"
- Role: "Chief People Officer"
- Company: "Innovate LLC"
- Avatar: Empty (shows initials "ER" in gradient)
- Rating: ⭐⭐⭐⭐⭐
- Quote: "Finally, a leave management system that employees actually love to use. The face recognition login is a game-changer!"
- Gradient: Slate

**Component:** `TestimonialCard.tsx`
- Hover: Lift effect (translate -Y 8px)
- Glow on hover
- Quote icon decoration
- Star ratings (yellow)
- Avatar with fallback initials

**Styling:**
- Grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Cards: Rounded-2xl, glass morphism, `p-6`
- Spacing: `gap-6`

---

## 8️⃣ FAQ SECTION

**Component:** `FAQSection.tsx` (lazy loaded)

**Section Header:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    FREQUENTLY ASKED QUESTIONS
  GOT QUESTIONS?
  WE HAVE ANSWERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Everything you need to know about HRLeave.
```

**FAQ Items (6 items):**

Each item has:
- Question: Translation key `faq.q1` - `faq.q6`
- Answer: Translation key `faq.a1` - `faq.a6`
- Toggle: Click to expand/collapse
- Icon: Plus (+) when closed, Minus (-) when open
- Animation: Smooth height transition

**Interaction:**
- Click question to expand
- Icon rotates 180°
- Answer slides down with fade-in
- Max height: 400px with overflow hidden

**After FAQ:**
```
Still have questions?
[Contact our support team] → mailto:support@hrleave.com
```

**Styling:**
- Container: Rounded-2xl glass, `p-6 md:p-8`
- Border: Bottom border separates items
- Spacing: `py-5` per item

---

## 9️⃣ NEWSLETTER SECTION

**Component:** `NewsletterSection.tsx` (lazy loaded)

**Layout:**
```
┌─────────────────────────────────────┐
│                                     │
│    📬 (with float animation)        │
│                                     │
│  STAY UPDATED                       │
│  Join thousands receiving updates   │
│  about new features and tips.       │
│                                     │
│  [Email input field] [Subscribe]   │
│                                     │
│  ✓ Success message (toast)          │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Email input field with placeholder
- Submit button with arrow icon
- Email validation (must contain @)
- Loading state: Spinner on button
- Success state: Shows checkmark
- Toast notifications:
  - Error: "Invalid email"
  - Success: "Thank you for subscribing!"
- Form resets after submission
- Background glow effect (blue/gradient)

**Styling:**
- Rounded-3xl, glass morphism
- Centered: `max-w-3xl mx-auto`
- Padding: `p-8 md:p-12`
- Mail icon: Gradient background, float animation
- Input: Full width, glass style

---

## 🔟 CTA BANNER (Call-to-Action)

**Component:** Part of `LandingClient.tsx` → `CTABanner()` function

**Layout:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            🌟 READY TO TRANSFORM 🌟
        YOUR ORGANIZATION?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Join thousands of teams managing leaves effortlessly.

[Leave Management] [Employee Directory]
        [Get Started Free] [Sign In]
```

**Content:**
- Title: `landingExtra.ctaTitle` + highlight `landingExtra.ctaTitleHighlight`
- Subtitle: `landingExtra.ctaSubtitle`
- Feature pills:
  - "🍃 Leaves" → `/app/leaves`
  - "👥 Employees" → `/app/employees`
- CTA Buttons (conditional):
  - If logged in:
    - "Go to Dashboard" → `/app/dashboard`
    - "View Analytics" → `/app/analytics`
  - If not logged in:
    - "Get Started Free" → `/register` (primary)
    - "Sign In" → `/login` (secondary)

**Styling:**
- Background: Radial gradient orbs
- Centered text
- Padding: `py-24`
- Feature pills: Rounded, glass morphism

---

## 1️⃣1️⃣ FOOTER

**Component:** Part of `LandingClient.tsx` → `Footer()` function

**Layout:**
```
┌─────────────────────────────────────────────┐
│  HRLeave    (with gradient branding)        │
├─────────────────────────────────────────────┤
│                                             │
│  PRODUCT          PLATFORM        ACCOUNT  │
│  · Features       · Integrations  · Login  │
│  · Pricing        · API           · Signup │
│  · Security       · Status        · Billing│
│                                             │
│           LEGAL                            │
│           · Privacy Policy                 │
│           · Terms of Service               │
│           · Cookie Preferences             │
│                                             │
├─────────────────────────────────────────────┤
│  © 2024-2025 HRLeave. All rights reserved  │
│  ✓ SSL Secured  |  ✓ GDPR Compliant  |  ✓ SOC2  │
└─────────────────────────────────────────────┘
```

**Sections:**

### Product Column
- Translation key: `landingExtra.footerProduct`
- Links:
  - Features → `#features`
  - Pricing → `#pricing`
  - Security → `/security`

### Platform Column
- Translation key: `landingExtra.footerPlatform`
- Links:
  - Integrations → `/integrations`
  - API → `/api`
  - Status → `/status`

### Account Column
- Translation key: `landingExtra.footerAccount`
- Links:
  - Login → `/login`
  - Signup → `/register`
  - Billing → `/billing`

### Legal Column
- Translation key: `landingExtra.footerLegal`
- Links:
  - Privacy → `/privacy`
  - Terms → `/terms`
  - Cookies → `/cookies`

**Bottom Section:**
- Copyright: `landingExtra.footerCopyright` (year auto-updated)
- Trust badges:
  - 🔒 SSL Secured → `landingExtra.footerSsl`
  - ✓ GDPR Compliant → `landingExtra.footerGdprCompliant`
  - ✓ SOC2 Certified → `landingExtra.footerSoc2`

**Styling:**
- Background: Semi-transparent, slight blur
- Grid: `grid-cols-2 md:grid-cols-4` for link columns
- Spacing: `py-20 px-6`
- Bottom padding: Extra space for mobile

---

## 1️⃣2️⃣ MOBILE MENU (Overlay)

**Component:** `MobileMenu.tsx` (triggered by hamburger icon on mobile/tablet)

**Layout:**
```
┌─────────────────────────┐
│ HRLeave          [✕]    │  ← Header with close button
├─────────────────────────┤
│ 🏠 Home                 │
│ ✨ Features             │  ← Staggered fade-in
│ 📊 Analytics            │     on open
│ 💵 Pricing              │
│ ℹ️  About                │
├─────────────────────────┤
│   [Language Switcher]   │
│                         │
│ [Sign In] (secondary)   │  ← Fixed at bottom
│ [Get Started Free] (primary) │
└─────────────────────────┘
```

**Features:**
- Slide-in from right: `transform: translateX()`
- Dark backdrop overlay: `bg-black/60 backdrop-blur-sm`
- Close button (X icon) in header
- Keyboard: Close on Escape key
- Body scroll: Locked while open (`overflow: hidden`)
- Menu items animate in staggered (0.1s, 0.15s, 0.2s, etc.)

**Menu Items:**
- Home → `#home`
- Features → `#features`
- Analytics → `#analytics`
- Pricing → `#pricing`
- About → `#about`

**Footer CTA:**
- Language Switcher
- Sign In button → `/login`
- Get Started Free button → `/register` (gradient)

**Styling:**
- Width: `w-[80%] max-w-sm`
- Position: `fixed top-0 right-0 bottom-0` (full height from right)
- Z-index: 70 (above backdrop at 60)
- Transition: 0.35s cubic-bezier

---

## 🎨 BACKGROUND & DECORATIVE ELEMENTS

### Gradient Orbs (Fixed Background)
- **Orb 1:** Top-left, large (700px), blue tint
- **Orb 2:** Top-right, medium (600px), indigo tint
- **Orb 3:** Bottom-left, medium (500px), cyan tint
- All: `blur(80px)`, `filter: blur()`, `z-index: 0`
- CSS animations: Pulsing effect

### Floating Particles
- **12 Particles** in background
- Pure CSS animation
- Colors: Blue, purple, green variants
- Random positions across viewport
- Durations: 15-35 seconds
- No JavaScript cost (CSS compositor)

### Scroll Hints
- Animated down arrow in hero
- "Scroll to discover" text

---

## 📊 Content Summary

| Section | # Items | Type | Lazy Load |
|---------|---------|------|-----------|
| Navbar | 1 | Navigation | No |
| Hero | 1 | Banner | No |
| Social Proof | 5 | Text | Yes |
| Stats | 4 | Cards | No |
| Features | 4 | Cards | No |
| Pricing | 3 | Cards | Yes |
| Testimonials | 3 | Cards | Yes |
| FAQ | 6 | Accordion | Yes |
| Newsletter | 1 | Form | Yes |
| CTA Banner | 1 | Banner | No |
| Footer | 4+ | Links | No |
| Mobile Menu | 5 | Nav items | No (conditional) |

---

## 🎯 Total Content Statistics

- **Total Sections:** 12 major sections
- **Total Cards:** 19 (4 stats + 4 features + 3 pricing + 3 testimonials + 5 other)
- **Total FAQ Items:** 6
- **Total Footer Links:** 12+
- **Total CTA Buttons:** 20+
- **Animations:** 15+ CSS classes
- **Translation Keys:** 100+

