# Desktop/Office Project - Theme Configuration Summary

## Overview
The project uses a **next-themes** based dark/light theme system with comprehensive CSS variables defined in `globals.css`. There is **no separate theme configuration file** - all theme definitions are in CSS variables.

---

## Theme Provider Configuration

### Location: `src/app/layout.tsx` (lines 262-267)
```tsx
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem={true}
  disableTransitionOnChange
>
```

**Configuration Details:**
- **Attribute:** `class` - Applies theme by adding/removing `.dark` class to `<html>` element
- **Default Theme:** `system` - Respects user's OS preference
- **Enable System:** `true` - Auto-detects system dark/light preference
- **Disable Transition:** `true` - Prevents CSS transitions during theme switch

### Theme Provider Usage Components:
- `src/components/settings/AppearanceSettings.tsx` - User theme selection UI
- `src/components/layout/Navbar.tsx` - Theme toggle button (Sun/Moon icon)
- `src/components/landing/LandingClient.tsx` - Landing page theme toggle

---

## CSS Variables Definition

### Location: `src/app/globals.css`

All CSS variables are scoped to `:root` (light theme) and `.dark` (dark theme). The file is large (~993 lines) and contains extensive animations, but theme variables are defined in lines 3-272.

---

## LIGHT THEME - `:root` Section (Lines 55-162)

### Base Colors
```css
--background:          #f0f6ff;        /* Main page background - light sky blue */
--background-subtle:   #e8f0fe;        /* Subtle backgrounds - very light blue */
--foreground:          #0c1a2e;        /* Primary text color - dark navy */
```

### Card / Surface
```css
--card:                #ffffff;        /* Card backgrounds - pure white */
--card-hover:          #f0f6ff;        /* Card hover state - light blue */
--card-foreground:     #0c1a2e;        /* Card text - dark navy */
--card-border:         #c7d9f5;        /* Card borders - light blue */
```

### Popover
```css
--popover:             #ffffff;        /* Popover background - white */
--popover-foreground:  #0c1a2e;        /* Popover text - dark navy */
```

### Border & Input
```css
--border:              #c7d9f5;        /* Standard borders - light blue */
--border-subtle:       #e8f0fe;        /* Subtle borders - very light blue */
--input:               #ffffff;        /* Input field background - white */
--input-border:        #93bef7;        /* Input borders - medium light blue */
--ring:                #2563eb;        /* Focus ring color - primary blue */
```

### Primary (Main Brand Color)
```css
--primary:             #2563eb;        /* Primary blue - main brand color */
--primary-hover:       #1d4ed8;        /* Darker blue on hover */
--primary-foreground:  #ffffff;        /* Text on primary backgrounds - white */
```

### Secondary
```css
--secondary:           #e8f0fe;        /* Secondary background - light blue */
--secondary-foreground:#1e3a6e;        /* Secondary text - dark blue */
```

### Muted
```css
--muted:               #e8f0fe;        /* Muted backgrounds - light blue */
--muted-foreground:    #4a6fa5;        /* Muted text - medium blue-gray */
```

### Accent
```css
--accent:              #0ea5e9;        /* Accent color - cyan blue */
--accent-foreground:   #ffffff;        /* Text on accent - white */
```

### Loader
```css
--loader-color:        #1e40af;        /* Contrasting color for light theme */
```

### Semantic Colors (Status)
```css
--destructive:         #ef4444;        /* Error/Delete - red */
--destructive-foreground: #ffffff;     /* Error text - white */
--success:             #10b981;        /* Success - green */
--success-foreground:  #ffffff;        /* Success text - white */
--warning:             #f59e0b;        /* Warning - amber */
--warning-foreground:  #ffffff;        /* Warning text - white */
```

### Text Hierarchy
```css
--text-primary:        #0c1a2e;        /* Primary text - dark navy */
--text-secondary:      #1e3a6e;        /* Secondary text - darker blue */
--text-muted:          #4a6fa5;        /* Muted text - medium blue-gray */
--text-disabled:       #93bef7;        /* Disabled text - light blue */
```

