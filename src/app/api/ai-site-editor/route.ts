import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/lib/logger';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

/** Задержка в мс */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Выполняет запрос к AI с retry при превышении лимита */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 5000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const isRateLimit =
        error?.message?.includes('quota') ||
        error?.message?.includes('rate') ||
        error?.message?.includes('429');
      if (isRateLimit && i < retries - 1) {
        const wait = delayMs * (i + 1);
        logger.log(`[AI Site Editor] Rate limit hit, retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
import { fetchMutation, fetchQuery } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import fs from 'fs';
import path from 'path';

// ─── Whitelist / Blacklist ────────────────────────────────────────────────────

const ALLOWED_DIRECTORIES = ['src/app', 'src/components', 'src/i18n/locales'];

const FORBIDDEN_PATHS = [
  'src/components/ui',
  'convex',
  'src/app/api',
  'package.json',
  'tsconfig.json',
  'next.config',
  'middleware.ts',
  '.env',
  'node_modules',
];

// Files too large for full rewrite — only CSS patch mode allowed
const CSS_PATCH_ONLY_FILES = [
  'src/components/dashboard/DashboardClient.tsx',
  'src/components/ai/SiteEditorChat.tsx',
  'src/components/landing/LandingClient.tsx',
  'src/components/leaves/LeavesClient.tsx',
  'src/components/employees/EmployeesClient.tsx',
  'src/components/tasks/TasksClient.tsx',
];

// ─── Security helpers ─────────────────────────────────────────────────────────

function isPathAllowed(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalizedPath.includes(forbidden)) return false;
  }

  for (const allowed of ALLOWED_DIRECTORIES) {
    if (normalizedPath.startsWith(allowed) || normalizedPath.includes(`/${allowed}/`)) {
      return true;
    }
  }

  return false;
}

/** Читает файл с проверкой безопасности — возвращает содержимое или null */
function readFileSecure(filePath: string): string | null {
  try {
    if (!isPathAllowed(filePath)) {
      logger.warn(`[readFileSecure] Запрещён доступ: ${filePath}`);
      return null;
    }

    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return null;

    return fs.readFileSync(fullPath, 'utf-8');
  } catch (error) {
    console.error(`[readFileSecure] Ошибка чтения ${filePath}:`, error);
    return null;
  }
}

/** Записывает файл с проверкой безопасности, создаёт timestamped backup */
function writeFileSecure(
  filePath: string,
  content: string,
  description: string = 'AI Site Editor',
): { success: boolean; timestamp?: number; error?: string } {
  try {
    if (!isPathAllowed(filePath)) {
      const msg = `[writeFileSecure] Запрещён доступ: ${filePath}`;
      logger.warn(msg);
      return { success: false, error: msg };
    }

    const fullPath = path.join(process.cwd(), filePath);
    const backupDir = path.join(process.cwd(), '.ai-editor-backups');
    const timestamp = Date.now();

    // Создаём папку backup если нет
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Создаём резервную копию существующего файла
    if (fs.existsSync(fullPath)) {
      const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.backup`);
      fs.copyFileSync(fullPath, backupPath);

      // Мета-данные backup
      const metaPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.meta.json`);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({ originalPath: filePath, timestamp, description }, null, 2),
      );
    }

    // Safety: reject if new content is suspiciously smaller than original (likely truncated)
    if (fs.existsSync(fullPath)) {
      const originalSize = fs.statSync(fullPath).size;
      const newSize = Buffer.byteLength(content, 'utf-8');
      // For large files (>5KB), require at least 80% of original size
      // For small files (>500B), require at least 70% of original size
      const threshold = originalSize > 5000 ? 0.8 : 0.7;
      if (originalSize > 500 && newSize < originalSize * threshold) {
        const msg = `[writeFileSecure] Rejected: new content (${newSize}b) is less than ${threshold * 100}% of original (${originalSize}b) — likely truncated`;
        logger.warn(msg);
        return { success: false, error: msg };
      }
    }

    // Пишем новое содержимое
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');

    logger.log(`[writeFileSecure] Записан ${filePath} (backup ts=${timestamp})`);
    return { success: true, timestamp };
  } catch (error) {
    const msg = `[writeFileSecure] Ошибка записи ${filePath}: ${error}`;
    console.error(msg);
    return { success: false, error: msg };
  }
}

/** Список доступных компонентов (без src/components/ui) */
function getAvailableComponents(): string[] {
  const components: string[] = [];

  try {
    const componentsDir = path.join(process.cwd(), 'src/components');

    function scanDir(dir: string) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
        if (relativePath.includes('components/ui')) continue;
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
          components.push(relativePath);
        }
      }
    }

    if (fs.existsSync(componentsDir)) scanDir(componentsDir);
  } catch (error) {
    console.error('Ошибка сканирования компонентов:', error);
  }

  return components;
}

/** Определяет релевантные файлы по ключевым словам в запросе */
function findRelevantFiles(message: string): string[] {
  const lower = message.toLowerCase();

  const keywordMap: Record<string, string[]> = {
    dashboard: [
      'src/components/dashboard/DashboardClient.tsx',
      'src/app/(dashboard)/dashboard/page.tsx',
    ],
    'manage org': ['src/components/dashboard/DashboardClient.tsx'],
    employees: ['src/app/(dashboard)/employees/page.tsx'],
    settings: ['src/app/(dashboard)/settings/page.tsx'],
    navbar: ['src/components/layout/Navbar.tsx'],
    sidebar: ['src/components/layout/Sidebar.tsx'],
    calendar: ['src/app/(dashboard)/calendar/page.tsx'],
    profile: ['src/components/settings/ProfileSettings.tsx'],
    landing: ['src/components/landing/LandingClient.tsx'],
    leaves: ['src/app/(dashboard)/leaves/page.tsx'],
    tasks: ['src/app/(dashboard)/tasks/page.tsx'],
    analytics: ['src/app/(dashboard)/analytics/page.tsx'],
    aitestcomponent: ['src/components/test/AITestComponent.tsx'],
    'test component': ['src/components/test/AITestComponent.tsx'],
    'ai-site-editor': ['src/components/ai/SiteEditorChat.tsx'],
    'site editor': ['src/components/ai/SiteEditorChat.tsx'],
    'ai chat editor': ['src/components/ai/SiteEditorChat.tsx'],
    'ai editor': ['src/components/ai/SiteEditorChat.tsx'],
    siteeditorchat: ['src/components/ai/SiteEditorChat.tsx'],
    chatwidget: ['src/components/ai/ChatWidget.tsx'],
    'chat widget': ['src/components/ai/ChatWidget.tsx'],
    'ai chat': ['src/components/ai/ChatWidget.tsx'],
    'ai assistant': ['src/components/leaves/AILeaveAssistant.tsx'],
    'leave assistant': ['src/components/leaves/AILeaveAssistant.tsx'],
    'weekly digest': ['src/components/ai/WeeklyDigestWidget.tsx'],
    login: ['src/app/(auth)/login/page.tsx'],
    register: ['src/app/(auth)/register/page.tsx'],
    approvals: ['src/app/(dashboard)/approvals/page.tsx'],
    attendance: ['src/components/attendance/AttendanceDashboard.tsx'],
    reports: ['src/app/(dashboard)/reports/page.tsx'],
    joins: ['src/app/(dashboard)/join-requests/page.tsx'],
  };

  const relevant: string[] = [];
  for (const [keyword, files] of Object.entries(keywordMap)) {
    if (lower.includes(keyword)) relevant.push(...files);
  }

  if (lower.includes('перевод') || lower.includes('translation') || lower.includes('i18n')) {
    relevant.push(
      'src/i18n/locales/en.json',
      'src/i18n/locales/ru.json',
      'src/i18n/locales/hy.json',
    );
  }

  // Also match any file path explicitly mentioned in the message (e.g. src/components/foo/Bar.tsx)
  const pathPattern = /src\/[\w\-/.()]+\.(tsx?|jsx?|json)/g;
  const explicitPaths = message.match(pathPattern) ?? [];
  for (const p of explicitPaths) {
    if (isPathAllowed(p)) relevant.push(p);
  }

  // Match any .tsx/.ts filename mentioned (e.g. "AITestComponent", "DashboardClient", "chat widget")
  const allComponents = getAvailableComponents();
  for (const comp of allComponents) {
    const baseName = path.basename(comp, path.extname(comp));
    // Check full name match (e.g. "ChatWidget")
    if (lower.includes(baseName.toLowerCase())) {
      relevant.push(comp);
      continue;
    }
    // Split CamelCase into words and check if ALL words appear in message
    // e.g. "ChatWidget" → ["Chat", "Widget"], "SiteEditorChat" → ["Site", "Editor", "Chat"]
    const words = baseName
      .split(/(?=[A-Z])/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 2);
    if (words.length >= 2 && words.every((w) => lower.includes(w))) {
      relevant.push(comp);
    }
  }

  return Array.from(new Set(relevant));
}

/** Парсит ответ AI для извлечения изменений файлов */
function parseAIResponseForFileChanges(
  response: string,
  fallbackFiles: string[] = [],
): Array<{
  filePath: string;
  content: string;
  description: string;
}> {
  const changes: Array<{ filePath: string; content: string; description: string }> = [];

  const isTruncated = (s: string) =>
    s.includes('[TRUNCATED]') ||
    s.includes('... [') ||
    s.includes('// rest remains') ||
    s.includes('// ...') ||
    s.includes('/* ... */') ||
    s.includes('// остальной код') ||
    s.includes('// остальное');

  // Pattern 1: FILE: path\n```lang\ncode```
  const fileBlockPattern = /FILE:\s*([^\n]+)\n```(?:tsx?|jsx?|json|js)?\n([\s\S]*?)```/g;
  let match;
  while ((match = fileBlockPattern.exec(response)) !== null) {
    const filePath = match[1]?.trim();
    const content = match[2];
    if (filePath && content && isPathAllowed(filePath) && !isTruncated(content)) {
      changes.push({ filePath, content, description: 'AI Site Editor: Auto-applied changes' });
    }
  }

  // Pattern 2: path on its own line then ```code``` (model omits FILE: prefix)
  if (changes.length === 0) {
    const pathThenBlock =
      /(src\/[\w\-/.()]+\.(tsx?|jsx?|json))\s*\n```(?:tsx?|jsx?|json|js)?\n([\s\S]*?)```/g;
    while ((match = pathThenBlock.exec(response)) !== null) {
      const filePath = match[1]?.trim();
      const content = match[3];
      if (filePath && content && isPathAllowed(filePath) && !isTruncated(content)) {
        changes.push({ filePath, content, description: 'AI Site Editor: Auto-applied changes' });
      }
    }
  }

  // Pattern 3: bare ```code``` block — use fallback file if exactly one
  if (changes.length === 0 && fallbackFiles.length === 1) {
    const bareBlock = /```(?:tsx?|jsx?|json|js)?\n([\s\S]*?)```/g;
    while ((match = bareBlock.exec(response)) !== null) {
      const content = match[1];
      // Safety: reject truncated content
      if (!content || content.includes('... [TRUNCATED]') || content.includes('[TRUNCATED]'))
        continue;
      const filePath = fallbackFiles[0];
      if (filePath && isPathAllowed(filePath)) {
        changes.push({ filePath, content, description: 'AI Site Editor: Auto-applied changes' });
      }
    }
  }

  return changes;
}

// ─── CSS Patch system ─────────────────────────────────────────────────────────

const CSS_PATCH_SYSTEM_PROMPT = `You are a CSS class editor for a Next.js / Tailwind CSS application.

CRITICAL: You must output ONLY PATCH blocks. Never output full files. Never write "rest of the file".

EXACT OUTPUT FORMAT (copy this exactly):

PATCH: src/path/to/file.tsx
OLD: "the exact className value from the file"
NEW: "the new className value with your fix"

EXAMPLE:
PATCH: src/components/dashboard/DashboardClient.tsx
OLD: "border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950"
NEW: "border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"

RULES:
- Find the className attribute in the file that needs changing
- Copy its value EXACTLY (every class, every space) into OLD
- Write the fixed version into NEW
- Output one PATCH block per className change
- Do NOT write FILE: blocks
- Do NOT write full file content
- Do NOT write "// rest remains the same" or similar
- After PATCH blocks, explain changes in Russian in 1-2 sentences`;

/** Парсит CSS-патчи из ответа AI */
function parseCSSPatches(response: string): Array<{
  filePath: string;
  oldClass: string;
  newClass: string;
}> {
  const patches: Array<{ filePath: string; oldClass: string; newClass: string }> = [];

  // Support both single and double quotes, and optional whitespace variations
  // Pattern: PATCH: path\nOLD: "value"\nNEW: "value"
  const patchPattern =
    /PATCH:\s*([^\n]+)\s*\nOLD:\s*["']([^"'\n]+)["']\s*\nNEW:\s*["']([^"'\n]+)["']/g;
  let match;
  while ((match = patchPattern.exec(response)) !== null) {
    const filePath = match[1]?.trim();
    const oldClass = match[2]?.trim();
    const newClass = match[3]?.trim();
    if (filePath && oldClass && newClass && isPathAllowed(filePath)) {
      patches.push({ filePath, oldClass, newClass });
    }
  }

  // Also try multiline OLD/NEW (in case value spans multiple lines with backticks)
  if (patches.length === 0) {
    const multiPattern = /PATCH:\s*([^\n]+)\s*\nOLD:\s*`([^`]+)`\s*\nNEW:\s*`([^`]+)`/g;
    while ((match = multiPattern.exec(response)) !== null) {
      const filePath = match[1]?.trim();
      const oldClass = match[2]?.trim();
      const newClass = match[3]?.trim();
      if (filePath && oldClass && newClass && isPathAllowed(filePath)) {
        patches.push({ filePath, oldClass, newClass });
      }
    }
  }

  return patches;
}

/** Применяет CSS-патч к файлу — заменяет только строку className */
function applyCSSPatch(
  filePath: string,
  oldClass: string,
  newClass: string,
  description: string,
): { success: boolean; error?: string; timestamp?: number } {
  try {
    if (!isPathAllowed(filePath)) {
      return { success: false, error: `Access denied: ${filePath}` };
    }
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    if (!content.includes(oldClass)) {
      return { success: false, error: `Old className not found in ${filePath}: "${oldClass}"` };
    }

    // Create backup
    const backupDir = path.join(process.cwd(), '.ai-editor-backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = Date.now();
    const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.backup`);
    fs.copyFileSync(fullPath, backupPath);
    const metaPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify({ originalPath: filePath, timestamp, description }, null, 2),
    );

    // Apply patch — replace only the className string
    const newContent = content.replace(oldClass, newClass);
    fs.writeFileSync(fullPath, newContent, 'utf-8');
    logger.log(`[CSS Patch] Applied to ${filePath}: "${oldClass}" → "${newClass}"`);
    return { success: true, timestamp };
  } catch (error) {
    return { success: false, error: `Error patching ${filePath}: ${error}` };
  }
}

