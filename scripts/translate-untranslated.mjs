/**
 * Bulk-translate every locale key that still carries its English value in
 * ru/de/hy, using the same Gemini provider as the in-app AI translate button.
 *
 * Keys whose value is already different from English are left untouched. Keys
 * whose English value is a placeholder-only string, a number, a URL, or an
 * email are also skipped (the model would only echo them back).
 *
 * Walks the real JSON tree (locale files use flat keys whose names contain
 * literal dots, so flattening with '.' as a separator is unsafe).
 *
 * Run: node scripts/translate-untranslated.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['ru', 'de', 'hy'];
const BATCH = 8;
const PAUSE_MS = 10000; // stay under the 8000 TPM free-tier cap
const LANG_NAMES = { ru: 'Russian', de: 'German', hy: 'Armenian' };

/** Keep placeholders/branding/URLs out of the translation queue. */
function isTranslatable(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  // Pure placeholders / interpolation tokens only — nothing to translate.
  if (/^(\{\{[^}]+\}\}|\$t\([^)]*\)|\s*)+$/.test(value)) return false;
  // No letters at all (numbers, punctuation, dates).
  if (!/[A-Za-zА-Яа-яЁёÄäÖöÜüßՀ-֊]/.test(value)) return false;
  // URLs and emails.
  if (/^(https?:\/\/|mailto:)/.test(value)) return false;
  return true;
}

/** Collect all leaf entries as { keyPath: [literal keys...], dotted: string }. */
function collectMatching(node, _match, prefix = [], out = []) {
  for (const [k, v] of Object.entries(node)) {
    const keyPath = [...prefix, k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      collectMatching(v, _match, keyPath, out);
    } else if (typeof v === 'string') {
      out.push({ keyPath, dotted: keyPath.join('.') });
    }
  }
  return out;
}

/** Apply translated values back into the tree by literal key path. */
function applyTranslations(node, keyPath, value) {
  let cur = node;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const k = keyPath[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keyPath[keyPath.length - 1]] = value;
}

async function translateBatch(entries, lang) {
  const system = [
    'You are a professional localizer for an HR software product.',
    `Translate the values into ${LANG_NAMES[lang]}.`,
    'Return ONLY a JSON object mapping each key to its translation — same keys, no markdown fences, no commentary.',
    'Keep {{placeholders}} EXACTLY as they are, do not translate or reorder them.',
    'Keep brand names, product names, acronyms, URLs, emails, and numbers unchanged.',
    'If a value is already correct in the target language or is a proper noun that should not change, echo it back unchanged.',
    'Short UI labels stay short and natural; longer sentences stay professional and concise.',
  ].join(' ');

  const payload = {};
  for (const e of entries) payload[e.dotted] = e.value;
  const prompt = JSON.stringify(payload, null, 0);

  const { generateText } = await import('ai');
  // Try Gemini first (the same provider the in-app button uses), fall back to
  // Groq when the free tier is rate-limited — mirrors generateWithFallback.
  let result;
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    try {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const provider = createGoogleGenerativeAI({ apiKey: geminiKey });
      // gemini-3.6-flash carries a 20 req/day free-tier quota; 2.5-flash has
      // its own, so prefer it for bulk work and only fall back on error.
      for (const modelName of ['gemini-2.5-flash', process.env.GEMINI_MODEL || 'gemini-3.6-flash']) {
        try {
          const model = provider(modelName);
          result = await generateText({
            model,
            system,
            prompt,
            temperature: 0.2,
            maxOutputTokens: 2048,
            maxRetries: 0,
          });
          break;
        } catch (err) {
          const limited = JSON.stringify(err).includes('429') || JSON.stringify(err).includes('RESOURCE_EXHAUSTED');
          console.log(`  Gemini ${modelName} ${limited ? 'rate-limited' : 'failed'}, trying next…`);
          if (!limited) break;
        }
      }
    } catch (err) {
      const rateLimited = JSON.stringify(err).includes('429');
      if (!rateLimited) throw err;
      console.log('  Gemini rate-limited, falling back to Groq…');
    }
  }
  if (!result) {
    const { groq } = await import('@ai-sdk/groq');
    result = await generateText({
      model: groq('openai/gpt-oss-20b'),
      system,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 2048,
      maxRetries: 0,
    });
  }
  const text = result.text.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model output');
  const parsed = JSON.parse(text.slice(start, end + 1));
  // Keep only keys we asked for (the model sometimes renames or adds keys).
  const cleaned = {};
  for (const e of entries) if (typeof parsed[e.dotted] === 'string') cleaned[e.dotted] = parsed[e.dotted];
  return cleaned;
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_GENERATIVE_AI_API_KEY missing — put it in .env.local');
    process.exit(1);
  }

  const files = readdirSync(join(ROOT, 'public/locales/en')).filter((f) => f.endsWith('.json'));
  let totalQueued = 0;
  let totalTranslated = 0;

  for (const target of TARGETS) {
    for (const file of files) {
      const enPath = join(ROOT, 'public/locales/en', file);
      const targetPath = join(ROOT, 'public/locales', target, file);
      if (!existsSync(targetPath)) continue;

      const enTree = JSON.parse(readFileSync(enPath, 'utf8'));
      const targetTree = JSON.parse(readFileSync(targetPath, 'utf8'));

      const todo = [];
      for (const leaf of collectMatching(enTree, null)) {
        const value = leaf.dotted.split('.').reduce((o, k) => o?.[k], enTree);
        const targetValue = leaf.dotted.split('.').reduce((o, k) => o?.[k], targetTree);
        if (typeof value !== 'string') continue;
        if (!isTranslatable(value)) continue;
        if (targetValue !== value) continue; // already translated (or an intentional override)
        todo.push({ keyPath: leaf.keyPath, dotted: leaf.dotted, value });
      }
      if (todo.length === 0) continue;

      totalQueued += todo.length;
      console.log(`[${target}] ${file}: ${todo.length} keys to translate`);

      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        let result = null;
        for (let attempt = 0; attempt < 3 && !result; attempt++) {
          try {
            result = await translateBatch(batch, target);
          } catch (err) {
            console.log(`  batch ${i / BATCH + 1} failed (attempt ${attempt + 1}): ${err.message}`);
            if (attempt === 2) throw err;
          }
        }
        for (const e of batch) {
          const translated = result[e.dotted];
          if (translated !== undefined) applyTranslations(targetTree, e.keyPath, translated);
        }
        totalTranslated += Object.keys(result).length;
        console.log(`  batch ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)} done (${Object.keys(result).length}/${batch.length})`);
        if (i + BATCH < todo.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
      }

      writeFileSync(targetPath, JSON.stringify(targetTree, null, 2) + '\n');
      console.log(`  ✅ wrote ${file}`);
    }
  }

  console.log(`\nDone: ${totalTranslated}/${totalQueued} keys translated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
