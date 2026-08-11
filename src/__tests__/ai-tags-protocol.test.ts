/**
 * Tests for the AI assistant control-tag protocol (src/lib/ai/tags.ts),
 * long-term memory helpers (src/lib/ai/memory.ts) and role route allow-lists
 * (src/lib/ai/assistantRoutes.ts).
 */

import { parseAssistantTags, stripControlTags, stripPartialTail } from '@/lib/ai/tags';
import { extractMemoryFacts, stripMemoryTags, MEMORY_PER_REPLY } from '@/lib/ai/memory';
import { assistantRoutesForRole, canNavigate } from '@/lib/ai/assistantRoutes';

describe('stripControlTags', () => {
  it('removes every complete control tag', () => {
    const raw =
      'Hello!\n<NAVIGATE>/leaves</NAVIGATE>\n<SUGGEST>a|b</SUGGEST>\n<SOURCES>x</SOURCES>\n<REMEMBER>fact</REMEMBER>\n<IMAGE>cat</IMAGE>\n<WEB_SEARCH>q</WEB_SEARCH>';
    expect(stripControlTags(raw)).toBe('Hello!');
  });

  it('strips ARTIFACT tags including the type attribute', () => {
    const raw = 'Before <ARTIFACT type="html"><b>hi</b></ARTIFACT> after';
    expect(stripControlTags(raw)).toBe('Before  after');
  });

  it('removes a dangling tag at the end of a mid-stream chunk', () => {
    expect(stripControlTags('Answer <NAVIGATE>/dash')).toBe('Answer');
    expect(stripControlTags('Answer <SUGGE')).toBe('Answer');
  });

  it('collapses extra blank lines left behind', () => {
    const raw = 'Line one\n\n\n\n<REMEMBER>x</REMEMBER>\n\nLine two';
    expect(stripControlTags(raw)).toBe('Line one\n\nLine two');
  });

  it('keeps markup that merely looks like the start of a control tag', () => {
    // The dangling-tag cleanup used to match `<` plus any single letter from
    // N/S/R/I/W/A and delete everything to the end of the reply, so an answer
    // mentioning any of these lost its entire tail — or all of it, when the
    // token appeared early.
    expect(stripControlTags('Fill the <Address> field, then press Save.')).toBe(
      'Fill the <Address> field, then press Save.',
    );
    expect(stripControlTags('<name> is required. Here is the rest of the answer.')).toBe(
      '<name> is required. Here is the rest of the answer.',
    );
    expect(stripControlTags('Use <input type="text"> for the form. Then submit it.')).toBe(
      'Use <input type="text"> for the form. Then submit it.',
    );
  });

  it('only trims a partial tag name that could still become a real tag', () => {
    expect(stripControlTags('Answer <SOUR')).toBe('Answer');
    expect(stripControlTags('Answer <ARTIF')).toBe('Answer');
    // Not a prefix of any control tag — must survive.
    expect(stripControlTags('Answer <XYZ')).toBe('Answer <XYZ');
  });
});

describe('stripPartialTail', () => {
  it('cuts an unclosed tag start at the tail', () => {
    expect(stripPartialTail('hello <NAVI')).toBe('hello ');
  });

  it('keeps text when the last tag is closed', () => {
    expect(stripPartialTail('hello <b>x</b>')).toBe('hello <b>x</b>');
  });

  it('keeps text without any angle brackets', () => {
    expect(stripPartialTail('plain text')).toBe('plain text');
  });
});

describe('parseAssistantTags', () => {
  it('extracts navigation target', () => {
    expect(parseAssistantTags('ok <NAVIGATE>/calendar</NAVIGATE>').navigateTo).toBe('/calendar');
  });

  it('extracts up to three suggestion chips', () => {
    const parsed = parseAssistantTags('done <SUGGEST>one|two|three|four</SUGGEST>');
    expect(parsed.suggestions).toEqual(['one', 'two', 'three']);
  });

  it('extracts source labels', () => {
    const parsed = parseAssistantTags('<SOURCES>Leave policy|Attendance</SOURCES>Answer');
    expect(parsed.sources).toEqual(['Leave policy', 'Attendance']);
    expect(parsed.cleanContent).toBe('Answer');
  });

  it('extracts image prompt and web search query', () => {
    const parsed = parseAssistantTags(
      'Sure <IMAGE>a red panda</IMAGE> and <WEB_SEARCH>HR trends 2026</WEB_SEARCH>',
    );
    expect(parsed.imagePrompt).toBe('a red panda');
    expect(parsed.webSearchQuery).toBe('HR trends 2026');
  });

  it('extracts artifacts with type and defaults to markdown', () => {
    const parsed = parseAssistantTags(
      '<ARTIFACT type="react">function App(){return null}</ARTIFACT><ARTIFACT># Doc</ARTIFACT>',
    );
    expect(parsed.artifacts).toHaveLength(2);
    expect(parsed.artifacts[0]).toEqual({
      type: 'react',
      content: 'function App(){return null}',
    });
    expect(parsed.artifacts[1]?.type).toBe('markdown');
  });

  it('normalises unknown artifact types to code', () => {
    const parsed = parseAssistantTags('<ARTIFACT type="exe">x</ARTIFACT>');
    expect(parsed.artifacts[0]?.type).toBe('code');
  });

  it('returns empty fields for plain text', () => {
    const parsed = parseAssistantTags('Just a normal answer.');
    expect(parsed.cleanContent).toBe('Just a normal answer.');
    expect(parsed.navigateTo).toBeNull();
    expect(parsed.suggestions).toEqual([]);
    expect(parsed.sources).toEqual([]);
    expect(parsed.imagePrompt).toBeNull();
    expect(parsed.webSearchQuery).toBeNull();
    expect(parsed.artifacts).toEqual([]);
  });
});