/** Генерирует CSS-патчи через AI для design-изменений */
async function generateCSSPatches(
  message: string,
  filesToRead: string[],
): Promise<{
  aiText: string;
  patches: Array<{ filePath: string; oldClass: string; newClass: string }>;
}> {
  const fileContextParts: string[] = [];
  for (const filePath of filesToRead) {
    const content = readFileSecure(filePath);
    if (content) {
      fileContextParts.push(`\n--- FILE: ${filePath} ---\n${content}\n--- END FILE ---`);
    }
  }

  if (fileContextParts.length === 0) {
    return { aiText: 'No files found for context.', patches: [] };
  }

  const prompt = `${CSS_PATCH_SYSTEM_PROMPT}

CURRENT FILE CONTENTS:
${fileContextParts.join('\n')}

USER REQUEST: ${message}`;

  const result = await withRetry(() =>
    generateText({
      model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxOutputTokens: 4000,
    }),
  );

  const aiText = result.text;
  logger.log('[CSS Patch] Full AI response:\n', aiText);
  const patches = parseCSSPatches(aiText);
  logger.log('[CSS Patch] Parsed patches:', patches.length);
  return { aiText, patches };
}

// ─── System Prompt ─────────────────────────────────────────────────────────────

const SITE_EDITOR_SYSTEM_PROMPT = `You are an AI assistant for editing a Next.js 16 / React 19 / Tailwind CSS web application.

The file contents you need are already provided in the prompt below. DO NOT ask for files — they are already there.

YOUR ONLY JOB:
1. Read the provided file contents
2. Make the requested changes
3. Output EACH modified file using EXACTLY this format:

FILE: src/path/to/file.tsx
\`\`\`tsx
<complete new file content>
\`\`\`

RULES:
- Output the COMPLETE file — all imports, all code, start to end
- Use valid TypeScript/React syntax
- Do NOT write [call read_file(...)], [call write_file(...)] or any tool-call syntax
- Do NOT say "I need to see the file" — the file is already in the prompt
- NEVER truncate or abbreviate the file content — output every single line
- NEVER write "... [TRUNCATED]", "// rest remains the same", "// ..." or any placeholder
- After the FILE blocks, briefly explain changes in Russian

ALLOWED PATHS:
✅ src/app/**/*.tsx
✅ src/components/**/*.tsx (except src/components/ui/)
✅ src/i18n/locales/*.json

FORBIDDEN:
❌ src/components/ui/
❌ convex/
❌ src/app/api/
❌ package.json, .env, node_modules`;

