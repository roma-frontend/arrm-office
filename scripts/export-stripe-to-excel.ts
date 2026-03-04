#!/usr/bin/env node
/**
 * 📊 Export Stripe Transactions to Excel
 * 
 * Exports all Stripe subscriptions from Convex database to Excel file
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';
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
};

function formatDate(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
    starter: 'Starter (Бесплатный)',
    professional: 'Professional',
    enterprise: 'Enterprise',
  };
  return planMap[plan] || plan;
}

function getPlanPrice(plan: string): number {
  const priceMap: Record<string, number> = {
    starter: 0,
    professional: 49,
    enterprise: 199,
  };
  return priceMap[plan] || 0;
}

async function main() {
  try {
    console.log(`\n${colors.bright}${colors.cyan}📊 Экспорт Stripe транзакций в Excel${colors.reset}\n`);
    
    const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;
    
    if (!deploymentUrl) {
      console.error(`${colors.red}❌ Error: CONVEX_URL не найден${colors.reset}`);
      process.exit(1);
    }
    
    console.log(`${colors.cyan}📡 Подключение к Convex...${colors.reset}`);
    const client = new ConvexHttpClient(deploymentUrl);
    
    console.log(`${colors.cyan}📥 Получение данных...${colors.reset}`);
    const subscriptions = await client.query(api.subscriptions.listAll as any) as any[];
    
    if (!subscriptions || subscriptions.length === 0) {
      console.log(`${colors.yellow}⚠️  Подписки не найдены${colors.reset}\n`);
      return;
    }
    
    console.log(`${colors.green}✅ Найдено ${subscriptions.length} подписок${colors.reset}`);
    
    // Prepare data for Excel
    const excelData = subscriptions.map((sub, index) => ({
      '№': index + 1,
      'Email': sub.email || 'N/A',
      'План': formatPlan(sub.plan),
      'Статус': formatStatus(sub.status),
      'Цена/месяц ($)': getPlanPrice(sub.plan),
      'Stripe Customer ID': sub.stripeCustomerId,
      'Subscription ID': sub.stripeSubscriptionId,
      'Session ID': sub.stripeSessionId || '',
      'Organization ID': sub.organizationId || '',
      'User ID': sub.userId || '',
      'Начало периода': formatDate(sub.currentPeriodStart),
      'Конец периода': formatDate(sub.currentPeriodEnd),
      'Конец пробного': formatDate(sub.trialEnd),
      'Отменить в конце': sub.cancelAtPeriodEnd ? 'Да' : 'Нет',
      'Дата создания': formatDate(sub.createdAt),
      'Дата обновления': formatDate(sub.updatedAt),
    }));
    
    // Calculate summary statistics
    const stats = {
      'Всего подписок': subscriptions.length,
      'Активные': subscriptions.filter(s => s.status === 'active').length,
      'Пробные': subscriptions.filter(s => s.status === 'trialing').length,
      'Просрочены': subscriptions.filter(s => s.status === 'past_due').length,
      'Отменены': subscriptions.filter(s => s.status === 'canceled').length,
      'Не завершены': subscriptions.filter(s => s.status === 'incomplete').length,
      '': '',
      'Starter': subscriptions.filter(s => s.plan === 'starter').length,
      'Professional': subscriptions.filter(s => s.plan === 'professional').length,
      'Enterprise': subscriptions.filter(s => s.plan === 'enterprise').length,
      ' ': '',
      'MRR (активные) $': subscriptions
        .filter(s => s.status === 'active')
        .reduce((sum, s) => sum + getPlanPrice(s.plan), 0),
    };
    
    const statsData = Object.entries(stats).map(([key, value]) => ({
      'Показатель': key,
      'Значение': value,
    }));
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Add subscriptions sheet
    const ws1 = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    const colWidths = [
      { wch: 5 },   // №
      { wch: 30 },  // Email
      { wch: 25 },  // План
      { wch: 18 },  // Статус
      { wch: 15 },  // Цена
      { wch: 25 },  // Customer ID
      { wch: 25 },  // Subscription ID
      { wch: 25 },  // Session ID
      { wch: 20 },  // Org ID
      { wch: 20 },  // User ID
      { wch: 20 },  // Начало периода
      { wch: 20 },  // Конец периода
      { wch: 20 },  // Конец пробного
      { wch: 15 },  // Отменить
      { wch: 20 },  // Создано
      { wch: 20 },  // Обновлено
    ];
    ws1['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(wb, ws1, 'Подписки');
    
    // Add statistics sheet
    const ws2 = XLSX.utils.json_to_sheet(statsData);
    ws2['!cols'] = [{ wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Статистика');
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `stripe-transactions-${timestamp}.xlsx`;
    const filepath = path.resolve(process.cwd(), filename);
    
    // Write file
    console.log(`${colors.cyan}💾 Сохранение файла...${colors.reset}`);
    XLSX.writeFile(wb, filepath);
    
    console.log(`\n${colors.green}${colors.bright}✅ Успешно экспортировано!${colors.reset}`);
    console.log(`${colors.cyan}📁 Файл сохранён: ${colors.yellow}${filename}${colors.reset}`);
    console.log(`${colors.cyan}📂 Полный путь: ${colors.yellow}${filepath}${colors.reset}`);
    console.log(`\n${colors.green}📊 Содержимое:${colors.reset}`);
    console.log(`   • Лист 1: ${colors.cyan}Подписки${colors.reset} (${subscriptions.length} записей)`);
    console.log(`   • Лист 2: ${colors.cyan}Статистика${colors.reset}`);
    
    // Show quick summary
    const activeCount = subscriptions.filter(s => s.status === 'active').length;
    const mrr = subscriptions
      .filter(s => s.status === 'active')
      .reduce((sum, s) => sum + getPlanPrice(s.plan), 0);
    
    console.log(`\n${colors.bright}${colors.cyan}📈 Быстрая статистика:${colors.reset}`);
    console.log(`   ${colors.green}✅ Активные подписки: ${activeCount} из ${subscriptions.length}${colors.reset}`);
    console.log(`   ${colors.green}💰 MRR (месячный доход): $${mrr}${colors.reset}`);
    
    // Try to open the file automatically
    console.log(`\n${colors.cyan}📂 Открываю файл...${colors.reset}`);
    
    try {
      const { exec } = require('child_process');
      const command = process.platform === 'win32' 
        ? `start "" "${filepath}"`
        : process.platform === 'darwin'
        ? `open "${filepath}"`
        : `xdg-open "${filepath}"`;
      
      exec(command, (error: any) => {
        if (error) {
          console.log(`${colors.yellow}⚠️  Не удалось открыть файл автоматически${colors.reset}`);
          console.log(`${colors.cyan}💡 Откройте файл вручную: ${colors.yellow}${filepath}${colors.reset}\n`);
        }
      });
    } catch (err) {
      console.log(`${colors.yellow}⚠️  Не удалось открыть файл автоматически${colors.reset}`);
    }
    
    console.log();
    
  } catch (error: any) {
    console.error(`\n${colors.red}❌ Ошибка: ${error.message}${colors.reset}\n`);
    if (error.stack) {
      console.error(`${colors.red}${error.stack}${colors.reset}\n`);
    }
    process.exit(1);
  }
}

main();
