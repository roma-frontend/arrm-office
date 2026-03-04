#!/usr/bin/env node
/**
 * ⏰ Trial Period Reminder System
 * 
 * Checks for subscriptions with ending trial periods and sends reminders
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Load environment variables
// In production, use platform env vars (Vercel, etc)
// In development, fallback to .env.local
if (!process.env.CONVEX_URL) {
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

interface Subscription {
  _id: string;
  _creationTime: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  plan: string;
  userEmail?: string;
  trialEnd?: number;
  currentPeriodStart?: number;
  stripeCurrentPeriodEnd: number;
}

function getDaysUntil(timestamp: number): number {
  const now = Date.now();
  const diff = timestamp - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function checkTrialReminders() {
  console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║           ⏰ TRIAL PERIOD REMINDER SYSTEM ⏰                  ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

  if (!convexUrl) {
    console.error(`${colors.red}❌ CONVEX_URL not found in .env.local${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}📡 Connecting to Convex...${colors.reset}`);
  const client = new ConvexHttpClient(convexUrl);

  console.log(`${colors.cyan}📥 Fetching subscriptions...${colors.reset}`);
  const subscriptions = await client.query(api.subscriptions.listAll) as unknown as Subscription[];

  if (!subscriptions || subscriptions.length === 0) {
    console.log(`${colors.yellow}⚠️  No subscriptions found${colors.reset}`);
    return;
  }

  console.log(`${colors.green}✅ Found ${subscriptions.length} subscription(s)${colors.reset}\n`);

  // Filter trialing subscriptions
  const trialingSubscriptions = subscriptions.filter(sub =>
    sub.status === 'trialing' && sub.trialEnd
  );

  if (trialingSubscriptions.length === 0) {
    console.log(`${colors.cyan}ℹ️  No active trial subscriptions found${colors.reset}\n`);
    return;
  }

  console.log(`${colors.bright}${colors.cyan}📋 Trial Subscriptions Status:${colors.reset}\n`);

  const reminders = {
    critical: [] as Subscription[], // < 3 days
    warning: [] as Subscription[],  // 3-7 days
    info: [] as Subscription[],     // > 7 days
  };

  trialingSubscriptions.forEach(sub => {
    const daysLeft = getDaysUntil(sub.trialEnd!);

    if (daysLeft < 0) {
      // Trial already ended but status not updated
      console.log(`${colors.red}🚨 EXPIRED${colors.reset} - ${sub.userEmail || 'No email'}`);
      console.log(`   ${colors.dim}Trial ended: ${formatDate(sub.trialEnd!)}${colors.reset}`);
      console.log(`   ${colors.dim}Subscription: ${sub.stripeSubscriptionId}${colors.reset}\n`);
    } else if (daysLeft <= 3) {
      reminders.critical.push(sub);
      console.log(`${colors.red}⚠️  CRITICAL${colors.reset} - ${sub.userEmail || 'No email'}`);
      console.log(`   ${colors.bright}${colors.red}Trial ends in ${daysLeft} day(s)!${colors.reset}`);
      console.log(`   ${colors.dim}End date: ${formatDate(sub.trialEnd!)}${colors.reset}`);
      console.log(`   ${colors.dim}Plan: ${sub.plan}${colors.reset}`);
      console.log(`   ${colors.dim}Customer: ${sub.stripeCustomerId}${colors.reset}\n`);
    } else if (daysLeft <= 7) {
      reminders.warning.push(sub);
      console.log(`${colors.yellow}⚡ WARNING${colors.reset} - ${sub.userEmail || 'No email'}`);
      console.log(`   ${colors.yellow}Trial ends in ${daysLeft} day(s)${colors.reset}`);
      console.log(`   ${colors.dim}End date: ${formatDate(sub.trialEnd!)}${colors.reset}`);
      console.log(`   ${colors.dim}Plan: ${sub.plan}${colors.reset}\n`);
    } else {
      reminders.info.push(sub);
      console.log(`${colors.green}✓ OK${colors.reset} - ${sub.userEmail || 'No email'}`);
      console.log(`   ${colors.dim}Trial ends in ${daysLeft} day(s) - ${formatDate(sub.trialEnd!)}${colors.reset}\n`);
    }
  });

  // Summary
  console.log(`${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║                        📊 SUMMARY                                ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  console.log(`${colors.bright}Total trial subscriptions: ${trialingSubscriptions.length}${colors.reset}\n`);

  if (reminders.critical.length > 0) {
    console.log(`${colors.red}🚨 CRITICAL (≤3 days): ${reminders.critical.length}${colors.reset}`);
    console.log(`${colors.dim}   Action: Send urgent reminder email${colors.reset}`);
    console.log(`${colors.dim}   Suggest: Offer discount or extend trial${colors.reset}\n`);
  }

  if (reminders.warning.length > 0) {
    console.log(`${colors.yellow}⚡ WARNING (4-7 days): ${reminders.warning.length}${colors.reset}`);
    console.log(`${colors.dim}   Action: Send friendly reminder${colors.reset}`);
    console.log(`${colors.dim}   Suggest: Highlight product benefits${colors.reset}\n`);
  }

  if (reminders.info.length > 0) {
    console.log(`${colors.green}✓ OK (>7 days): ${reminders.info.length}${colors.reset}`);
    console.log(`${colors.dim}   Action: Monitor, send welcome emails${colors.reset}\n`);
  }

  // Recommended actions
  if (reminders.critical.length > 0 || reminders.warning.length > 0) {
    console.log(`${colors.bright}${colors.cyan}💡 Recommended Actions:${colors.reset}\n`);

    if (reminders.critical.length > 0) {
      console.log(`${colors.red}1. Critical trials:${colors.reset}`);
      reminders.critical.forEach(sub => {
        console.log(`   ${colors.dim}• Email ${sub.userEmail}: "Your trial ends in ${getDaysUntil(sub.trialEnd!)} days"${colors.reset}`);
      });
      console.log();
    }

    if (reminders.warning.length > 0) {
      console.log(`${colors.yellow}2. Warning trials:${colors.reset}`);
      reminders.warning.forEach(sub => {
        console.log(`   ${colors.dim}• Email ${sub.userEmail}: "Make the most of your trial"${colors.reset}`);
      });
      console.log();
    }
  }

  // Email templates suggestion
  console.log(`${colors.bright}${colors.cyan}📧 Email Template Examples:${colors.reset}\n`);

  console.log(`${colors.yellow}For 3-day reminder:${colors.reset}`);
  console.log(`${colors.dim}Subject: Your trial ends in 3 days - Don't miss out!${colors.reset}`);
  console.log(`${colors.dim}Body: Hi [Name], your trial is ending soon. Subscribe now to keep access!${colors.reset}\n`);

  console.log(`${colors.yellow}For 7-day reminder:${colors.reset}`);
  console.log(`${colors.dim}Subject: Week left in your trial - Here's what you can do${colors.reset}`);
  console.log(`${colors.dim}Body: Hi [Name], you still have a week to explore all features!${colors.reset}\n`);

  console.log(`${colors.green}✨ Done!${colors.reset}`);

  // Suggest scheduling
  console.log(`\n${colors.cyan}💡 Tip: Schedule this script to run daily:${colors.reset}`);
  console.log(`${colors.dim}   crontab: 0 9 * * * npm run stripe:check-trials${colors.reset}`);
  console.log(`${colors.dim}   Windows Task Scheduler: Daily at 9:00 AM${colors.reset}\n`);
}

checkTrialReminders().catch(console.error);