// ─── Edit type detection ───────────────────────────────────────────────────────

function detectEditType(
  message: string,
): 'design' | 'content' | 'layout' | 'logic' | 'full_control' {
  const lower = message.toLowerCase();

  if (
    ['полный контроль', 'все изменить', 'переделать сайт', 'полностью изменить'].some((kw) =>
      lower.includes(kw),
    )
  ) {
    return 'full_control';
  }
  if (
    ['функция', 'логика', 'добавить фичу', 'исправить баг', 'функционал', 'обработчик'].some((kw) =>
      lower.includes(kw),
    )
  ) {
    return 'logic';
  }
  if (
    ['макет', 'расположение', 'структура', 'компонент', 'переставить', 'реорганизовать'].some(
      (kw) => lower.includes(kw),
    )
  ) {
    return 'layout';
  }
  if (
    ['текст', 'контент', 'надпись', 'перевод', 'слово', 'фраза', 'заголовок', 'i18n'].some((kw) =>
      lower.includes(kw),
    )
  ) {
    return 'content';
  }
  if (
    [
      'дизайн',
      'цвет',
      'стиль',
      'шрифт',
      'размер',
      'анимация',
      'css',
      'красиво',
      'внешний вид',
      'hover',
      'кнопка',
      'белеет',
      'темная тема',
      'светлая тема',
      'граница',
      'фон',
      'background',
      'исправь',
      'измени',
      'theme',
      'темный',
      'светлый',
      'соответствовал',
      'dashboard',
      'manage org',
      'employees',
      'settings',
      'navbar',
      'sidebar',
    ].some((kw) => lower.includes(kw))
  ) {
    return 'design';
  }

  return 'design';
}

