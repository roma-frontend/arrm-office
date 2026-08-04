/**
 * Tests for POST /api/ai-site-editor route handler — error handling.
 *
 * Focus: pre-flight validation must short-circuit cleanly (400 missing fields,
 * 403 plan limit), and the catch block must always answer with a 500 carrying a
 * debug-friendly body ({ error, details, type, stack }) — never a raw throw.
 */

jest.mock('next/server', () => {
  const mockJson = jest.fn((body: unknown, init?: { status?: number }) => {
    const status = init?.status ?? 200;
    return {
      status,
      headers: new Headers(),
      json: async () => body,
      ok: status >= 200 && status < 300,
    };
  });

  return {
    NextRequest: class MockNextRequest {
      method = 'POST';
      constructor(init?: { method?: string }) {
        this.method = init?.method || 'POST';
      }
    },
    NextResponse: { json: mockJson },
  };
});

// CSRF checks pass so the wrapped handler actually runs.
jest.mock('@/lib/csrf', () => ({
  verifyCsrfFromRequest: jest.fn().mockReturnValue(true),
  requiresCsrfProtection: jest.fn().mockReturnValue(true),
}));

jest.mock('convex/nextjs', () => ({
  fetchQuery: jest.fn(),
  fetchMutation: jest.fn(),
}));

jest.mock('@/convex/_generated/api', () => ({
  api: {
    aiSiteEditor: {
      canMakeEdit: {},
      createSession: {},
      updateSession: {},
      incrementUsage: {},
    },
  },
}));

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(() => jest.fn()),
}));

// Route handlers touch the filesystem (readFileSecure / applyCSSPatch). Mock it
// so the happy path runs against in-memory content instead of real repo files.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  mkdirSync: jest.fn(),
  copyFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
}));

// ── Imports after mocks ─────────────────────────────────────────────────────
import {
  POST,
  findRelevantFiles,
  isPathAllowed,
  parseAIResponseForFileChanges,
  parseCSSPatches,
} from '@/app/api/ai-site-editor/route';
import { fetchQuery, fetchMutation } from 'convex/nextjs';
import { logger } from '@/lib/logger';

const { verifyCsrfFromRequest } = jest.requireMock('@/lib/csrf');

const VALID_BODY = {
  message: 'сделай красивый hover у кнопки',
  userId: 'users_convex123',
  organizationId: 'orgs_convex123',
};

function makeRequest(body: unknown): { method: string; json: () => Promise<unknown> } {
  return {
    method: 'POST',
    json: async () => body,
  };
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  // Keep the test output clean — the handler logs errors deliberately.
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});

