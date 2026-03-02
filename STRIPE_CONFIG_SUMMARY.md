# Stripe Configuration Summary

## 1. Environment Variables (.env.example)

Located at: `Desktop/office/.env.example`

### Stripe Keys Configuration
```
# Stripe Payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Note:** The `STRIPE_PRICE_STARTER` plan is currently **free** and does not require Stripe checkout.

---

## 2. Stripe Dashboard URL

### Primary Dashboard URL
```
https://dashboard.stripe.com/apikeys
```

This is the main URL referenced in the codebase for accessing Stripe API keys and configuration.

### Additional Dashboard Resources
- **API Keys Page**: `https://dashboard.stripe.com/apikeys`
- **General Dashboard**: `https://dashboard.stripe.com`

**Important:** There is **NO `STRIPE_DASHBOARD_URL` constant** defined in the codebase. The URL is hardcoded as a reference in documentation and scripts.

---

## 3. Stripe Integration Files

### API Routes
1. **Checkout Handler**: `src/app/api/stripe/checkout/route.ts`
   - Handles Stripe Checkout Session creation
   - Supports subscription mode with 14-day trial period
   - Uses `STRIPE_PRICE_PROFESSIONAL` for paid plans
   - Starter plan redirects to direct signup (free)

2. **Webhook Handler**: `src/app/api/stripe/webhook/route.ts`
   - Processes Stripe events
   - Handles: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Updates Convex database with subscription data

### Dashboard Pages
- **Stripe Dashboard Page**: `src/app/admin/stripe-dashboard/page.tsx`
  - Displays subscription information
  - Shows metrics: active subscriptions, MRR, churn rate
  - Lists all subscriptions with Stripe customer/subscription IDs

### Hooks & Utilities
- **useSubscription Hook**: `src/hooks/useSubscription.ts` and `src/lib/hooks/useSubscription.ts`
  - Provides subscription data including:
    - `stripeCustomerId`
    - `stripeSubscriptionId`

### Components Using Stripe
- **UpgradeModal**: `src/components/subscription/UpgradeModal.tsx`
  - Calls `/api/stripe/checkout` endpoint
  
- **PricingPreview**: `src/components/landing/PricingPreview.tsx`
  - Calls `/api/stripe/checkout` endpoint

---

## 4. Scripts for Stripe Management

Located at: `Desktop/office/scripts/`

### Key Scripts
1. **sync-stripe-data.ts** - Synchronizes real Stripe data to Convex
2. **add-test-stripe-data.ts** - Adds test subscription data
3. **create-stripe-price.sh** - Creates Stripe price objects
4. **export-stripe-to-excel.ts** - Exports subscription data to Excel
5. **export-stripe-to-pdf.ts** - Exports subscription data to PDF
6. **stripe-growth-chart.ts** - Generates growth charts
7. **check-trial-reminders.ts** - Checks trial period reminders
8. **view-stripe-transactions.ts** - Views transaction data

### Available NPM Commands
```bash
npm run stripe:sync              # Synchronize Stripe data
npm run stripe:add-test-data     # Add test data
npm run stripe:create-price      # Create price in Stripe
npm run stripe:export            # Export to Excel
npm run stripe:export-pdf        # Export to PDF
npm run stripe:growth-chart      # Generate growth chart
npm run stripe:check-trials      # Check trial periods
npm run stripe:view              # View transactions
```

---

## 5. Database Schema Integration

### Subscription Fields Stored in Convex
- `stripeCustomerId`: Stripe customer identifier
- `stripeSubscriptionId`: Stripe subscription identifier
- `stripePriceId`: Stripe price identifier
- `stripeCurrentPeriodEnd`: Subscription period end timestamp
- `stripeSessionId`: Checkout session identifier
- `status`: Subscription status (active, trialing, past_due, canceled)
- `cancelAtPeriodEnd`: Boolean for period-end cancellation
- `currentPeriodStart`: Period start timestamp
- `currentPeriodEnd`: Period end timestamp
- `plan`: Plan type (starter, professional, enterprise)

---

## 6. Pricing Plans