// ─── Single-prompt file change extraction ────────────────────────────────────
// Instead of broken multi-step tool calling, we use a structured single prompt:
// AI reads file content from context, returns changes in a parseable format,
// then we apply them server-side.

async function generateFileChanges(
  message: string,
  plan: string,
  filesToRead: string[],
): Promise<{
  aiText: string;
  changes: Array<{ filePath: string; content: string; description: string }>;
}> {
  // Read all relevant files upfront and include in prompt
  const fileContextParts: string[] = [];
  for (const filePath of filesToRead) {
    const content = readFileSecure(filePath);
    if (content) {
      // If file is large, warn AI about size so it doesn't truncate output
      const sizeWarning =
        content.length > 10000
          ? `\n[NOTE: This file is ${content.length} chars / ~${Math.round(content.length / 4)} tokens. You MUST output the COMPLETE file without any truncation or abbreviation.]\n`
          : '';
      fileContextParts.push(
        `\n--- FILE: ${filePath} ---${sizeWarning}\n${content}\n--- END FILE ---`,
      );
    }
  }

  // If no specific files found, include component list
  if (fileContextParts.length === 0) {
    const components = getAvailableComponents();
    fileContextParts.push(`\nAvailable components:\n${components.slice(0, 30).join('\n')}`);
  }

  const fileList = filesToRead.join(', ');
  const prompt = `${SITE_EDITOR_SYSTEM_PROMPT}

CURRENT FILE CONTENTS (for reference only — only output FILE blocks for files you actually modify):
${fileContextParts.join('\n')}

USER PLAN: ${plan}
USER REQUEST: ${message}

IMPORTANT: Only output FILE blocks for files that need to change. Do NOT rewrite files that don't need modification. Files provided: ${fileList}`;

  const result = await withRetry(() =>
    generateText({
      model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxOutputTokens: 8000,
    }),
  );

  const aiText = result.text;
  logger.log('[AI Site Editor] Raw AI response length:', aiText.length);
  logger.log('[AI Site Editor] Response preview:', aiText.substring(0, 300));

  // Parse FILE blocks from response (pass filesToRead as fallback for bare code blocks)
  const changes = parseAIResponseForFileChanges(aiText, filesToRead);
  logger.log('[AI Site Editor] Parsed changes:', changes.length);

  return { aiText, changes };
}