describe('POST /api/ai-site-editor error handling', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await POST(makeRequest({ message: 'только сообщение' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing required fields' });
    // Pre-flight failure must not touch Convex at all.
    expect(fetchQuery).not.toHaveBeenCalled();
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it('runs the handler through the CSRF wrapper', async () => {
    await POST(makeRequest({ message: 'x' }));

    expect(verifyCsrfFromRequest).toHaveBeenCalled();
  });

  it('returns 403 and short-circuits when the plan limit is reached', async () => {
    (fetchQuery as jest.Mock).mockResolvedValue({
      allowed: false,
      reason: 'Monthly AI edit limit reached',
    });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'Monthly AI edit limit reached',
      limitReached: true,
      upgradeRequired: true,
    });
    // The handler must stop before creating a session / calling the AI.
    expect(fetchMutation).not.toHaveBeenCalled();
  });

  it('returns 500 with debug details when a Convex call throws', async () => {
    (fetchQuery as jest.Mock).mockRejectedValue(new Error('Convex exploded'));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'Convex exploded',
      details: 'Error: Convex exploded',
      type: 'Error',
      stack: expect.any(String),
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns 500 and sanitizes a non-Error throw', async () => {
    (fetchQuery as jest.Mock).mockRejectedValue('string rejection');

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: 'string rejection',
      details: 'string rejection',
      type: 'Error',
      stack: expect.any(String),
    });
  });

  it('returns 200 with appliedFiles when CSS patches are generated and applied', async () => {
    const fs = jest.requireMock('fs');
    const { generateText } = jest.requireMock('ai');

    // 'dashboard' in the message → editType 'design' and the file lookup maps to
    // DashboardClient.tsx, which is also a CSS_PATCH_ONLY file → patch mode.
    const oldClass = 'border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950';
    const newClass = 'border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40';
    const patchText =
      'PATCH: src/components/dashboard/DashboardClient.tsx\n' +
      `OLD: "${oldClass}"\n` +
      `NEW: "${newClass}"`;

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(`const classes = "${oldClass}";`);
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });

    (generateText as jest.Mock).mockResolvedValue({ text: patchText });
    (fetchQuery as jest.Mock).mockResolvedValue({ allowed: true });
    // Same resolved value for createSession (returned), updateSession and
    // incrementUsage (return values ignored).
    (fetchMutation as jest.Mock).mockResolvedValue('session_convex123');

    const res = await POST(
      makeRequest({
        message: 'сделай dashboard красивее',
        userId: 'users_convex123',
        organizationId: 'orgs_convex123',
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      response: patchText,
      appliedFiles: [
        {
          file: 'src/components/dashboard/DashboardClient.tsx',
          type: 'design',
          description: `CSS patch: "${oldClass}" → "${newClass}"`,
        },
      ],
      editType: 'design',
      sessionId: 'session_convex123',
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    // createSession + updateSession + incrementUsage
    expect(fetchMutation).toHaveBeenCalledTimes(3);
  });

  it('returns 200 with appliedFiles when full-file mode applies FILE blocks', async () => {
    const fs = jest.requireMock('fs');
    const { generateText } = jest.requireMock('ai');

    // 'текст' → editType 'content'; 'settings' maps to a single file that is NOT
    // in CSS_PATCH_ONLY_FILES, so the handler runs full-file mode.
    const newContent =
      'export default function SettingsPage() {\n' +
      '  return (\n' +
      '    <div>\n' +
      '      <h1>Настройки</h1>\n' +
      '    </div>\n' +
      '  );\n' +
      '}\n';
    const fileBlock =
      'FILE: src/app/(dashboard)/settings/page.tsx\n' + '```tsx\n' + newContent + '```';

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('old page content');
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    // Small original size → writeFileSecure's truncation safety check is skipped.
    (fs.statSync as jest.Mock).mockReturnValue({ size: 200 });

    (generateText as jest.Mock).mockResolvedValue({ text: fileBlock });
    (fetchQuery as jest.Mock).mockResolvedValue({ allowed: true });
    (fetchMutation as jest.Mock).mockResolvedValue('session_convex123');

    const res = await POST(
      makeRequest({
        message: 'измени текст на settings странице',
        userId: 'users_convex123',
        organizationId: 'orgs_convex123',
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      response: fileBlock,
      appliedFiles: [
        {
          file: 'src/app/(dashboard)/settings/page.tsx',
          type: 'content',
          description: 'AI Site Editor: Auto-applied changes',
        },
      ],
      editType: 'content',
      sessionId: 'session_convex123',
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('page.tsx'),
      newContent,
      'utf-8',
    );
    expect(fetchMutation).toHaveBeenCalledTimes(3);
  });

  it('full-file mode drops FILE blocks targeting forbidden paths', async () => {
    const fs = jest.requireMock('fs');
    const { generateText } = jest.requireMock('ai');

    // AI tries to write into convex/ (forbidden) alongside a valid change — the
    // forbidden block must be filtered out and only the allowed one applied.
    const goodContent = 'export default function SettingsPage() { return <h1>Настройки</h1>; }\n';
    const responseText =
      'FILE: convex/evil.ts\n' +
      '```ts\n' +
      'x = 1;\n' +
      '```\n' +
      'FILE: src/app/(dashboard)/settings/page.tsx\n' +
      '```tsx\n' +
      goodContent +
      '```';

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('old page content');
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.statSync as jest.Mock).mockReturnValue({ size: 200 });

    (generateText as jest.Mock).mockResolvedValue({ text: responseText });
    (fetchQuery as jest.Mock).mockResolvedValue({ allowed: true });
    (fetchMutation as jest.Mock).mockResolvedValue('session_convex123');

    const res = await POST(
      makeRequest({
        message: 'измени текст на settings странице',
        userId: 'users_convex123',
        organizationId: 'orgs_convex123',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appliedFiles).toEqual([
      {
        file: 'src/app/(dashboard)/settings/page.tsx',
        type: 'content',
        description: 'AI Site Editor: Auto-applied changes',
      },
    ]);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('page.tsx'),
      goodContent,
      'utf-8',
    );
    expect(fs.writeFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining('evil.ts'),
      expect.any(String),
      'utf-8',
    );
  });
});

describe('route helpers', () => {
  beforeEach(() => {
    // Keep the component scan inert — no real filesystem access in unit tests.
    const fs = jest.requireMock('fs');
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
  });

  describe('isPathAllowed', () => {
    it('allows whitelisted paths', () => {
      expect(isPathAllowed('src/components/foo/Bar.tsx')).toBe(true);
      expect(isPathAllowed('src/app/(dashboard)/dashboard/page.tsx')).toBe(true);
      expect(isPathAllowed('src/i18n/locales/ru.json')).toBe(true);
    });

    it('rejects paths inside forbidden directories', () => {
      expect(isPathAllowed('src/components/ui/Button.tsx')).toBe(false);
      expect(isPathAllowed('convex/foo.ts')).toBe(false);
      expect(isPathAllowed('src/app/api/foo/route.ts')).toBe(false);
    });

    it('rejects sensitive/root files', () => {
      expect(isPathAllowed('package.json')).toBe(false);
      expect(isPathAllowed('tsconfig.json')).toBe(false);
      expect(isPathAllowed('next.config.js')).toBe(false);
      expect(isPathAllowed('middleware.ts')).toBe(false);
      expect(isPathAllowed('.env.local')).toBe(false);
      expect(isPathAllowed('node_modules/pkg/index.js')).toBe(false);
    });

    it('rejects paths outside the whitelist', () => {
      expect(isPathAllowed('src/lib/foo.ts')).toBe(false);
      expect(isPathAllowed('random/file.ts')).toBe(false);
    });
  });

  describe('parseCSSPatches', () => {
    it('extracts a double-quoted PATCH block', () => {
      const response = [
        'PATCH: src/components/dashboard/DashboardClient.tsx',
        'OLD: "border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950"',
        'NEW: "border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"',
        '',
        'Объяснение на русском.',
      ].join('\n');

      expect(parseCSSPatches(response)).toEqual([
        {
          filePath: 'src/components/dashboard/DashboardClient.tsx',
          oldClass: 'border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950',
          newClass: 'border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40',
        },
      ]);
    });

    it('extracts single-quoted PATCH blocks', () => {
      const response =
        "PATCH: src/components/leaves/LeavesClient.tsx\nOLD: 'bg-white'\nNEW: 'bg-slate-50'";

      expect(parseCSSPatches(response)).toEqual([
        {
          filePath: 'src/components/leaves/LeavesClient.tsx',
          oldClass: 'bg-white',
          newClass: 'bg-slate-50',
        },
      ]);
    });

    it('extracts multiline backtick OLD/NEW values', () => {
      const response =
        'PATCH: src/components/foo/Bar.tsx\n' +
        'OLD: `bg-white\n  text-black`\n' +
        'NEW: `bg-slate-50\n  text-gray-900`';

      expect(parseCSSPatches(response)).toEqual([
        {
          filePath: 'src/components/foo/Bar.tsx',
          oldClass: 'bg-white\n  text-black',
          newClass: 'bg-slate-50\n  text-gray-900',
        },
      ]);
    });

    it('drops PATCH blocks targeting forbidden paths', () => {
      expect(parseCSSPatches('PATCH: convex/foo.ts\nOLD: "a"\nNEW: "b"')).toEqual([]);
    });

    it('returns an empty array when no PATCH blocks are present', () => {
      expect(parseCSSPatches('Просто текст без патчей')).toEqual([]);
      expect(parseCSSPatches('PATCH: src/components/foo/Bar.tsx')).toEqual([]);
    });
  });

  describe('findRelevantFiles', () => {
    it('maps keyword matches to files', () => {
      const files = findRelevantFiles('сделай dashboard красивее');

      expect(files).toContain('src/components/dashboard/DashboardClient.tsx');
      expect(files).toContain('src/app/(dashboard)/dashboard/page.tsx');
    });

    it('matches explicit file paths mentioned in the message', () => {
      const files = findRelevantFiles('поправь src/components/leaves/LeavesClient.tsx');

      expect(files).toContain('src/components/leaves/LeavesClient.tsx');
    });

    it('adds all locale files for translation requests', () => {
      const files = findRelevantFiles('обнови перевод в i18n');

      expect(files).toContain('src/i18n/locales/en.json');
      expect(files).toContain('src/i18n/locales/ru.json');
      expect(files).toContain('src/i18n/locales/hy.json');
    });

    it('returns an empty list for an unrelated message', () => {
      expect(findRelevantFiles('привет')).toEqual([]);
    });
  });

  describe('parseAIResponseForFileChanges', () => {
    const EXPECTED_DESCRIPTION = 'AI Site Editor: Auto-applied changes';

    it('extracts a FILE: block (Pattern 1)', () => {
      const response =
        'FILE: src/components/foo/Bar.tsx\n' +
        '```tsx\n' +
        'export const Bar = () => <div>hi</div>;\n' +
        '```\n' +
        'После блоков пояснение на русском.';

      expect(parseAIResponseForFileChanges(response)).toEqual([
        {
          filePath: 'src/components/foo/Bar.tsx',
          content: 'export const Bar = () => <div>hi</div>;\n',
          description: EXPECTED_DESCRIPTION,
        },
      ]);
    });

    it('extracts multiple FILE: blocks in one response', () => {
      const response =
        'FILE: src/components/foo/A.tsx\n```tsx\nexport const A = 1;\n```\n' +
        'FILE: src/app/(dashboard)/settings/page.tsx\n' +
        '```tsx\nexport default function Page() {}\n```';

      const changes = parseAIResponseForFileChanges(response);

      expect(changes).toHaveLength(2);
      expect(changes[0].filePath).toBe('src/components/foo/A.tsx');
      expect(changes[1].filePath).toBe('src/app/(dashboard)/settings/page.tsx');
      expect(changes[1].content).toContain('export default function Page()');
    });

    it('drops FILE: blocks targeting forbidden paths', () => {
      const response = 'FILE: convex/evil.ts\n```ts\nx = 1;\n```';

      expect(parseAIResponseForFileChanges(response)).toEqual([]);
    });

    it('drops FILE: blocks with truncated content', () => {
      const cases = [
        'FILE: src/components/foo/Bar.tsx\n```tsx\nconst x = 1;\n// rest remains\n```',
        'FILE: src/components/foo/Bar.tsx\n```tsx\nconst x = 1;\n... [TRUNCATED]\n```',
        'FILE: src/components/foo/Bar.tsx\n```tsx\nconst x = 1;\n/* ... */\n```',
        'FILE: src/components/foo/Bar.tsx\n```tsx\nconst x = 1;\n// остальной код\n```',
      ];

      for (const response of cases) {
        expect(parseAIResponseForFileChanges(response)).toEqual([]);
      }
    });

    it('extracts a path-only block without FILE: prefix (Pattern 2)', () => {
      const response =
        'src/components/foo/Bar.tsx\n' + '```tsx\n' + 'export const Bar = 1;\n' + '```';

      expect(parseAIResponseForFileChanges(response)).toEqual([
        {
          filePath: 'src/components/foo/Bar.tsx',
          content: 'export const Bar = 1;\n',
          description: EXPECTED_DESCRIPTION,
        },
      ]);
    });

    it('applies a bare code block to the single fallback file (Pattern 3)', () => {
      const response = '```tsx\nexport const Bar = 1;\n```';

      expect(parseAIResponseForFileChanges(response, ['src/components/foo/Bar.tsx'])).toEqual([
        {
          filePath: 'src/components/foo/Bar.tsx',
          content: 'export const Bar = 1;\n',
          description: EXPECTED_DESCRIPTION,
        },
      ]);
    });

    it('does not use fallback when multiple fallback files are given', () => {
      const response = '```tsx\nexport const Bar = 1;\n```';

      expect(
        parseAIResponseForFileChanges(response, [
          'src/components/foo/Bar.tsx',
          'src/components/foo/Baz.tsx',
        ]),
      ).toEqual([]);
    });

    it('skips truncated bare code blocks in fallback mode', () => {
      const response = '```tsx\nconst x = 1;\n... [TRUNCATED]\n```';

      expect(parseAIResponseForFileChanges(response, ['src/components/foo/Bar.tsx'])).toEqual([]);
    });

    it('returns an empty array for a response without code blocks', () => {
      expect(parseAIResponseForFileChanges('Просто текст без блоков')).toEqual([]);
    });
  });
});
