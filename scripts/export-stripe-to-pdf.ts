#!/usr/bin/env node
/**
 * 📄 Export Stripe Transactions to PDF
 * 
 * Exports all Stripe subscriptions from Convex database to beautiful PDF report
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';
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
  organizationId?: string;
  userId?: string;
  stripeSessionId?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: number;
  trialEnd?: number;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    trialing: 'Пробный период',
    active: 'Активная',
    past_due: 'Просрочена',
    canceled: 'Отменена',
    incomplete: 'Не завершена',
  };
  return statusMap[status] || status;
}

function formatPlan(plan: string): string {
  const planMap: Record<string, string> = {
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
  };
  return planMap[plan] || plan;
}

function getPlanPrice(plan: string): number {
  const prices: Record<string, number> = {
    starter: 0,
    professional: 49,
    enterprise: 199,
  };
  return prices[plan] || 0;
}

async function exportToPDF() {
  console.log(`${colors.bright}${colors.cyan}📄 Экспорт Stripe транзакций в PDF${colors.reset}\n`);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

  if (!convexUrl) {
    console.error(`${colors.red}❌ CONVEX_URL not found in .env.local${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}📡 Подключение к Convex...${colors.reset}`);
  const client = new ConvexHttpClient(convexUrl);

  console.log(`${colors.cyan}📥 Получение данных...${colors.reset}`);
  const subscriptions = await client.query(api.subscriptions.listAll) as unknown as Subscription[];

  if (!subscriptions || subscriptions.length === 0) {
    console.log(`${colors.yellow}⚠️  No subscriptions found${colors.reset}`);
    console.log(`${colors.cyan}💡 Try: npm run stripe:add-test-data${colors.reset}`);
    process.exit(0);
  }

  console.log(`${colors.green}✅ Найдено ${subscriptions.length} подписок${colors.reset}`);
  console.log(`${colors.cyan}💾 Создание PDF файла...${colors.reset}\n`);

  // Calculate statistics
  const stats = {
    total: subscriptions.length,
    byStatus: {} as Record<string, number>,
    byPlan: {} as Record<string, number>,
    mrr: 0,
  };

  subscriptions.forEach(sub => {
    stats.byStatus[sub.status] = (stats.byStatus[sub.status] || 0) + 1;
    stats.byPlan[sub.plan] = (stats.byPlan[sub.plan] || 0) + 1;

    if (sub.status === 'active') {
      stats.mrr += getPlanPrice(sub.plan);
    }
  });

  // Create PDF
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `stripe-report-${timestamp}.pdf`;

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });

  const stream = fs.createWriteStream(filename);
  doc.pipe(stream);

  // Title
  doc.fontSize(24)
    .fillColor('#2563eb')
    .text('Stripe Subscriptions Report', { align: 'center' });

  doc.fontSize(12)
    .fillColor('#6b7280')
    .text(`Generated: ${new Date().toLocaleString('ru-RU')}`, { align: 'center' });

  doc.moveDown(2);

  // Summary Statistics
  doc.fontSize(18)
    .fillColor('#1f2937')
    .text('📊 Summary Statistics');

  doc.moveDown(0.5);
  doc.fontSize(12)
    .fillColor('#374151');

  doc.text(`Total Subscriptions: ${stats.total}`, { continued: false });
  doc.text(`Monthly Recurring Revenue (MRR): $${stats.mrr}`, { continued: false });

  doc.moveDown(1);

  // By Status
  doc.fontSize(14)
    .fillColor('#1f2937')
    .text('By Status:');
  doc.fontSize(11)
    .fillColor('#4b5563');

  Object.entries(stats.byStatus).forEach(([status, count]) => {
    doc.text(`  • ${formatStatus(status)}: ${count}`, { continued: false });
  });

  doc.moveDown(1);

  // By Plan
  doc.fontSize(14)
    .fillColor('#1f2937')
    .text('By Plan:');
  doc.fontSize(11)
    .fillColor('#4b5563');

  Object.entries(stats.byPlan).forEach(([plan, count]) => {
    doc.text(`  • ${formatPlan(plan)}: ${count}`, { continued: false });
  });

  doc.moveDown(2);

  // Subscriptions List
  doc.fontSize(18)
    .fillColor('#1f2937')
    .text('📋 Subscriptions Details');

  doc.moveDown(1);

  subscriptions.forEach((sub, index) => {
    // Check if we need a new page
    if (doc.y > 650) {
      doc.addPage();
    }

    // Subscription card background
    const boxY = doc.y;
    doc.rect(doc.x - 10, boxY - 5, 500, 110)
      .fillAndStroke('#f3f4f6', '#e5e7eb');

    doc.y = boxY;

    // Subscription details
    doc.fontSize(12)
      .fillColor('#1f2937')
      .text(`#${index + 1} - ${sub.userEmail || 'No email'}`, { continued: false });

    doc.fontSize(10)
      .fillColor('#4b5563');

    doc.text(`Plan: ${formatPlan(sub.plan)} ($${getPlanPrice(sub.plan)}/month)`, { continued: false });
    doc.text(`Status: ${formatStatus(sub.status)}`, { continued: false });
    doc.text(`Customer ID: ${sub.stripeCustomerId}`, { continued: false });
    doc.text(`Subscription ID: ${sub.stripeSubscriptionId}`, { continued: false });
    doc.text(`Period: ${formatDate(sub.currentPeriodStart)} - ${formatDate(sub.stripeCurrentPeriodEnd)}`, { continued: false });

    if (sub.trialEnd) {
      doc.text(`Trial End: ${formatDate(sub.trialEnd)}`, { continued: false });
    }

    doc.moveDown(1.5);
  });

  // Footer
  doc.fontSize(8)
    .fillColor('#9ca3af')
    .text(`Generated by Stripe Export System • ${new Date().toLocaleDateString('ru-RU')}`,
      50,
      doc.page.height - 50,
      { align: 'center' });

  doc.end();

  // Wait for file to be written
  await new Promise<void>((resolve) => stream.on('finish', () => resolve()));

  console.log(`${colors.green}${colors.bright}✅ PDF создан успешно!${colors.reset}`);
  console.log(`${colors.cyan}📁 Файл сохранён: ${colors.yellow}${filename}${colors.reset}`);
  console.log(`${colors.cyan}📂 Полный путь: ${colors.yellow}${path.resolve(filename)}${colors.reset}\n`);

  console.log(`${colors.bright}${colors.cyan}📈 Быстрая статистика:${colors.reset}`);
  console.log(`   ${colors.green}✅ Активные подписки: ${stats.byStatus.active || 0} из ${stats.total}${colors.reset}`);
  console.log(`   ${colors.green}💰 MRR (месячный доход): $${stats.mrr}${colors.reset}\n`);

  console.log(`${colors.green}✨ Done!${colors.reset}`);
}

exportToPDF().catch(console.error);
