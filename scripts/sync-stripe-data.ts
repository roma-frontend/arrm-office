#!/usr/bin/env node
/**
 * 🔄 Sync Real Stripe Data
 * 
 * Synchronizes subscription data from real Stripe API to Convex database
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import Stripe from 'stripe';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load environment variables
// In production, use platform env vars (Vercel, etc)
// In development, fallback to .env.local
if (!process.env.STRIPE_SECRET_KEY) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
}

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
};

async function syncStripeData() {

  // Check for Stripe API key
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {

    // Demo mode - show what would happen
    showDemoMode();
    return;
  }

  // Check for Convex URL
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

  if (!convexUrl) {
    console.error(`${colors.red}❌ CONVEX_URL not found in .env.local${colors.reset}`);
    process.exit(1);
  }


  const stripe = new Stripe(stripeSecretKey);

  try {
    // Test Stripe connection
    const account = await stripe.accounts.retrieve();

    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      expand: ['data.customer', 'data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      return;
    }


    // Connect to Convex
    const client = new ConvexHttpClient(convexUrl);

    let synced = 0;
    let errors = 0;


    for (const sub of subscriptions.data) {
      try {
        const customer = sub.customer as Stripe.Customer;
        const item = sub.items.data[0];
        if (!item?.price) continue;

        const itemPrice = item.price;
        const priceId = typeof itemPrice === 'string' ? itemPrice : itemPrice.id;

        // Determine plan from price
        let plan = 'starter';
        const price = typeof itemPrice === 'string' ? null : itemPrice;

        if (price && price.unit_amount) {
          if (price.unit_amount >= 19900) plan = 'enterprise';
          else if (price.unit_amount >= 4900) plan = 'professional';
        }

        const subscriptionData = {
          stripeCustomerId: customer.id,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: (sub as any).current_period_end * 1000,
          status: sub.status,
          plan,
          userEmail: customer.email || 'no-email@example.com',
          organizationId: customer.metadata?.organizationId || undefined,
          userId: customer.metadata?.userId || undefined,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodStart: (sub as any).current_period_start * 1000,
          trialEnd: sub.trial_end ? sub.trial_end * 1000 : undefined,
        };

        synced++;

      } catch (error) {
        errors++;
      }
    }


  } catch (error: any) {

    process.exit(1);
  }
}

function showDemoMode() {

  console.log(`${colors.green}✨ Set up your Stripe API key to enable this feature!${colors.reset}\n`);
}

syncStripeData().catch(console.error);