### Sidebar
```css
--sidebar-bg:          #ffffff;        /* Sidebar background - white */
--sidebar-border:      #c7d9f5;        /* Sidebar border - light blue */
--sidebar-item-hover:  #e8f0fe;        /* Hover state - light blue */
--sidebar-item-active: rgba(37,99,235,0.1);     /* Active item - semi-transparent blue */
--sidebar-item-active-text: #2563eb;   /* Active item text - primary blue */
--sidebar-text:        #4a6fa5;        /* Sidebar text - medium blue-gray */
--sidebar-text-muted:  #93bef7;        /* Muted sidebar text - light blue */
```

### Navbar
```css
--navbar-bg:           rgba(255,255,255,0.88);  /* Navbar with transparency */
--navbar-border:       #c7d9f5;        /* Navbar border - light blue */
```

### Shadows
```css
--shadow:              0 1px 3px rgba(37,99,235,0.08), 0 1px 2px rgba(0,0,0,0.04);
--shadow-md:           0 4px 6px rgba(37,99,235,0.1), 0 2px 4px rgba(0,0,0,0.04);
--shadow-lg:           0 10px 15px rgba(37,99,235,0.1), 0 4px 6px rgba(0,0,0,0.04);
```

### Status Badges
```css
--status-approved-bg:    rgba(16,185,129,0.1);   /* Green background */
--status-approved-text:  #059669;                /* Green text */
--status-pending-bg:     rgba(245,158,11,0.1);   /* Amber background */
--status-pending-text:   #d97706;                /* Amber text */
--status-rejected-bg:    rgba(239,68,68,0.1);    /* Red background */
--status-rejected-text:  #dc2626;                /* Red text */
```

### Modal & Overlays
```css
--overlay-bg:            rgba(0, 0, 0, 0.4);    /* Semi-transparent overlay */
```

### Gradients & Special Effects
```css
--accent-gradient:       linear-gradient(135deg, #2563eb, #3b82f6);
--text-on-accent:        #ffffff;
--text-on-accent-secondary: rgba(255, 255, 255, 0.8);
```

### Landing Page (Light Theme)
```css
--landing-bg:            linear-gradient(135deg, #f0f6ff 0%, #e8f0fe 50%, #f0f6ff 100%);
--landing-text-primary:  #0c1a2e;
--landing-text-secondary: #1e3a6e;
--landing-text-muted:    #4a6fa5;
--landing-navbar-bg:     rgba(255,255,255,0.88);
--landing-navbar-bg-rgb: 255, 255, 255;
--landing-navbar-text:   #1e3a6e;
--landing-navbar-text-hover: #2563eb;
--landing-card-bg:       rgba(255,255,255,0.5);
--landing-card-border:   rgba(199,217,245,0.5);
--landing-gradient-from: #2563eb;
--landing-gradient-to:   #60a5fa;
--landing-orb-1:         rgba(37,99,235,0.15);
--landing-orb-2:         rgba(96,165,250,0.12);
--landing-orb-3:         rgba(56,189,248,0.1);
```

---

## DARK THEME - `.dark` Section (Lines 165-272)

### Base Colors
```css
--background:          #060e1e;        /* Main page background - very dark navy */
--background-subtle:   #0d1e38;        /* Subtle backgrounds - dark blue */
--foreground:          #e8f0fe;        /* Primary text color - light blue */
```

### Card / Surface
```css
--card:                #0d1e38;        /* Card backgrounds - dark blue */
--card-hover:          #112344;        /* Card hover state - slightly lighter blue */
--card-foreground:     #e8f0fe;        /* Card text - light blue */
--card-border:         #1a3460;        /* Card borders - medium dark blue */
```

### Popover
```css
--popover:             #0d1e38;        /* Popover background - dark blue */
--popover-foreground:  #e8f0fe;        /* Popover text - light blue */
```

### Border & Input
```css
--border:              #1a3460;        /* Standard borders - medium dark blue */
--border-subtle:       #0d1e38;        /* Subtle borders - dark blue */
--input:               #0d1e38;        /* Input field background - dark blue */
--input-border:        #2563eb;        /* Input borders - bright blue (prominent) */
--ring:                #60a5fa;        /* Focus ring color - lighter blue */
```

### Primary
```css
--primary:             #3b82f6;        /* Primary blue - lighter for dark theme */
--primary-hover:       #2563eb;        /* Darker blue on hover */
--primary-foreground:  #ffffff;        /* Text on primary - white */
```

### Secondary
```css
--secondary:           #0d1e38;        /* Secondary background - dark blue */
--secondary-foreground:#93c5fd;        /* Secondary text - light blue */
```

