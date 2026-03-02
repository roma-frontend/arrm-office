# Landing Page - Visual Map & Quick Reference

## 📍 File Location Map

```
Desktop/office/src/
│
├── app/
│   └── page.tsx ─────────────────────┐
│       (5 lines)                     │
│       Renders <LandingClient />     │
│                                     │
└── components/landing/ ◄─────────────┘
    │
    ├── 🎯 LandingClient.tsx (968 lines) - MAIN COMPONENT
    │   ├── Navbar() - Fixed navigation
    │   ├── HeroSection() - Main banner
    │   ├── StatsSection() → uses StatsCard
    │   ├── FeaturesSection() → uses FeatureCard
    │   ├── CTABanner() - Call-to-action
    │   ├── Footer() - Footer links
    │   │
    │   └── Dynamic Imports:
    │       ├── FloatingParticles (57 lines)
    │       ├── SocialProof
    │       ├── PricingPreview (377 lines)
    │       ├── TestimonialsSection (117 lines)
    │       ├── FAQSection (147 lines)
    │       └── NewsletterSection (106 lines)
    │
    ├── 🎨 FeatureCard.tsx (134 lines) - Feature display card
    ├── 📊 StatsCard.tsx (108 lines) - Stat counter card
    ├── 💬 FAQSection.tsx (147 lines) - Accordion
    ├── 💰 PricingPreview.tsx (377 lines) - Pricing tiers
    ├── ⭐ TestimonialsSection.tsx (117 lines) - Reviews
    ├── 📧 NewsletterSection.tsx (106 lines) - Email signup
    ├── ✨ FloatingParticles.tsx (57 lines) - Background
    ├── 📱 MobileMenu.tsx (157 lines) - Mobile nav
    ├── 🏢 SocialProof.tsx - Trusted companies
    └── 🌐 SphereMesh.tsx (121 lines) - 3D sphere
```

---

## 🎯 Content Flow (Top to Bottom)

```
┌─────────────────────────────────────────────────────────────┐
│ 1️⃣ NAVBAR (Fixed) - Logo, Nav Links, Theme, User Menu      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 2️⃣ HERO SECTION - Headline, Subtitle, CTA Buttons          │
│    └─ Badge, Title, Subtitle, Buttons, Social Proof        │
│                                                              │
│ 3️⃣ SOCIAL PROOF - Trusted Companies                        │
│    └─ 5 Company logos                                       │
│                                                              │
│ 4️⃣ STATS SECTION - By the Numbers                          │
│    └─ 4 Stat Cards (500+, 99%, 24, Analytics)             │
│       Each card: Icon + Value + Label                       │
│                                                              │
│ 5️⃣ FEATURES SECTION - Leave Types                          │
│    └─ 4 Feature Cards                                       │
│       ├─ 1️⃣ Vacation Tracking (Calendar icon)             │
│       ├─ 2️⃣ Sick Leave (Heart icon)                        │
│       ├─ 3️⃣ Family Leave (Users icon)                      │
│       └─ 4️⃣ Doctor Visits (Stethoscope icon)              │
│       Each: Icon + Title + Description + Badge             │
│                                                              │
│ 6️⃣ PRICING SECTION                                         │
│    └─ 3 Pricing Cards                                       │
│       ├─ Free (Free)                                        │
│       ├─ Professional (Featured) ($49/mo)                   │
│       └─ Enterprise (Custom)                                │
│       Trust badges: SSL, No Fees, Cancel, GDPR              │
│                                                              │
│ 7️⃣ TESTIMONIALS SECTION                                    │
│    └─ 3 Testimonial Cards                                   │
│       Each: Avatar + Name + Role + Company + Stars + Quote  │
│                                                              │
│ 8️⃣ FAQ SECTION                                             │
│    └─ 6 FAQ Items (Expandable Accordion)                    │
│       Each: Question + Answer + Toggle Icon                 │
│                                                              │
│ 9️⃣ NEWSLETTER SECTION                                      │
│    └─ Email Input + Subscribe Button                        │
│       Icon + Title + Subtitle + Form + Toast               │
│                                                              │
│ 🔟 CTA BANNER                                              │
│    └─ Headline + Subtitle + Feature Pills + Buttons        │
│                                                              │
│ 1️⃣1️⃣ FOOTER                                                 │
│    └─ 4 Link Columns (Product, Platform, Account, Legal)   │
│       Trust Badges (SSL, GDPR, SOC2) + Copyright            │
│                                                              │
│ 1️⃣2️⃣ MOBILE MENU (Overlay, Hidden on Desktop)             │
│    └─ Nav Items + Language Switcher + CTA Buttons          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Component at a Glance

| Component | Lines | Type | Eager/Lazy | Purpose |
|-----------|-------|------|-----------|---------|
| LandingClient | 968 | Main | Eager | Orchestrates all sections |
| FeatureCard | 134 | Card | Eager | Displays features |
| StatsCard | 108 | Card | Eager | Shows statistics |
| FAQSection | 147 | Section | Lazy | Accordion Q&A |
| PricingPreview | 377 | Section | Lazy | Pricing tiers |
| TestimonialsSection | 117 | Section | Lazy | Customer reviews |
| NewsletterSection | 106 | Section | Lazy | Email signup |
| FloatingParticles | 57 | FX | Lazy | Background animation |
| MobileMenu | 157 | Menu | Eager | Mobile navigation |
| SphereMesh | 121 | 3D | Dynamic | 3D visualization |

---

## 🌍 Language Support

**Supported Languages:**
- 🇺🇸 English (en.json)
- 🇷🇺 Russian (ru.json)  
- 🇦🇲 Armenian (hy.json)

**Translation Keys:** 100+ keys organized by section

---

## 📱 Responsive Breakpoints

```
Mobile           Tablet          Desktop
(<768px)         (768-1024px)    (1024px+)
│                │               │
├─ 1 column      ├─ 2 columns    ├─ 3-4 columns
├─ Mobile menu   ├─ Mobile menu  ├─ Top nav
├─ Stack layout  ├─ Mix layout   ├─ Grid layout
└─ Touch BTN     ├─ Medium BTN   └─ Hover FX
```

---

## 🎬 Animation Types

```
Fade-in     ━━━━━━━━> Hero, Sections
Slide-up    ↑↑↑↑↑↑↑↑ Cards, Items
Count-up    0→500+   Stats counters
Scale       ⬌⬌⬌⬌ Hover effects
Rotate      ↻↻↻↻ Icons, Scroll
Shimmer     ✨✨✨ Buttons
Glow        💡💡💡 Card hovers
Float       ⬆️⬆️⬆️ Email icon
```

---

## 🔐 Auth Flow

```
Unauthenticated         Authenticated
│                       │
├─ Sign In button       ├─ Avatar
├─ Get Started button   ├─ Dropdown menu:
└─ /register path       │  ├─ Profile
                        │  ├─ Dashboard
                        │  ├─ Settings
                        │  └─ Logout
