import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ─── Whitelist / Blacklist (дублируем для изоляции endpoint) ──────────────────

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

const BACKUP_DIR = () => path.join(/* turbopackIgnore: true */ process.cwd(), '.ai-editor-backups');

// ─── GET: список всех backup-ов ───────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const backupDir = BACKUP_DIR();

    if (!fs.existsSync(backupDir)) {
      return NextResponse.json({ backups: [] });
    }

    const files = fs.readdirSync(backupDir);
    const backups = files
      .filter((f) => f.endsWith('.meta.json'))
      .map((f) => {
        try {
          const raw = fs.readFileSync(path.join(backupDir, f), 'utf-8');
          return JSON.parse(raw) as {
            originalPath: string;
            timestamp: number;
            description: string;
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.timestamp - a!.timestamp);

    return NextResponse.json({ backups });
  } catch (error) {
    logger.error('Error listing backups:', error);
    return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
  }
}

// ─── POST: ручное применение изменений (fallback) ─────────────────────────────

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    const body = (await req.json()) as unknown;
    const { filePath, content, description } = body as {
      filePath: string;
      content: string;
      description?: string;
    };

    if (!filePath || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!isPathAllowed(filePath)) {
      return NextResponse.json(
        { error: 'Access denied: File is not allowed for editing' },
        { status: 403 },
      );
    }

    const fullPath = path.join(/* turbopackIgnore: true */ process.cwd(), filePath);
    const backupDir = BACKUP_DIR();
    const timestamp = Date.now();

    // Создаём backup если файл существует
    if (fs.existsSync(fullPath)) {
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.backup`);
      fs.copyFileSync(fullPath, backupPath);

      const metaPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.meta.json`);
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            originalPath: filePath,
            timestamp,
            description: description || 'Manual apply via API',
          },
          null,
          2,
        ),
      );
    }

    // Создаём директорию если нужно
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(fullPath, content, 'utf-8');

    return NextResponse.json({
      success: true,
      message: 'Changes applied successfully',
      filePath,
      timestamp,
      backupCreated: true,
    });
  } catch (error) {
    logger.error('Error applying changes:', error);
    return NextResponse.json({ error: 'Failed to apply changes' }, { status: 500 });
  }
});

// ─── DELETE: откат к backup по filePath + timestamp ───────────────────────────

export const DELETE = withCsrfProtection(async (req: NextRequest) => {
  try {
    const body = (await req.json()) as unknown;
    const { filePath, timestamp } = body as { filePath: string; timestamp: number };

    if (!filePath || !timestamp) {
      return NextResponse.json(
        { error: 'Missing required fields: filePath, timestamp' },
        { status: 400 },
      );
    }

    if (!isPathAllowed(filePath)) {
      return NextResponse.json({ error: 'Access denied: File is not allowed' }, { status: 403 });
    }

    const backupDir = BACKUP_DIR();
    const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.backup`);

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json(
        { error: `Backup not found for ${filePath} at timestamp ${timestamp}` },
        { status: 404 },
      );
    }

    const fullPath = path.join(/* turbopackIgnore: true */ process.cwd(), filePath);

    // Перед откатом — сохраняем текущее состояние как новый backup
    if (fs.existsSync(fullPath)) {
      const rollbackTs = Date.now();
      const rollbackBackupPath = path.join(
        backupDir,
        `${path.basename(filePath)}.${rollbackTs}.backup`,
      );
      fs.copyFileSync(fullPath, rollbackBackupPath);

      const rollbackMetaPath = path.join(
        backupDir,
        `${path.basename(filePath)}.${rollbackTs}.meta.json`,
      );
      fs.writeFileSync(
        rollbackMetaPath,
        JSON.stringify(
          {
            originalPath: filePath,
            timestamp: rollbackTs,
            description: `Pre-rollback snapshot (rolled back to ts=${timestamp})`,
          },
          null,
          2,
        ),
      );
    }

    // Восстанавливаем из backup
    fs.copyFileSync(backupPath, fullPath);

    return NextResponse.json({
      success: true,
      message: `Rolled back ${filePath} to backup from ${new Date(timestamp).toLocaleString('ru-RU')}`,
      filePath,
      restoredTimestamp: timestamp,
    });
  } catch (error) {
    logger.error('Error rolling back changes:', error);
    return NextResponse.json({ error: 'Failed to rollback changes' }, { status: 500 });
  }
});
