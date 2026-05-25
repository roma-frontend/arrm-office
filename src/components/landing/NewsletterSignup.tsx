'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, CheckCircle2, AlertCircle } from 'lucide-react';

const TOPICS = ['hr-tips', 'leadership', 'wellness', 'tech'] as const;

export default function NewsletterSignup() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const language = (['en', 'ru', 'hy', 'de'].includes(i18n.language) ? i18n.language : 'en') as
    | 'en'
    | 'ru'
    | 'hy'
    | 'de';

  const toggleTopic = (topic: string) => {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      setErrorMsg(t('newsletter.invalidEmail', 'Please enter a valid email'));
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: name || undefined,
          language,
          topics: topics.length > 0 ? topics : undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to subscribe');
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMsg(t('newsletter.errorMessage', 'Something went wrong. Please try again.'));
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4 animate-bounce">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-xl font-bold text-gradient mb-2">
          {t('newsletter.subscribed', "You're subscribed!")}
        </h3>
        <p className="text-muted-foreground">
          {t('newsletter.successDetail', "We'll send you the best HR insights weekly.")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 mb-3 glow-md">
          <Mail className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-2xl font-bold text-gradient">
          {t('newsletter.title', 'HR Weekly Digest')}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('newsletter.subtitle', 'Get actionable HR tips delivered every Monday')}
        </p>
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setStatus('idle');
        }}
        placeholder={t('newsletter.emailPlaceholder', 'your@email.com')}
        className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        disabled={status === 'loading'}
      />

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('newsletter.namePlaceholder', 'Your name (optional)')}
        className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        disabled={status === 'loading'}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-muted-foreground mb-2">
          {t('newsletter.topics', 'Topics of interest')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((topic) => (
            <label
              key={topic}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                topics.includes(topic)
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'border-border hover:border-blue-300'
              }`}
            >
              <input
                type="checkbox"
                checked={topics.includes(topic)}
                onChange={() => toggleTopic(topic)}
                className="sr-only"
              />
              {t(`newsletter.topic.${topic}`, topic)}
            </label>
          ))}
        </div>
      </fieldset>

      {status === 'error' && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50"
      >
        {status === 'loading'
          ? t('newsletter.subscribing', 'Subscribing...')
          : t('newsletter.subscribe', 'Subscribe')}
      </button>
    </form>
  );
}