### Current Plan Structure
| Plan | Type | Trial | Stripe Support |
|------|------|-------|-----------------|
| **Starter** | Free | N/A | ❌ No (direct signup) |
| **Professional** | Paid | 14 days | ✅ Yes (via Stripe) |
| **Enterprise** | Paid | 14 days | ✅ Yes (via Stripe) |

---

## 7. Webhook Events Handled

The webhook handler (`src/app/api/stripe/webhook/route.ts`) processes:

1. **checkout.session.completed** - Creates initial subscription record
2. **customer.subscription.created** - Records new subscription
3. **customer.subscription.updated** - Updates subscription status
4. **customer.subscription.deleted** - Marks subscription as canceled
5. **invoice.payment_failed** - Updates status to past_due

---

## 8. Configuration Constants

### In Code
```typescript
// src/app/api/stripe/checkout/route.ts
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

const PLANS = {
  professional: { 
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL!, 
    name: 'Professional' 
  },
};
```

### No Constant Defined For
- ❌ `STRIPE_DASHBOARD_URL` - Not defined anywhere
- ❌ `STRIPE_PORTAL_URL` - Not defined anywhere

**Dashboard access is always via hardcoded URL: `https://dashboard.stripe.com`**

---

## 9. Documentation Files

Located at: `Desktop/office/_docs/stripe/`

- `STRIPE_COMPLETE_SYSTEM.md` - Complete system overview
- `STRIPE_ADVANCED_FEATURES.md` - Advanced features guide
- `STRIPE_CHEATSHEET.md` - Quick reference
- `STRIPE_COMMANDS.md` - Command reference
- `STRIPE_QUICK_START.md` - Quick start guide
- `STRIPE_NEW_FEATURES_QUICK_REF.md` - New features reference
- `STRIPE_SETUP_COMPLETE.md` - Setup completion guide

---

## 10. Key File Locations Summary

```
Desktop/office/
├── .env.example                              # Main Stripe keys config
├── src/
│   ├── app/
│   │   ├── admin/stripe-dashboard/page.tsx  # Dashboard UI
│   │   └── api/stripe/
│   │       ├── checkout/route.ts            # Checkout endpoint
│   │       └── webhook/route.ts             # Webhook handler
│   ├── components/
│   │   ├── subscription/UpgradeModal.tsx    # Upgrade UI
│   │   └── landing/PricingPreview.tsx       # Pricing UI
│   └── hooks/useSubscription.ts             # Subscription hook
├── scripts/
│   ├── sync-stripe-data.ts
│   ├── add-test-stripe-data.ts
│   └── [other Stripe scripts]
└── _docs/stripe/                            # Documentation
```

---

## 11. How Stripe is Used in the Application

### User Journey
1. User visits pricing page or clicks "Upgrade"
2. Component calls `/api/stripe/checkout` endpoint
3. Endpoint creates Stripe Checkout Session (14-day trial included)
4. User redirected to Stripe-hosted checkout
5. After payment, Stripe webhook triggers
6. Webhook updates Convex database with subscription data
7. User gains access to paid features via subscription hook

### Admin View
- Access internal dashboard at `/admin/stripe-dashboard`
- View all active subscriptions with Stripe IDs
- Monitor MRR, churn rate, and active subscription count
- Export data to Excel/PDF for reporting

---

## 12. Summary: No STRIPE_DASHBOARD_URL Constant

**Answer to your specific question:**

There is **NO** `STRIPE_DASHBOARD_URL` or similar constant defined anywhere in the codebase.

The only hardcoded Stripe dashboard URL found is:
```
https://dashboard.stripe.com/apikeys
```

This appears in:
- `scripts/sync-stripe-data.ts` (line 36) - in console messages
- `_docs/stripe/STRIPE_ADVANCED_FEATURES.md` - in documentation
- `_docs/stripe/STRIPE_NEW_FEATURES_QUICK_REF.md` - in documentation

**Recommendation:** If you need to link to the Stripe dashboard, create a constant:
```typescript
export const STRIPE_DASHBOARD_URL = 'https://dashboard.stripe.com';
export const STRIPE_API_KEYS_URL = 'https://dashboard.stripe.com/apikeys';
```
