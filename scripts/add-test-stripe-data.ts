#!/usr/bin/env node
/**
 * 🧪 Add Test Stripe Data
 * 
 * Adds sample Stripe subscription data for testing the viewer
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

async function main() {
  try {
    const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
    
    if (!deploymentUrl) {
      console.error(`${colors.red}❌ Error: CONVEX_URL not found${colors.reset}`);
      process.exit(1);
    }
    
    console.log(`${colors.cyan}🧪 Adding test Stripe subscription data...${colors.reset}\n`);
    
    const client = new ConvexHttpClient(deploymentUrl);
    
    // Test data
    const testSubscriptions = [
      {
        stripeCustomerId: 'cus_test_123456789',
        stripeSubscriptionId: 'sub_test_active_pro',
        plan: 'professional' as const,
        status: 'active' as const,
        email: 'john.doe@example.com',
        currentPeriodStart: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
        currentPeriodEnd: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days from now
        cancelAtPeriodEnd: false,
      },
      {
        stripeCustomerId: 'cus_test_987654321',
        stripeSubscriptionId: 'sub_test_trialing_starter',
        plan: 'starter' as const,
        status: 'trialing' as const,
        email: 'jane.smith@example.com',
        currentPeriodStart: Date.now() - 3 * 24 * 60 * 60 * 1000,
        currentPeriodEnd: Date.now() + 11 * 24 * 60 * 60 * 1000,
        trialEnd: Date.now() + 11 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      },
      {
        stripeCustomerId: 'cus_test_enterprise_001',
        stripeSubscriptionId: 'sub_test_enterprise_active',
        plan: 'enterprise' as const,
        status: 'active' as const,
        email: 'admin@bigcorp.com',
        currentPeriodStart: Date.now() - 20 * 24 * 60 * 60 * 1000,
        currentPeriodEnd: Date.now() + 10 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      },
      {
        stripeCustomerId: 'cus_test_canceled_002',
        stripeSubscriptionId: 'sub_test_canceled',
        plan: 'professional' as const,
        status: 'canceled' as const,
        email: 'former.customer@example.com',
        currentPeriodStart: Date.now() - 60 * 24 * 60 * 60 * 1000,
        currentPeriodEnd: Date.now() - 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: true,
      },
    ];
    
    for (const sub of testSubscriptions) {
      try {
        await client.mutation(api.subscriptions.upsertSubscription as any, sub);
        console.log(`${colors.green}✅ Added: ${sub.email} (${sub.plan} - ${sub.status})${colors.reset}`);
      } catch (error: any) {
        console.error(`${colors.red}❌ Failed to add ${sub.email}: ${error.message}${colors.reset}`);
      }
    }
    
    console.log(`\n${colors.green}✨ Done! Run 'npm run stripe:view' to see the results${colors.reset}\n`);
    
  } catch (error: any) {
    console.error(`\n${colors.red}❌ Error: ${error.message}${colors.reset}\n`);
    process.exit(1);
  }
}

main();