describe('extractMemoryFacts', () => {
  it('extracts and trims facts', () => {
    expect(extractMemoryFacts('ok <REMEMBER>Prefers short answers</REMEMBER>')).toEqual([
      'Prefers short answers',
    ]);
  });

  it('dedupes case-insensitively', () => {
    const facts = extractMemoryFacts(
      '<REMEMBER>Likes coffee</REMEMBER><REMEMBER>likes coffee</REMEMBER>',
    );
    expect(facts).toEqual(['Likes coffee']);
  });

  it('caps at MEMORY_PER_REPLY facts', () => {
    const raw = Array.from({ length: 8 }, (_, i) => `<REMEMBER>fact ${i}</REMEMBER>`).join('');
    expect(extractMemoryFacts(raw)).toHaveLength(MEMORY_PER_REPLY);
  });

  it('collapses whitespace and caps length', () => {
    const facts = extractMemoryFacts(`<REMEMBER>${'x'.repeat(500)}</REMEMBER>`);
    expect(facts[0]?.length).toBeLessThanOrEqual(240);
  });

  it('returns [] for empty input', () => {
    expect(extractMemoryFacts('')).toEqual([]);
    expect(extractMemoryFacts('no tags here')).toEqual([]);
  });
});

describe('stripMemoryTags', () => {
  it('removes complete and dangling REMEMBER tags', () => {
    expect(stripMemoryTags('a <REMEMBER>x</REMEMBER> b')).toBe('a  b');
    expect(stripMemoryTags('a <REMEMBER>partial')).toBe('a ');
    expect(stripMemoryTags('a <REMEMB')).toBe('a ');
  });
});

describe('assistantRoutesForRole', () => {
  // The allow-lists mirror the sidebar's own role arrays: refusing to navigate
  // to a page the user can already open from the sidebar is a bug, not caution.
  // `/employees` is the team directory and is visible to every role in this
  // product; `/recruitment` sits in the talent group, which supervisors see.
  it('gives an employee self-service and shared pages, not management ones', () => {
    const routes = assistantRoutesForRole('employee');
    expect(routes).toContain('/leaves');
    expect(routes).toContain('/employees');
    expect(routes).not.toContain('/payroll');
    expect(routes).not.toContain('/analytics');
    expect(routes).not.toContain('/superadmin');
  });

  it('adds the driver console for a driver and nothing managerial', () => {
    const routes = assistantRoutesForRole('driver');
    expect(routes).toContain('/drivers');
    expect(routes).toContain('/leaves');
    expect(routes).not.toContain('/analytics');
    expect(routes).not.toContain('/superadmin');
  });

  it('supervisor adds team, talent and finance pages but no admin console', () => {
    const routes = assistantRoutesForRole('supervisor');
    expect(routes).toContain('/analytics');
    expect(routes).toContain('/recruitment');
    expect(routes).toContain('/payroll');
    expect(routes).not.toContain('/admin');
    expect(routes).not.toContain('/superadmin');
  });

  it('admin adds the admin console but not superadmin pages', () => {
    const routes = assistantRoutesForRole('admin');
    expect(routes).toContain('/admin');
    expect(routes).toContain('/admin/holidays');
    expect(routes).toContain('/compliance');
    expect(routes).not.toContain('/superadmin');
    expect(routes).not.toContain('/ai-site-editor');
  });

  it('superadmin gets everything', () => {
    const routes = assistantRoutesForRole('superadmin');
    expect(routes).toContain('/superadmin');
    expect(routes).toContain('/superadmin/backups');
    expect(routes).toContain('/ai-site-editor');
    expect(routes).toContain('/leaves');
  });

  it('only lists paths that exist in the router', () => {
    // These were in the allow-list but have no page, so <NAVIGATE> to them 404'd.
    const dead = [
      '/messenger',
      '/help-desk',
      '/meeting-rooms',
      '/corporate',
      '/document-builder',
      '/audit',
      '/integrations',
      '/security',
      '/superadmin/billing',
    ];
    const routes = assistantRoutesForRole('superadmin');
    for (const path of dead) expect(routes).not.toContain(path);
  });
});

describe('canNavigate', () => {
  it('allows an employee to open /leaves but not /payroll', () => {
    expect(canNavigate('employee', '/leaves')).toBe(true);
    expect(canNavigate('employee', '/payroll')).toBe(false);
  });

  it('allows sub-paths of an allowed route', () => {
    expect(canNavigate('superadmin', '/superadmin/backups')).toBe(true);
  });

  it('rejects unknown paths', () => {
    expect(canNavigate('superadmin', '/not-a-page')).toBe(false);
  });
});