### Muted
```css
--muted:               #0d1e38;        /* Muted backgrounds - dark blue */
--muted-foreground:    #7ab3f5;        /* Muted text - light blue */
```

### Accent
```css
--accent:              #38bdf8;        /* Accent color - cyan (lighter) */
--accent-foreground:   #ffffff;        /* Text on accent - white */
```

### Loader
```css
--loader-color:        #60a5fa;        /* Bright color for dark theme */
```

### Semantic Colors (Status)
```css
--destructive:         #f87171;        /* Error - lighter red */
--destructive-foreground: #ffffff;     /* Error text - white */
--success:             #34d399;        /* Success - lighter green */
--success-foreground:  #ffffff;        /* Success text - white */
--warning:             #fbbf24;        /* Warning - lighter amber */
--warning-foreground:  #ffffff;        /* Warning text - white */
```

### Text Hierarchy
```css
--text-primary:        #e8f0fe;        /* Primary text - light blue */
--text-secondary:      #bdd4fa;        /* Secondary text - medium light blue */
--text-muted:          #7ab3f5;        /* Muted text - light blue */
--text-disabled:       #2d5a9e;        /* Disabled text - dark blue */
```

### Sidebar
```css
--sidebar-bg:          #060e1e;        /* Sidebar background - very dark navy */
--sidebar-border:      #0d1e38;        /* Sidebar border - dark blue */
--sidebar-item-hover:  #0d1e38;        /* Hover state - dark blue */
--sidebar-item-active: rgba(59,130,246,0.18);   /* Active item - semi-transparent blue */
--sidebar-item-active-text: #60a5fa;   /* Active item text - light blue */
--sidebar-text:        #7ab3f5;        /* Sidebar text - light blue */
--sidebar-text-muted:  #2d5a9e;        /* Muted sidebar text - dark blue */
```

### Navbar
```css
--navbar-bg:           rgba(6,14,30,0.88);     /* Navbar with transparency */
--navbar-border:       #0d1e38;        /* Navbar border - dark blue */
```

### Shadows
```css
--shadow:              0 1px 3px rgba(0,0,0,0.4);
--shadow-md:           0 4px 6px rgba(0,0,0,0.5);
--shadow-lg:           0 10px 15px rgba(0,0,0,0.6);
```

### Status Badges
```css
--status-approved-bg:    rgba(52,211,153,0.15);  /* Green background */
--status-approved-text:  #34d399;                /* Green text */
--status-pending-bg:     rgba(251,191,36,0.15);  /* Amber background */
--status-pending-text:   #fbbf24;                /* Amber text */
--status-rejected-bg:    rgba(248,113,113,0.15); /* Red background */
--status-rejected-text:  #f87171;                /* Red text */
```

### Modal & Overlays
```css
--overlay-bg:            rgba(0, 0, 0, 0.7);    /* Darker overlay for dark theme */
```

### Gradients & Special Effects
```css
--accent-gradient:       linear-gradient(135deg, #1e40af, #2563eb, #3b82f6);
--text-on-accent:        #ffffff;
--text-on-accent-secondary: rgba(255, 255, 255, 0.9);
```

### Landing Page (Dark Theme)
```css
--landing-bg:            linear-gradient(135deg, #060e1e 0%, #0d1e38 50%, #060e1e 100%);
--landing-text-primary:  #e8f0fe;
--landing-text-secondary: #bdd4fa;
--landing-text-muted:    #7ab3f5;
--landing-navbar-bg:     rgba(6,14,30,0.88);
--landing-navbar-bg-rgb: 6, 14, 30;
--landing-navbar-text:   #bdd4fa;
--landing-navbar-text-hover: #60a5fa;
--landing-card-bg:       rgba(13,30,56,0.4);
--landing-card-border:   rgba(26,52,96,0.3);
--landing-gradient-from: #2563eb;
--landing-gradient-to:   #93c5fd;
--landing-orb-1:         rgba(37,99,235,0.25);
--landing-orb-2:         rgba(96,165,250,0.2);
--landing-orb-3:         rgba(56,189,248,0.15);
```

---

## Theme Color Palette Summary

### Primary Brand Colors
| Element | Light Theme | Dark Theme |
|---------|-------------|-----------|
| Primary | `#2563eb` | `#3b82f6` |
| Primary Hover | `#1d4ed8` | `#2563eb` |
| Accent | `#0ea5e9` | `#38bdf8` |
| Focus Ring | `#2563eb` | `#60a5fa` |