```

---

## 🎯 Key Stats

- **Total Files:** 11 components
- **Total Code:** ~2,368 lines
- **Total Sections:** 12
- **Total Cards:** 19
- **Translation Keys:** 100+
- **Supported Languages:** 3
- **Animations:** 15+ CSS classes
- **Performance Score:** Optimized

---

## 📋 Translation Key Categories

```
landing.*           → Hero, Features, Nav (20+ keys)
landingExtra.*      → Stats, CTA, Footer (25+ keys)
pricing.*           → Pricing section (20+ keys)
faq.*               → FAQ section (15+ keys)
testimonials.*      → Reviews (5+ keys)
newsletter.*        → Email signup (5+ keys)
mobileMenu.*        → Mobile nav (10+ keys)
```

---

## ✨ Key Features

✅ Responsive (mobile, tablet, desktop)
✅ Dark mode support
✅ Multi-language (3 languages)
✅ Accessible (ARIA, semantic HTML)
✅ Fast (lazy load, CSS animations)
✅ Authenticated UI
✅ Form validation
✅ Keyboard navigation
✅ Mobile menu
✅ Performance optimized

---

## 📚 Documentation Map

```
README (Start here) ───┐
                       │
    ┌───────────────────┴──────────────────┐
    │                                      │
STRUCTURE.md ──────────► Architecture
(Technical)             & Components
    
FILES_SUMMARY.md ──────► Quick Lookup
(Quick Ref)             & File Paths

SECTIONS.md ──────────► Visual Details
(Visual)                & Content

COMPLETE_GUIDE.md ────► Full Reference
(Comprehensive)        & Implementation
```

---

## 🚀 Quick Facts

- **Entry:** `src/app/page.tsx`
- **Main:** `LandingClient.tsx` (968 lines)
- **Components:** 11 files in `src/components/landing/`
- **Framework:** Next.js 15+
- **Styling:** Tailwind CSS + CSS variables
- **Icons:** Lucide React (150+)
- **i18n:** react-i18next
- **State:** Zustand
- **Animations:** Pure CSS (no Framer Motion)

