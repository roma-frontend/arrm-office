#!/usr/bin/env node
/**
 * 🎨 Beautiful Stripe Transactions Viewer
 * 
 * Displays all Stripe subscriptions from the Convex database
 * in a beautiful, color-coded table format.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import Stripe from 'stripe';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ANSI color codes for beautiful terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Text colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Status colors
const statusColors = {
  trialing: colors.cyan,
  active: colors.green,
  past_due: colors.yellow,
  canceled: colors.red,
  incomplete: colors.magenta,
};

// Plan colors
const planColors = {
  starter: colors.blue,
  professional: colors.magenta,
  enterprise: colors.yellow,
};

function formatDate(timestamp?: number): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStatus(status: string): string {
  const color = statusColors[status as keyof typeof statusColors] || colors.white;
  const emoji = {
    trialing: '🆓',
    active: '✅',
    past_due: '⚠️',
    canceled: '❌',
    incomplete: '⏳',
  }[status] || '❓';
  
  return `${color}${emoji} ${status.toUpperCase()}${colors.reset}`;
}

function formatPlan(plan: string): string {
  const color = planColors[plan as keyof typeof planColors] || colors.white;
  const emoji = {
    starter: '🚀',
    professional: '💼',
    enterprise: '🏢',
  }[plan] || '📦';
  
  return `${color}${emoji} ${plan.charAt(0).toUpperCase() + plan.slice(1)}${colors.reset}`;
}

function printHeader() {
  console.log('\n' + colors.bright + colors.cyan + '╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    💳 STRIPE TRANSACTIONS DASHBOARD 💳                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝' + colors.reset + '\n');
}

function printSeparator() {
  console.log(colors.dim + '─'.repeat(100) + colors.reset);
}

async function printSubscription(sub: any, index: number, stripe: Stripe) {
  const periodStart = formatDate(sub.currentPeriodStart);
  const periodEnd = formatDate(sub.currentPeriodEnd);
  const created = formatDate(sub.createdAt);
  const updated = formatDate(sub.updatedAt);
  
  console.log(`\n${colors.bright}${colors.white}#${index + 1}${colors.reset}`);
  console.log(`${colors.bright}Plan:${colors.reset}                ${formatPlan(sub.plan)}`);
  console.log(`${colors.bright}Status:${colors.reset}              ${formatStatus(sub.status)}`);
  console.log(`${colors.bright}Email:${colors.reset}               ${colors.cyan}${sub.email || 'N/A'}${colors.reset}`);
  console.log(`${colors.bright}Stripe Customer ID:${colors.reset}  ${colors.yellow}${sub.stripeCustomerId}${colors.reset}`);
  console.log(`${colors.bright}Subscription ID:${colors.reset}     ${colors.yellow}${sub.stripeSubscriptionId}${colors.reset}`);
  
  // Get payment method info from Stripe
  try {
    const customer = await stripe.customers.retrieve(sub.stripeCustomerId, {
      expand: ['invoice_settings.default_payment_method']
    });
    
    if (customer && !customer.deleted) {
      const paymentMethod = customer.invoice_settings?.default_payment_method;
      
      if (paymentMethod && typeof paymentMethod === 'object') {
        if (paymentMethod.card) {
          const card = paymentMethod.card;
          console.log(`${colors.bright}Payment Card:${colors.reset}        ${colors.green}💳 ${card.brand.toUpperCase()} •••• ${card.last4}${colors.reset} (exp: ${card.exp_month}/${card.exp_year})`);
        }
      }
    }
  } catch (error) {
    // Если не удалось получить данные карты, просто пропускаем
  }
  
  if (sub.stripeSessionId) {
    console.log(`${colors.bright}Session ID:${colors.reset}          ${colors.yellow}${sub.stripeSessionId}${colors.reset}`);
  }
  
  if (sub.organizationId) {
    console.log(`${colors.bright}Organization ID:${colors.reset}     ${colors.magenta}${sub.organizationId}${colors.reset}`);
  }
  
  if (sub.userId) {
    console.log(`${colors.bright}User ID:${colors.reset}             ${colors.magenta}${sub.userId}${colors.reset}`);
  }
  
  console.log(`${colors.bright}Current Period:${colors.reset}      ${colors.green}${periodStart}${colors.reset} → ${colors.green}${periodEnd}${colors.reset}`);
  
  if (sub.trialEnd) {
    const trialEnd = formatDate(sub.trialEnd);
    console.log(`${colors.bright}Trial End:${colors.reset}           ${colors.cyan}${trialEnd}${colors.reset}`);
  }
  
  if (sub.cancelAtPeriodEnd) {
    console.log(`${colors.bright}${colors.red}⚠️  Will cancel at period end${colors.reset}`);
  }
  
  console.log(`${colors.dim}Created: ${created} | Updated: ${updated}${colors.reset}`);
}

function printSummary(subscriptions: any[]) {
  console.log('\n' + colors.bright + colors.cyan + '╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              📊 SUMMARY STATISTICS                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝' + colors.reset + '\n');
  
  const total = subscriptions.length;
  const byStatus = subscriptions.reduce((acc: any, sub) => {
    acc[sub.status] = (acc[sub.status] || 0) + 1;
    return acc;
  }, {});
  
  const byPlan = subscriptions.reduce((acc: any, sub) => {
    acc[sub.plan] = (acc[sub.plan] || 0) + 1;
    return acc;
  }, {});
  
  console.log(`${colors.bright}Total Subscriptions:${colors.reset} ${colors.cyan}${total}${colors.reset}\n`);
  
  console.log(`${colors.bright}By Status:${colors.reset}`);
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  ${formatStatus(status)}: ${colors.white}${count}${colors.reset}`);
  });
  
  console.log(`\n${colors.bright}By Plan:${colors.reset}`);
  Object.entries(byPlan).forEach(([plan, count]) => {
    console.log(`  ${formatPlan(plan)}: ${colors.white}${count}${colors.reset}`);
  });
  
  // Calculate revenue estimate (примерные цены)
  const priceMap = {
    starter: 0,      // Free
    professional: 49, // $49/месяц
    enterprise: 199,  // $199/месяц
  };
  
  const activeRevenue = subscriptions
    .filter(sub => sub.status === 'active')
    .reduce((sum, sub) => sum + (priceMap[sub.plan as keyof typeof priceMap] || 0), 0);
  
  console.log(`\n${colors.bright}Monthly Recurring Revenue (Active):${colors.reset} ${colors.green}$${activeRevenue}${colors.reset}`);
}

async function main() {
  try {
    printHeader();
    
    // Read Convex deployment URL from environment or .env.local
    const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!deploymentUrl) {
      console.error(`${colors.red}❌ Error: CONVEX_URL not found in environment variables${colors.reset}`);
      console.log(`\n${colors.yellow}Please set NEXT_PUBLIC_CONVEX_URL or CONVEX_URL in your .env.local file${colors.reset}\n`);
      process.exit(1);
    }
    
    if (!stripeSecretKey) {
      console.error(`${colors.red}❌ Error: STRIPE_SECRET_KEY not found in environment variables${colors.reset}`);
      console.log(`\n${colors.yellow}Please set STRIPE_SECRET_KEY in your .env.local file${colors.reset}\n`);
      process.exit(1);
    }
    
    console.log(`${colors.dim}Connecting to: ${deploymentUrl}${colors.reset}\n`);
    
    const client = new ConvexHttpClient(deploymentUrl);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-12-18.acacia',
    });
    
    console.log(`${colors.cyan}📡 Fetching subscriptions...${colors.reset}\n`);
    
    // Get all subscriptions
    const subscriptions = await client.query(api.subscriptions.listAll as any) as any[];
    
    if (!subscriptions || subscriptions.length === 0) {
      console.log(`${colors.yellow}⚠️  No subscriptions found${colors.reset}\n`);
      return;
    }
    
    console.log(`${colors.green}✅ Found ${subscriptions.length} subscription(s)${colors.reset}`);
    printSeparator();
    
    // Sort by creation date (newest first)
    const sorted = [...subscriptions].sort((a, b) => b.createdAt - a.createdAt);
    
    // Print each subscription
    for (let index = 0; index < sorted.length; index++) {
      await printSubscription(sorted[index], index, stripe);
      if (index < sorted.length - 1) {
        printSeparator();
      }
    }
    
    // Print summary
    printSummary(subscriptions);
    
    console.log('\n' + colors.green + '✨ Done!' + colors.reset + '\n');
    
  } catch (error: any) {
    console.error(`\n${colors.red}❌ Error: ${error.message}${colors.reset}\n`);
    if (error.stack) {
      console.error(`${colors.dim}${error.stack}${colors.reset}\n`);
    }
    process.exit(1);
  }
}

main();
