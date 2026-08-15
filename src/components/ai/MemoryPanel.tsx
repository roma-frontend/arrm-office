'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { Brain, Trash2, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * Long-term memory manager: shows the durable facts the assistant remembered
 * about the user (via <REMEMBER> tags) and lets them review/delete/clear.
 */
export function MemoryPanel({
  userId,
  open,
  onClose,
}: {
  userId: string | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [confirmClear, setConfirmClear] = useState(false);

  const memories = useQuery(
    api.aiMemory.listMemories,
    open && userId ? { userId: userId as Id<'users'> } : 'skip',
  );
  const deleteMemory = useMutation(api.aiMemory.deleteMemory);
  const clearMemories = useMutation(api.aiMemory.clearMemories);

  if (!open) return null;

  const handleDelete = async (memoryId: string) => {
    try {
      await deleteMemory({ memoryId: memoryId as Id<'aiMemories'> });
      toast.success(t('aiChat.memory.deleted', { defaultValue: 'Memory deleted' }));
    } catch {
      toast.error(t('aiChat.memory.error', { defaultValue: 'Failed to delete memory' }));
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    if (!userId) return;
    try {
      await clearMemories({ userId: userId as Id<'users'> });
      toast.success(t('aiChat.memory.cleared', { defaultValue: 'All memories cleared' }));
      setConfirmClear(false);
    } catch {
      toast.error(t('aiChat.memory.error', { defaultValue: 'Failed to clear memories' }));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-(--border) bg-(--card) shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-(--border)">
          <Brain className="w-4 h-4 text-(--brand-text)" />
          <h3 className="text-sm font-semibold text-(--text-primary) flex-1">
            {t('aiChat.memory.title', { defaultValue: 'Assistant memory' })}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-(--background-subtle) transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-(--text-muted)" />
          </button>
        </div>

        <div className="p-4 max-h-80 overflow-y-auto">
          <p className="text-xs text-(--text-muted) mb-3">
            <Sparkles className="w-3 h-3 inline mr-1" />
            {t('aiChat.memory.description', {
              defaultValue:
                'Facts the assistant remembered from your conversations. They personalize future answers.',
            })}
          </p>

          {!memories ? (
            <p className="text-xs text-(--text-muted) py-4 text-center">…</p>
          ) : memories.length === 0 ? (
            <p className="text-xs text-(--text-muted) py-4 text-center">
              {t('aiChat.memory.empty', {
                defaultValue:
                  'No memories yet. Chat with the assistant — it will remember useful facts.',
              })}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {memories.map((m) => (
                <li
                  key={m._id}
                  className="flex items-start gap-2 rounded-lg border border-(--border) bg-(--background-subtle) px-3 py-2"
                >
                  <span className="flex-1 text-xs text-(--text-primary)">{m.content}</span>
                  <button
                    onClick={() => handleDelete(m._id)}
                    className="p-1 rounded hover:bg-(--danger-quiet) text-(--text-muted) hover:text-(--danger-text) transition-colors shrink-0"
                    aria-label="Delete memory"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {memories && memories.length > 0 && (
          <div className="px-4 py-3 border-t border-(--border)">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className={`w-full text-xs ${confirmClear ? 'text-(--danger-text) hover:opacity-80 hover:bg-(--danger-quiet)' : ''}`}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              {confirmClear
                ? t('aiChat.memory.confirmClear', { defaultValue: 'Click again to confirm' })
                : t('aiChat.memory.clearAll', { defaultValue: 'Clear all memories' })}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