// ─── POST handler ──────────────────────────────────────────────────────────────

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    logger.log('[AI Site Editor] Request received');

    const body = await req.json();
    logger.log('[AI Site Editor] Body parsed:', {
      message: body.message?.substring(0, 50),
      userId: body.userId,
      plan: body.plan,
    });

    const { message, userId, organizationId, plan } = body;

    if (!message || !userId || !organizationId) {
      console.error('[AI Site Editor] Missing fields:', {
        message: !!message,
        userId: !!userId,
        organizationId: !!organizationId,
      });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    logger.log('[AI Site Editor] Detecting edit type...');
    const editType = detectEditType(message);
    logger.log('[AI Site Editor] Edit type:', editType);

    // Проверяем лимиты плана
    logger.log('[AI Site Editor] Checking limits...');
    const canEdit = await fetchQuery(api.aiSiteEditor.canMakeEdit, {
      userId: userId as Id<'users'>,
      organizationId: organizationId as Id<'organizations'>,
      editType,
    });
    logger.log('[AI Site Editor] Can edit:', canEdit);

    if (!canEdit.allowed) {
      return NextResponse.json(
        { error: canEdit.reason, limitReached: true, upgradeRequired: true },
        { status: 403 },
      );
    }

    // Создаем сессию
    const sessionId = await fetchMutation(api.aiSiteEditor.createSession, {
      userId: userId as Id<'users'>,
      organizationId: organizationId as Id<'organizations'>,
      userMessage: message,
      editType,
    });

    // Находим релевантные файлы для контекста
    const filesToRead = findRelevantFiles(message);
    logger.log('[AI Site Editor] Files to read:', filesToRead);

    const appliedFiles: Array<{ file: string; type: string; description: string }> = [];
    let aiText = '';

    // Force CSS patch mode if any of the files are too large for full rewrite
    const forceCSSPatch = filesToRead.some((f) =>
      CSS_PATCH_ONLY_FILES.some((large) => f.includes(large) || large.includes(f)),
    );

    if (editType === 'design' || forceCSSPatch) {
      // CSS patch mode — AI returns only class replacements, server applies them
      // This avoids rewriting large files and prevents truncation issues
      logger.log('[AI Site Editor] Using CSS patch mode for design change...');
      const { aiText: patchAiText, patches } = await generateCSSPatches(message, filesToRead);
      aiText = patchAiText;
      logger.log('[AI Site Editor] CSS patches generated:', patches.length);

      for (const patch of patches) {
        const result = applyCSSPatch(
          patch.filePath,
          patch.oldClass,
          patch.newClass,
          'AI CSS Patch',
        );
        if (result.success) {
          appliedFiles.push({
            file: patch.filePath,
            type: editType,
            description: `CSS patch: "${patch.oldClass}" → "${patch.newClass}"`,
          });
        } else {
          logger.warn('[AI Site Editor] CSS patch failed:', result.error);
        }
      }

      // If no patches found, inform user — do NOT make a second API call
      if (patches.length === 0) {
        logger.log('[AI Site Editor] No CSS patches found in AI response.');
        aiText =
          aiText ||
          'AI не смог определить конкретные классы для изменения. Попробуйте уточнить запрос, например: "измени hover цвет кнопки manage orgs на синий".';
      }
    } else {
      // Full file mode for content/layout/logic/full_control changes
      logger.log('[AI Site Editor] Using full file mode...');
      const { aiText: fullAiText, changes } = await generateFileChanges(message, plan, filesToRead);
      aiText = fullAiText;
      for (const change of changes) {
        const result = writeFileSecure(change.filePath, change.content, change.description);
        if (result.success) {
          appliedFiles.push({
            file: change.filePath,
            type: editType,
            description: change.description,
          });
          logger.log('[AI Site Editor] Applied:', change.filePath);
        } else {
          logger.warn('[AI Site Editor] Failed to apply:', change.filePath, result.error);
        }
      }
    }

    const changesMade = appliedFiles;

    // Обновляем сессию в Convex
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateSessionMutation: any = api.aiSiteEditor.updateSession;
    await fetchMutation(updateSessionMutation, {
      sessionId: sessionId as Id<'aiSiteEditorSessions'>,
      aiResponse: aiText,
      changesMade,
      status: 'completed',
      tokensUsed: undefined,
    });

    // Увеличиваем счётчик использования
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const incrementUsageMutation: any = api.aiSiteEditor.incrementUsage;
    await fetchMutation(incrementUsageMutation, {
      userId: userId as Id<'users'>,
      organizationId: organizationId as Id<'organizations'>,
      editType,
    });

    // Возвращаем JSON ответ
    return NextResponse.json({
      success: true,
      response: aiText,
      appliedFiles: changesMade,
      editType,
      sessionId,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('=== AI Site Editor Error ===');
    console.error('Message:', error?.message);
    console.error('Stack:', error?.stack);
    console.error('Full error:', error);

    // Возвращаем детальную ошибку для отладки
    return NextResponse.json(
      {
        error: error?.message || 'Internal server error',
        details: String(error),
        type: error?.name || 'Error',
        // Всегда показываем stack в dev режиме
        stack: error?.stack,
      },
      { status: 500 },
    );
  }
});
