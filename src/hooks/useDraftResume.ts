'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthUser } from '@/store/useAuthStore';
import { clearWizardDraft, peekWizardDraft } from '@/hooks/useWizardDraft';

/**
 * The other half of draft persistence: telling the user a draft exists.
 *
 * `useWizardDraft` already keeps a form's contents alive across an accidental
 * close, but nothing said so — the draft only surfaced if the user happened to
 * open the same form again, which is exactly what somebody who closed it by
 * mistake does not do. This hook reports whether a draft is waiting under `key`
 * so the parent can offer a one-click resume.
 *
 * It reads storage once per open→closed transition rather than polling. That is
 * the only moment a draft can appear: `watch` is derived from the form's own
 * `open` flag, and `useWizardDraft` flushes to `sessionStorage` in the cleanup
 * that runs when it is disabled — cleanups run before effects in the same
 * commit, so by the time this hook re-reads, the draft is already there.
 */
export interface DraftResumeState {
  /** A non-empty draft is waiting. */
  available: boolean;
  /** Step the user stopped on (0-based). */
  step: number;
  /** Epoch ms of the last write. */
  savedAt: number | null;
  /** Hide the prompt but keep the draft — it still restores on reopen. */
  dismiss: () => void;
  /** Throw the draft away. */
  discard: () => void;
}

export function useDraftResume(
  key: string | null | undefined,
  /** Pass `false` while the form is open — a prompt over the form is noise. */
  watch = true,
): DraftResumeState {
  const userId = useAuthUser()?.id ?? null;
  const [snapshot, setSnapshot] = useState<{ step: number; savedAt: number } | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!key || !watch) return;
    // Deferred by a tick rather than run in the effect body: a synchronous
    // setState here would cascade a second render on every mount of every page
    // that watches a draft, for a value that is almost always null.
    const id = window.setTimeout(() => setSnapshot(peekWizardDraft(key, userId)), 0);
    return () => window.clearTimeout(id);
  }, [key, watch, userId]);

  const dismiss = useCallback(() => setDismissedAt(Date.now()), []);

  const discard = useCallback(() => {
    if (key) clearWizardDraft(key, userId);
    setSnapshot(null);
    setDismissedAt(null);
  }, [key, userId]);

  // A dismissal covers the draft as it was. Typing more into the form and
  // closing it again writes a newer `savedAt`, which re-arms the prompt.
  const suppressed = dismissedAt !== null && snapshot !== null && snapshot.savedAt <= dismissedAt;

  return {
    // `watch` is applied here rather than by clearing `snapshot` in the effect:
    // the stale value is harmless while it is gated, and clearing it would mean
    // another setState in an effect body.
    available: Boolean(key) && watch && Boolean(snapshot) && !suppressed,
    step: snapshot?.step ?? 0,
    savedAt: snapshot?.savedAt ?? null,
    dismiss,
    discard,
  };
}