### Text Colors
| Level | Light Theme | Dark Theme |
|-------|-------------|-----------|
| Primary Text | `#0c1a2e` | `#e8f0fe` |
| Secondary Text | `#1e3a6e` | `#bdd4fa` |
| Muted Text | `#4a6fa5` | `#7ab3f5` |
| Disabled Text | `#93bef7` | `#2d5a9e` |

### Surface Colors
| Surface | Light Theme | Dark Theme |
|---------|-------------|-----------|
| Background | `#f0f6ff` | `#060e1e` |
| Card | `#ffffff` | `#0d1e38` |
| Sidebar | `#ffffff` | `#060e1e` |
| Navbar | `rgba(255,255,255,0.88)` | `rgba(6,14,30,0.88)` |

### Status Colors (Consistent across themes)
| Status | Light | Dark |
|--------|-------|------|
| Success | `#10b981` | `#34d399` |
| Warning | `#f59e0b` | `#fbbf24` |
| Error | `#ef4444` | `#f87171` |

---

## Additional Theme Configuration Files

### 1. **Color Scheme Meta Tag** (`src/app/layout.tsx`, lines 61-68)
```tsx
themeColor: [
  { media: "(prefers-color-scheme: light)", color: "#2563eb" },
  { media: "(prefers-color-scheme: dark)", color: "#60a5fa" },
],
colorScheme: "light dark",
```

### 2. **HTML Color Scheme** (`src/app/globals.css`, lines 42-52)
```css
html {
  color-scheme: light dark;
}
html.dark {
  color-scheme: dark;
}
html.light {
  color-scheme: light;
}
```

---

## Theme Usage Patterns

### Using CSS Variables in Components
Components use CSS variables via `var()`:
```tsx
className="text-[var(--text-primary)] bg-[var(--card)]"
```

### Toggling Theme Programmatically
```tsx
import { useTheme } from "next-themes";

export function MyComponent() {
  const { theme, setTheme } = useTheme();
  
  // Toggle between dark and light
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };
  
  return <button onClick={toggleTheme}>Toggle Theme</button>;
}
```

### Available Theme Values
- `"light"` - Light theme
- `"dark"` - Dark theme
- `"system"` - Follow system preference

---

## Key Observations

1. **No Separate Theme Config File**: All theme definitions are in `globals.css` as CSS custom properties
2. **next-themes Library**: Uses industry-standard `next-themes` for theme management
3. **Comprehensive Variables**: 100+ CSS variables covering all UI aspects
4. **Semantic Theming**: Uses semantic names (primary, secondary, muted, etc.) instead of color names
5. **Landing Page Variants**: Separate set of variables for landing page styling
6. **Smooth Transitions**: Transitions are carefully controlled to avoid layout thrash
7. **Accessibility**: Respects `prefers-reduced-motion` media query
8. **System Detection**: Automatically detects OS dark mode preference

---

## Theme Toggle Locations

### User-Facing Theme Toggle
1. **Navbar** (`src/components/layout/Navbar.tsx`, line 347)
   - Sun/Moon icon button
   - Direct light/dark toggle (no "system" option in quick toggle)

2. **Appearance Settings** (`src/components/settings/AppearanceSettings.tsx`, line 101)
   - Three options: Light, Dark, System
   - Visual selection with icons

3. **Landing Page** (`src/components/landing/LandingClient.tsx`, line 210)
   - Theme toggle button for landing page visitors

---

## CSS Variables Reference by Use Case

### For Text
- Primary: `--text-primary`
- Secondary: `--text-secondary`
- Muted: `--text-muted`
- Disabled: `--text-disabled`

### For Backgrounds
- Main: `--background`
- Subtle: `--background-subtle`
- Card: `--card`

### For Borders
- Standard: `--border`
- Subtle: `--border-subtle`
- Input: `--input-border`

### For Interactive Elements
- Primary Button: `--primary` + `--primary-foreground`
- Accent: `--accent` + `--accent-foreground`
- Focus Ring: `--ring`

### For Status
- Success: `--success` + `--success-foreground`
- Warning: `--warning` + `--warning-foreground`
- Destructive: `--destructive` + `--destructive-foreground`

---

**File Generated:** Theme Configuration Analysis  
**Project:** Desktop/office  
**Last Updated:** Current Session
