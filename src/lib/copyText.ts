/**
 * Copy text to the clipboard, with the fallback the async API still needs.
 *
 * `navigator.clipboard` is unavailable on plain-HTTP origins (a self-hosted
 * install reached by LAN IP, which is how this app is often demoed) and can
 * reject when the document is not focused or permission was denied. The
 * `execCommand('copy')` path is deprecated but still the only thing that works
 * in those cases, so it stays as a second attempt rather than a first choice.
 *
 * Returns whether the text made it to the clipboard, so callers can show a
 * failure instead of a false "Copied".
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }

  if (typeof document === 'undefined') return false;

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but still focusable: `display: none` or `hidden` would make
    // the selection — and therefore the copy — a no-op.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Hands `content` to the browser as a file download.
 *
 * Kept next to {@link copyText} because both are the same kind of thing: a tiny
 * piece of browser plumbing that every export surface would otherwise reinvent
 * (and forget to revoke the object URL in).
 */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoked on the next tick: Safari cancels an in-flight download if the URL
  // is released synchronously after the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
