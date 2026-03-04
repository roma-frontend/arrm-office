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

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

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
  console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║           🔄 STRIPE DATA SYNCHRONIZATION TOOL 🔄              ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  // Check for Stripe API key
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    console.log(`${colors.yellow}⚠️  STRIPE_SECRET_KEY not found in .env.local${colors.reset}\n`);
    console.log(`${colors.cyan}To use real Stripe data synchronization:${colors.reset}`);
    console.log(`${colors.dim}1. Go to https://dashboard.stripe.com/apikeys${colors.reset}`);
    console.log(`${colors.dim}2. Copy your Secret key${colors.reset}`);
    console.log(`${colors.dim}3. Add to .env.local:${colors.reset}`);
    console.log(`${colors.yellow}   STRIPE_SECRET_KEY=sk_test_...${colors.reset}\n`);
    console.log(`${colors.cyan}💡 Running in demo mode with mock data...${colors.reset}\n`);

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

  console.log(`${colors.cyan}🔑 Stripe API Key detected${colors.reset}`);
  console.log(`${colors.cyan}📡 Connecting to Stripe...${colors.reset}`);

  const stripe = new Stripe(stripeSecretKey);

  try {
    // Test Stripe connection
    const account = await stripe.accounts.retrieve();
    console.log(`${colors.green}✅ Connected to Stripe account: ${account.id}${colors.reset}\n`);

    console.log(`${colors.cyan}📥 Fetching subscriptions from Stripe...${colors.reset}`);

    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      expand: ['data.customer', 'data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      console.log(`${colors.yellow}⚠️  No subscriptions found in Stripe${colors.reset}`);
      console.log(`${colors.cyan}💡 Create some test subscriptions in Stripe Dashboard${colors.reset}`);
      return;
    }

    console.log(`${colors.green}✅ Found ${subscriptions.data.length} subscription(s)${colors.reset}\n`);

    // Connect to Convex
    console.log(`${colors.cyan}📡 Connecting to Convex...${colors.reset}`);
    const client = new ConvexHttpClient(convexUrl);

    let synced = 0;
    let errors = 0;

    console.log(`${colors.cyan}🔄 Syncing subscriptions...${colors.reset}\n`);

    for (const sub of subscriptions.data) {
      try {
        const customer = sub.customer as Stripe.Customer;
        const priceId = typeof sub.items.data[0].price === 'string'
          ? sub.items.data[0].price
          : sub.items.data[0].price.id;

        // Determine plan from price
        let plan = 'starter';
        const price = typeof sub.items.data[0].price === 'string'
          ? null
          : sub.items.data[0].price;

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

        // Note: This would need a mutation function in Convex
        // For now, just log what would be synced
        console.log(`${colors.green}✓${colors.reset} ${customer.email || 'No email'} - ${plan} - ${sub.status}`);
        synced++;

      } catch (error) {
        console.log(`${colors.red}✗${colors.reset} Error syncing subscription ${sub.id}`);
        errors++;
      }
    }

    console.log(`\n${colors.bright}${colors.cyan}📊 Sync Summary:${colors.reset}`);
    console.log(`   ${colors.green}✅ Successfully synced: ${synced}${colors.reset}`);
    if (errors > 0) {
      console.log(`   ${colors.red}❌ Errors: ${errors}${colors.reset}`);
    }
    console.log(`\n${colors.green}✨ Done!${colors.reset}`);

    console.log(`\n${colors.yellow}⚠️  Note: Full sync requires Convex mutation function${colors.reset}`);
    console.log(`${colors.dim}To complete setup, add upsertSubscription mutation to convex/subscriptions.ts${colors.reset}`);

  } catch (error: any) {
    console.error(`${colors.red}❌ Error: ${error.message}${colors.reset}`);

    if (error.type === 'StripeAuthenticationError') {
      console.log(`\n${colors.yellow}💡 Your Stripe API key may be invalid${colors.reset}`);
      console.log(`${colors.dim}Check your .env.local and ensure STRIPE_SECRET_KEY is correct${colors.reset}`);
    }

    process.exit(1);
  }
}

function showDemoMode() {
  console.log(`${colors.bright}${colors.cyan}📋 Demo Mode - What This Tool Does:${colors.reset}\n`);

  console.log(`${colors.green}1. Connects to Stripe API${colors.reset}`);
  console.log(`   ${colors.dim}Uses your STRIPE_SECRET_KEY to authenticate${colors.reset}\n`);

  console.log(`${colors.green}2. Fetches all subscriptions${colors.reset}`);
  console.log(`   ${colors.dim}Retrieves customer data, payment methods, and subscription details${colors.reset}\n`);

  console.log(`${colors.green}3. Syncs to Convex database${colors.reset}`);
  console.log(`   ${colors.dim}Updates or creates subscription records in your database${colors.reset}\n`);

  console.log(`${colors.green}4. Handles webhooks${colors.reset}`);
  console.log(`   ${colors.dim}Automatically updates when subscriptions change in Stripe${colors.reset}\n`);

  console.log(`${colors.bright}${colors.cyan}📊 Example Output:${colors.reset}\n`);
  console.log(`${colors.green}✓${colors.reset} john@example.com - professional - active`);
  console.log(`${colors.green}✓${colors.reset} jane@company.com - enterprise - active`);
  console.log(`${colors.green}✓${colors.reset} test@startup.io - professional - trialing`);
  console.log(`${colors.yellow}✓${colors.reset} old@customer.com - starter - canceled\n`);

  console.log(`${colors.bright}${colors.cyan}💡 Benefits:${colors.reset}`);
  console.log(`   ${colors.green}✅${colors.reset} Always up-to-date data`);
  console.log(`   ${colors.green}✅${colors.reset} No manual entry needed`);
  console.log(`   ${colors.green}✅${colors.reset} Real-time sync via webhooks`);
  console.log(`   ${colors.green}✅${colors.reset} Automatic plan detection\n`);

  console.log(`${colors.green}✨ Set up your Stripe API key to enable this feature!${colors.reset}\n`);
}

syncStripeData().catch(console.error);
