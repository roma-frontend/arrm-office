/**
 * Tests for `@/lib/copyText`.
 *
 * The point of the module is the fallback, so each test pins one of the ways
 * `navigator.clipboard` is unavailable: absent (plain-HTTP origin), rejecting
 * (permission denied), or present and working.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { copyText, downloadTextFile } from '@/lib/copyText';

const originalClipboard = (navigator as { clipboard?: unknown }).clipboard;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('copyText', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    setClipboard(originalClipboard);
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it('uses the async clipboard when it is available', async () => {
    const writeText = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when there is no clipboard API', async () => {
    setClipboard(undefined);
    const execCommand = jest.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;

    await expect(copyText('lan-demo')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back when the clipboard API rejects', async () => {
    setClipboard({
      writeText: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('nope')),
    });
    const execCommand = jest.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;

    await expect(copyText('denied')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalled();
  });

  it('reports failure when both paths fail, so no false "Copied"', async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: unknown }).execCommand = jest.fn(() => false);
    await expect(copyText('x')).resolves.toBe(false);
  });

  it('survives execCommand throwing', async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: unknown }).execCommand = jest.fn(() => {
      throw new Error('unsupported');
    });
    await expect(copyText('x')).resolves.toBe(false);
  });

  it('leaves no textarea behind', async () => {
    setClipboard(undefined);
    (document as unknown as { execCommand: unknown }).execCommand = jest.fn(() => true);
    await copyText('x');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('keeps the scratch textarea selectable rather than display:none', async () => {
    setClipboard(undefined);
    let seen: HTMLTextAreaElement | null = null;
    (document as unknown as { execCommand: unknown }).execCommand = jest.fn(() => {
      seen = document.querySelector('textarea');
      return true;
    });
    await copyText('visible-but-offscreen');
    expect(seen).not.toBeNull();
    expect(seen!.value).toBe('visible-but-offscreen');
    expect(seen!.style.display).not.toBe('none');
    expect(seen!.style.position).toBe('fixed');
  });
});

describe('downloadTextFile', () => {
  const createObjectURL = jest.fn(() => 'blob:mock');
  const revokeObjectURL = jest.fn();
  /** Anchors created by the module, with `click` neutralised (jsdom cannot navigate). */
  let anchors: HTMLAnchorElement[] = [];
  let createElement: ReturnType<typeof jest.spyOn> | null = null;

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    anchors = [];
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    document.body.innerHTML = '';

    const real = document.createElement.bind(document);
    createElement = jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = real(tag);
      if (tag === 'a') {
        const anchor = el as HTMLAnchorElement;
        anchor.click = () => {
          anchors.push(anchor);
        };
      }
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    createElement?.mockRestore();
    createElement = null;
  });

  it('clicks a download anchor carrying the filename and the blob URL', () => {
    downloadTextFile('tasks-2026-08-22.csv', 'a,b\r\n', 'text/csv;charset=utf-8');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.download).toBe('tasks-2026-08-22.csv');
    expect(anchors[0]!.getAttribute('href')).toBe('blob:mock');
    expect(anchors[0]!.rel).toBe('noopener');
  });

  it('leaves no anchor in the document', () => {
    downloadTextFile('x.csv', 'x', 'text/csv');
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('revokes the object URL on a later tick, not synchronously', async () => {
    downloadTextFile('x.csv', 'x', 'text/csv');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
