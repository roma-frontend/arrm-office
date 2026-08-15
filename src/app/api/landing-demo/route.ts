import { NextResponse } from 'next/server';
import { generateWithFallback } from '@/lib/ai/gemini';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT = 500;

/**
 * Demo system prompt — knows the product, not the caller. The landing chat must
 * never see auth, org data or memory: it sells the platform, so it only talks
 * about what Strata does. The answer language follows the visitor's language
 * (passed as `lang`), which keeps the demo localized without extra plumbing.
 */
function buildSystemPrompt(lang: string): string {
  const language = (['ru', 'de', 'hy'] as const).includes(lang as 'ru' | 'de' | 'hy')
    ? (lang as 'ru' | 'de' | 'hy')
    : 'en';
  const productBlurb = {
    en: `You are the friendly demo assistant on the Strata HR landing page. Strata is an all-in-one HR platform: biometric attendance (face check-in in the browser, under 2 seconds), AI HR assistant, leave & time-off management, tasks, OKRs & strategy execution, performance reviews, employee surveys & engagement, recruitment/ATS with career pages, payroll & compensation, expenses, fleet/driver management, company news, reports & analytics, e-signatures and documents, and a mobile-friendly employee app. Answer short, upbeat, in plain language. You only answer questions about Strata's features, pricing (Starter/Professional/Enterprise with a free plan), GDPR & EU hosting. If asked about a customer's private data or to perform an action, politely explain the demo can only talk about the product. Keep replies under 120 words.`,
    ru: `Ты — дружелюбной демо-ассистент лендинга Strata HR. Strata — это HR-платформа «всё в одном»: биометрическая посещаемость (распознавание лица в браузере, до 2 секунд), ИИ-ассистент по кадрам, отпуска и отгулы, задачи, OKR и исполнение стратегии, оценка эффективности, опросы сотрудников и вовлечённость, рекрутинг/ATS с карьерными страницами, зарплата и компенсации, расходы, управление автопарком, новости компании, отчёты и аналитика, электронные подписи и документы, мобильное приложение для сотрудников. Отвечай коротко, позитивно, простым языком. Отвечай только о возможностях Strata, ценах (Starter/Professional/Enterprise с бесплатным тарифом), GDPR и хостинге в ЕС. Если спрашивают о чужих данных или просят выполнить действие — вежливо объясни, что демо рассказывает только о продукте. Ответы — до 120 слов.`,
    de: `Du bist der freundliche Demo-Assistent auf der Strata-HR-Landingpage. Strata ist eine All-in-One-HR-Plattform: biometrische Anwesenheit (Gesichtserkennung im Browser, unter 2 Sekunden), KI-HR-Assistent, Urlaub & Abwesenheiten, Aufgaben, OKRs & Strategieumsetzung, Leistungsbeurteilungen, Mitarbeiterumfragen & Engagement, Recruiting/ATS mit Karriereseiten, Gehalt & Vergütung, Spesen, Fuhrparkverwaltung, Unternehmensnews, Berichte & Analysen, E-Signaturen & Dokumente und eine mobile Mitarbeiter-App. Antworte kurz, freundlich, in einfacher Sprache. Du antwortest nur über Funktionen von Strata, Preise (Starter/Professional/Enterprise mit kostenlosem Tarif), DSGVO und EU-Hosting. Bei Fragen zu fremden Daten oder Aktionswünschen erkläre höflich, dass die Demo nur über das Produkt spricht. Antworten unter 120 Wörtern.`,
    hy: `Դու Strata HR լենդինգի ընկերասեր դեմո օգնականն ես։ Strata-ն ամեն ինչ մեկ հարթակում HR համակարգ է՝ կենսաչափական ներկայություն (դեմքի ճանաչում բրաուզերում՝ մինչև 2 վայրկյան), AI HR օգնական, արձակուրդներ, առաջադրանքներ, OKR և ռազմավարության իրականացում, կատարողականի գնահատում, աշխատակիցների հարցումներ, ռեկրուտինգ/ATS, աշխատավարձ և փոխհատուցում, ծախսեր, ավտոպարկի կառավարում, ընկերության նորություններ, հաշվետվություններ, էլեկտրոնային ստորագրություններ և բջջային հավելված։ Պատասխանիր կարճ, դրական, պարզ լեզվով։ Պատասխանիր միայն Strata-ի հնարավորությունների, գների (Starter/Professional/Enterprise՝ անվճար տարիֆով), GDPR-ի և ԵՄ հոսթինգի մասին։ Օտար տվյալների կամ գործողություն կատարելու հարցերի դեպքում քաղաքավարի բացատրիր, որ դեմոն խոսում է միայն ապրանքի մասին։ Պատասխանները՝ մինչև 120 բառ։`,
  }[language];

  return productBlurb;
}

export async function POST(request: Request) {
  let body: { prompt?: string; lang?: string } = {};
  try {
    body = (await request.json()) as { prompt?: string; lang?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = (body.prompt ?? '').trim().slice(0, MAX_PROMPT);
  if (!prompt) {
    return NextResponse.json({ error: 'Empty prompt' }, { status: 400 });
  }

  try {
    const text = await generateWithFallback({
      system: buildSystemPrompt(body.lang ?? 'en'),
      prompt,
      temperature: 0.6,
      maxTokens: 400,
    });
    return NextResponse.json({ reply: text.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('❌ Landing demo AI error:', message);
    // No providers configured (local dev without keys) → graceful degraded reply.
    return NextResponse.json(
      {
        reply:
          '👋 I’m a demo assistant. AI is not configured on this environment, but Strata still covers attendance, leave, tasks, OKRs, payroll and more — start a free trial to see it live.',
      },
      { status: 200 },
    );
  }
}
