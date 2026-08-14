'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bot, User, Share2 } from 'lucide-react';
import { MarkdownMessage } from '@/components/MarkdownMessage';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';

interface SharedMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface SharedConversation {
  title: string;
  sharedAt: number;
  sharedBy: string;
  messages: SharedMessage[];
}

export default function SharedChatClient() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [data, setData] = useState<SharedConversation | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chat/share/${encodeURIComponent(token)}`);
        if (res.status === 404) {
          if (!cancelled) setState('notfound');
          return;
        }
        if (!res.ok) throw new Error('share fetch failed');
        const json = (await res.json()) as SharedConversation;
        if (!cancelled) {
          setData(json);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl btn-gradient flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-(--text-primary)">
              {state === 'ready' && data ? data.title : 'Shared AI conversation'}
            </h1>
            {state === 'ready' && data && (
              <p className="text-xs text-(--text-muted)">
                Shared by {data.sharedBy} · {new Date(data.sharedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {state === 'loading' && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-(--background-subtle) animate-pulse" />
            ))}
          </div>
        )}

        {state === 'notfound' && (
          <Card className="p-8 text-center text-(--text-muted)">
            This shared conversation does not exist or was removed.
          </Card>
        )}

        {state === 'error' && (
          <Card className="p-8 text-center text-(--text-muted)">
            Failed to load the shared conversation. Please try again later.
          </Card>
        )}

        {state === 'ready' && data && (
          <div className="space-y-4">
            {data.messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback
                    className={
                      m.role === 'user' ? 'bg-(--primary) text-white' : 'btn-gradient text-white'
                    }
                  >
                    {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <Card
                  className={`max-w-[85%] p-4 border-0 shadow-sm ${
                    m.role === 'user' ? 'btn-gradient text-white' : 'bg-(--card) border-(--border)'
                  }`}
                >
                  <MarkdownMessage content={m.content} isUser={m.role === 'user'} />
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
