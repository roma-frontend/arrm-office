#!/usr/bin/env node
/**
 * 📈 Stripe Subscriptions Growth Chart
 * 
 * Generates a visual chart showing subscription growth over time
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

interface Subscription {
  _id: string;
  _creationTime: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  stripeCurrentPeriodEnd: number;
  status: string;
  plan: string;
  userEmail?: string;
  cancelAtPeriodEnd?: boolean;
}

async function generateGrowthChart() {
  console.log(`${colors.bright}${colors.cyan}📈 Stripe Growth Chart Generator${colors.reset}\n`);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

  if (!convexUrl) {
    console.error(`${colors.yellow}⚠️  CONVEX_URL not found in .env.local${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}📡 Connecting to Convex...${colors.reset}`);
  const client = new ConvexHttpClient(convexUrl);

  console.log(`${colors.cyan}📥 Fetching subscription data...${colors.reset}`);
  const subscriptions = await client.query(api.subscriptions.listAll) as unknown as Subscription[];

  if (!subscriptions || subscriptions.length === 0) {
    console.log(`${colors.yellow}⚠️  No subscriptions found${colors.reset}`);
    console.log(`${colors.cyan}💡 Try: npm run stripe:add-test-data${colors.reset}`);
    process.exit(0);
  }

  console.log(`${colors.green}✅ Found ${subscriptions.length} subscription(s)${colors.reset}\n`);

  // Group subscriptions by month
  const monthlyData = new Map<string, {
    total: number;
    active: number;
    trialing: number;
    canceled: number;
  }>();

  subscriptions.forEach(sub => {
    const date = new Date(sub._creationTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { total: 0, active: 0, trialing: 0, canceled: 0 });
    }

    const data = monthlyData.get(monthKey)!;
    data.total++;

    if (sub.status === 'active') data.active++;
    else if (sub.status === 'trialing') data.trialing++;
    else if (sub.status === 'canceled') data.canceled++;
  });

  // Sort by date
  const sortedMonths = Array.from(monthlyData.keys()).sort();

  // Calculate cumulative totals
  let cumulativeTotal = 0;
  let cumulativeActive = 0;

  const labels = sortedMonths.map(month => {
    const [year, monthNum] = month.split('-');
    return `${monthNum}/${year}`;
  });

  const totalData = sortedMonths.map(month => {
    cumulativeTotal += monthlyData.get(month)!.total;
    return cumulativeTotal;
  });

  const activeData = sortedMonths.map(month => {
    const data = monthlyData.get(month)!;
    cumulativeActive += data.active;
    return cumulativeActive;
  });

  // Create chart
  const width = 1200;
  const height = 600;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: 'line' as const,
    data: {
      labels,
      datasets: [
        {
          label: 'Total Subscriptions',
          data: totalData,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Active Subscriptions',
          data: activeData,
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.4,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Subscription Growth Over Time',
          font: {
            size: 24,
          },
        },
        legend: {
          display: true,
          position: 'top' as const,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
      },
    },
  };

  console.log(`${colors.cyan}🎨 Generating chart...${colors.reset}`);
  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration as any);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `stripe-growth-chart-${timestamp}.png`;

  fs.writeFileSync(filename, imageBuffer);

  console.log(`${colors.green}${colors.bright}✅ Chart created successfully!${colors.reset}`);
  console.log(`${colors.cyan}📁 File: ${colors.yellow}${filename}${colors.reset}`);
  console.log(`${colors.cyan}📂 Location: ${colors.yellow}${process.cwd()}${colors.reset}\n`);

  // Print statistics
  console.log(`${colors.bright}${colors.cyan}📊 Growth Statistics:${colors.reset}`);
  console.log(`   Total subscriptions: ${colors.green}${cumulativeTotal}${colors.reset}`);
  console.log(`   Active subscriptions: ${colors.green}${cumulativeActive}${colors.reset}`);
  console.log(`   Growth rate: ${colors.green}${sortedMonths.length} month(s)${colors.reset}\n`);

  console.log(`${colors.green}✨ Done!${colors.reset}`);
}

generateGrowthChart().catch(console.error);
