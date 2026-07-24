/**
 * System document catalog — the built-in HR template library.
 *
 * Templates are bundled static data (not per-org DB rows): they work for every
 * organization immediately, carry translations for all supported locales inline,
 * and embed merge tokens (see `documentTokens.ts`) that resolve against a
 * selected employee at preview / export time.
 *
 * Organizations can still create their own templates via the existing
 * `documentTemplates` Convex table + wizard; this catalog complements those.
 */

import type { SupportedLocale } from './date-format';

/** Categories shown as groups in the Document Library. */
export type DocumentCategory = 'certificate' | 'hiring' | 'consent' | 'order';

/** Accent color drives the PDF/DOCX header, rules, and signature block. */
export type AccentColor = 'blue' | 'slate' | 'emerald' | 'burgundy';

export const ACCENT_HEX: Record<AccentColor, string> = {
  blue: '#1d4ed8',
  slate: '#334155',
  emerald: '#047857',
  burgundy: '#9f1239',
};

/** One template's localized surface: title + body (body carries merge tokens). */
interface LocalizedContent {
  title: string;
  body: string;
}

export interface CatalogTemplate {
  id: string;
  category: DocumentCategory;
  accent: AccentColor;
  /** Whether a signature block is appended to the exported document. */
  signature: boolean;
  /** Per-locale content. `en` is always present and used as the fallback. */
  locales: Record<SupportedLocale, LocalizedContent>;
}

export const CATEGORY_ORDER: DocumentCategory[] = ['certificate', 'hiring', 'consent', 'order'];

export const CATEGORY_LABELS: Record<DocumentCategory, Record<SupportedLocale, string>> = {
  certificate: { en: 'Certificates', ru: 'Справки', de: 'Bescheinigungen', hy: 'Տեղեկանքներ' },
  hiring: { en: 'Hiring', ru: 'Найм', de: 'Einstellung', hy: 'Աշխատանքի ընդունում' },
  consent: { en: 'Consent', ru: 'Согласия', de: 'Einwilligungen', hy: 'Համաձայնություններ' },
  order: { en: 'Orders', ru: 'Приказы', de: 'Anordnungen', hy: 'Հրամաններ' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Templates. Bodies use {{token}} placeholders resolved per selected employee.
// Kept intentionally concise and formal; extend by adding entries here.
// ─────────────────────────────────────────────────────────────────────────────

export const CATALOG: CatalogTemplate[] = [
  // ── Certificates ──────────────────────────────────────────────────────────
  {
    id: 'employment-verification',
    category: 'certificate',
    accent: 'blue',
    signature: true,
    locales: {
      en: {
        title: 'Employment Verification Letter',
        body:
          'This is to certify that {{employee.fullName}} is employed at {{org.name}} in the position of {{employee.position}}, {{employee.department}} department.\n\n' +
          'This certificate is issued at the request of the employee for presentation where required.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Справка с места работы',
        body:
          'Настоящим подтверждается, что {{employee.fullName}} работает в {{org.name}} в должности {{employee.position}}, отдел {{employee.department}}.\n\n' +
          'Справка выдана по месту требования по запросу сотрудника.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Arbeitsbescheinigung',
        body:
          'Hiermit wird bestätigt, dass {{employee.fullName}} bei {{org.name}} als {{employee.position}} in der Abteilung {{employee.department}} beschäftigt ist.\n\n' +
          'Diese Bescheinigung wird auf Wunsch des Mitarbeiters zur Vorlage ausgestellt.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Աշխատանքի վայրից տեղեկանք',
        body:
          'Սույնով հաստատվում է, որ {{employee.fullName}}-ը աշխատում է {{org.name}}-ում որպես {{employee.position}}, {{employee.department}} բաժնում։\n\n' +
          'Տեղեկանքը տրվում է աշխատողի պահանջով՝ ըստ պահանջվող վայրի։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
  {
    id: 'salary-certificate',
    category: 'certificate',
    accent: 'emerald',
    signature: true,
    locales: {
      en: {
        title: 'Salary Certificate',
        body:
          'This certifies that {{employee.fullName}}, holding the position of {{employee.position}} at {{org.name}}, receives a monthly base salary of {{employee.salary}}.\n\n' +
          'Issued for presentation where required.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Справка о доходах',
        body:
          'Настоящим подтверждается, что {{employee.fullName}}, занимающий должность {{employee.position}} в {{org.name}}, получает ежемесячный оклад в размере {{employee.salary}}.\n\n' +
          'Выдана по месту требования.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Gehaltsbescheinigung',
        body:
          'Hiermit wird bestätigt, dass {{employee.fullName}}, in der Position {{employee.position}} bei {{org.name}}, ein monatliches Grundgehalt von {{employee.salary}} erhält.\n\n' +
          'Zur Vorlage ausgestellt.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Եկամուտների մասին տեղեկանք',
        body:
          'Սույնով հաստատվում է, որ {{employee.fullName}}-ը, զբաղեցնելով {{employee.position}} պաշտոնը {{org.name}}-ում, ստանում է ամսական {{employee.salary}} հիմնական աշխատավարձ։\n\n' +
          'Տրվում է ըստ պահանջվող վայրի։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },

  // ── Hiring ──────────────────────────────────────────────────────────────
  {
    id: 'offer-letter',
    category: 'hiring',
    accent: 'blue',
    signature: true,
    locales: {
      en: {
        title: 'Offer Letter',
        body:
          'Dear {{employee.fullName}},\n\n' +
          'We are pleased to offer you the position of {{employee.position}} in the {{employee.department}} department at {{org.name}}.\n\n' +
          'Your monthly base salary will be {{employee.salary}}. Further terms will be set out in your employment contract.\n\n' +
          'We look forward to welcoming you to the team.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Предложение о работе',
        body:
          'Уважаемый(ая) {{employee.fullName}},\n\n' +
          'Рады предложить вам должность {{employee.position}} в отделе {{employee.department}} компании {{org.name}}.\n\n' +
          'Ваш ежемесячный оклад составит {{employee.salary}}. Остальные условия будут указаны в трудовом договоре.\n\n' +
          'Будем рады видеть вас в команде.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Stellenangebot',
        body:
          'Sehr geehrte(r) {{employee.fullName}},\n\n' +
          'Wir freuen uns, Ihnen die Position {{employee.position}} in der Abteilung {{employee.department}} bei {{org.name}} anzubieten.\n\n' +
          'Ihr monatliches Grundgehalt beträgt {{employee.salary}}. Weitere Bedingungen werden in Ihrem Arbeitsvertrag festgelegt.\n\n' +
          'Wir freuen uns auf die Zusammenarbeit.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Աշխատանքի առաջարկ',
        body:
          'Հարգելի՛ {{employee.fullName}},\n\n' +
          'Ուրախ ենք առաջարկել Ձեզ {{employee.position}} պաշտոնը {{org.name}}-ի {{employee.department}} բաժնում։\n\n' +
          'Ձեր ամսական հիմնական աշխատավարձը կկազմի {{employee.salary}}։ Մնացած պայմանները կսահմանվեն աշխատանքային պայմանագրում։\n\n' +
          'Սպասում ենք Ձեզ թիմում։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
  {
    id: 'employment-contract',
    category: 'hiring',
    accent: 'slate',
    signature: true,
    locales: {
      en: {
        title: 'Employment Contract',
        body:
          'This Employment Contract is entered into between {{org.name}} (the "Employer") and {{employee.fullName}} (the "Employee").\n\n' +
          'Position: {{employee.position}}\nDepartment: {{employee.department}}\nMonthly base salary: {{employee.salary}}\n\n' +
          'Employee identification:\nPassport No.: {{employee.passportNumber}}, issued by {{employee.passportIssuedBy}} on {{employee.passportIssueDate}}.\nSocial card No.: {{employee.socialCardNumber}}\nNationality: {{employee.nationality}}\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Трудовой договор',
        body:
          'Настоящий трудовой договор заключён между {{org.name}} («Работодатель») и {{employee.fullName}} («Работник»).\n\n' +
          'Должность: {{employee.position}}\nОтдел: {{employee.department}}\nЕжемесячный оклад: {{employee.salary}}\n\n' +
          'Идентификация работника:\nПаспорт №: {{employee.passportNumber}}, выдан {{employee.passportIssuedBy}} {{employee.passportIssueDate}}.\nСоц. карта №: {{employee.socialCardNumber}}\nГражданство: {{employee.nationality}}\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Arbeitsvertrag',
        body:
          'Dieser Arbeitsvertrag wird zwischen {{org.name}} (der „Arbeitgeber") und {{employee.fullName}} (der „Arbeitnehmer") geschlossen.\n\n' +
          'Position: {{employee.position}}\nAbteilung: {{employee.department}}\nMonatliches Grundgehalt: {{employee.salary}}\n\n' +
          'Identifikation des Arbeitnehmers:\nReisepass-Nr.: {{employee.passportNumber}}, ausgestellt von {{employee.passportIssuedBy}} am {{employee.passportIssueDate}}.\nSozialkarten-Nr.: {{employee.socialCardNumber}}\nStaatsangehörigkeit: {{employee.nationality}}\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Աշխատանքային պայմանագիր',
        body:
          'Սույն աշխատանքային պայմանագիրը կնքվում է {{org.name}}-ի («Գործատու») և {{employee.fullName}}-ի («Աշխատող») միջև։\n\n' +
          'Պաշտոն՝ {{employee.position}}\nԲաժին՝ {{employee.department}}\nԱմսական հիմնական աշխատավարձ՝ {{employee.salary}}\n\n' +
          'Աշխատողի նույնականացում՝\nԱնձնագիր №՝ {{employee.passportNumber}}, տրված {{employee.passportIssuedBy}}-ի կողմից {{employee.passportIssueDate}}-ին։\nՍոց. քարտ №՝ {{employee.socialCardNumber}}\nՔաղաքացիություն՝ {{employee.nationality}}\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
  {
    id: 'nda',
    category: 'hiring',
    accent: 'burgundy',
    signature: true,
    locales: {
      en: {
        title: 'Non-Disclosure Agreement',
        body:
          'This Non-Disclosure Agreement is made between {{org.name}} and {{employee.fullName}}, {{employee.position}}.\n\n' +
          'The Employee agrees to keep confidential all proprietary and sensitive information of {{org.name}} obtained during employment, and not to disclose it to any third party without written consent.\n\n' +
          'This obligation survives the termination of employment.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Соглашение о неразглашении',
        body:
          'Настоящее соглашение о неразглашении заключено между {{org.name}} и {{employee.fullName}}, {{employee.position}}.\n\n' +
          'Работник обязуется сохранять конфиденциальность всей служебной и чувствительной информации {{org.name}}, полученной в период работы, и не разглашать её третьим лицам без письменного согласия.\n\n' +
          'Данное обязательство сохраняется после прекращения трудовых отношений.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Geheimhaltungsvereinbarung',
        body:
          'Diese Geheimhaltungsvereinbarung wird zwischen {{org.name}} und {{employee.fullName}}, {{employee.position}}, geschlossen.\n\n' +
          'Der Arbeitnehmer verpflichtet sich, alle vertraulichen und sensiblen Informationen von {{org.name}}, die während des Arbeitsverhältnisses erlangt werden, geheim zu halten und ohne schriftliche Zustimmung nicht an Dritte weiterzugeben.\n\n' +
          'Diese Verpflichtung besteht auch nach Beendigung des Arbeitsverhältnisses fort.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Գաղտնիության համաձայնագիր',
        body:
          'Սույն գաղտնիության համաձայնագիրը կնքվում է {{org.name}}-ի և {{employee.fullName}}-ի ({{employee.position}}) միջև։\n\n' +
          'Աշխատողը պարտավորվում է գաղտնի պահել {{org.name}}-ի՝ աշխատանքի ընթացքում ձեռք բերված ողջ սեփականությունը և զգայուն տեղեկատվությունը և առանց գրավոր համաձայնության չբացահայտել այն երրորդ անձանց։\n\n' +
          'Այս պարտավորությունը գործում է նաև աշխատանքային հարաբերությունների դադարումից հետո։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },

  // ── Consent ───────────────────────────────────────────────────────────────
  {
    id: 'pdpa-consent',
    category: 'consent',
    accent: 'slate',
    signature: true,
    locales: {
      en: {
        title: 'Personal Data Processing Consent',
        body:
          'I, {{employee.fullName}}, consent to {{org.name}} collecting, storing, and processing my personal data — including my full name, date of birth ({{employee.dateOfBirth}}), passport details ({{employee.passportNumber}}), and contact information — for the purposes of employment administration.\n\n' +
          'I understand that I may withdraw this consent in writing at any time.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Согласие на обработку персональных данных',
        body:
          'Я, {{employee.fullName}}, даю согласие {{org.name}} на сбор, хранение и обработку моих персональных данных — включая ФИО, дату рождения ({{employee.dateOfBirth}}), паспортные данные ({{employee.passportNumber}}) и контактную информацию — в целях кадрового администрирования.\n\n' +
          'Мне разъяснено, что я вправе отозвать данное согласие в письменной форме в любое время.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Einwilligung zur Verarbeitung personenbezogener Daten',
        body:
          'Ich, {{employee.fullName}}, willige ein, dass {{org.name}} meine personenbezogenen Daten — einschließlich Name, Geburtsdatum ({{employee.dateOfBirth}}), Passdaten ({{employee.passportNumber}}) und Kontaktdaten — zum Zweck der Personalverwaltung erhebt, speichert und verarbeitet.\n\n' +
          'Mir ist bekannt, dass ich diese Einwilligung jederzeit schriftlich widerrufen kann.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Անձնական տվյալների մշակման համաձայնություն',
        body:
          'Ես՝ {{employee.fullName}}-ս, համաձայնություն եմ տալիս {{org.name}}-ին հավաքագրելու, պահպանելու և մշակելու իմ անձնական տվյալները՝ ներառյալ անուն-ազգանունը, ծննդյան ամսաթիվը ({{employee.dateOfBirth}}), անձնագրային տվյալները ({{employee.passportNumber}}) և կոնտակտային տվյալները՝ կադրային վարչարարության նպատակով։\n\n' +
          'Տեղյակ եմ, որ կարող եմ ցանկացած պահի գրավոր հետ կանչել այս համաձայնությունը։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  {
    id: 'leave-order',
    category: 'order',
    accent: 'emerald',
    signature: true,
    locales: {
      en: {
        title: 'Leave Order',
        body:
          'ORDER\n\n' +
          '{{org.name}} hereby grants {{employee.fullName}}, {{employee.position}} of the {{employee.department}} department, leave in accordance with the applicable leave policy.\n\n' +
          'Issued by: {{signatory.name}}, {{signatory.position}}\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Приказ об отпуске',
        body:
          'ПРИКАЗ\n\n' +
          '{{org.name}} предоставляет {{employee.fullName}}, {{employee.position}} отдела {{employee.department}}, отпуск в соответствии с действующей политикой отпусков.\n\n' +
          'Издал: {{signatory.name}}, {{signatory.position}}\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Urlaubsanordnung',
        body:
          'ANORDNUNG\n\n' +
          '{{org.name}} gewährt {{employee.fullName}}, {{employee.position}} der Abteilung {{employee.department}}, Urlaub gemäß der geltenden Urlaubsrichtlinie.\n\n' +
          'Ausgestellt von: {{signatory.name}}, {{signatory.position}}\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Արձակուրդի հրաման',
        body:
          'ՀՐԱՄԱՆ\n\n' +
          '{{org.name}}-ը սույնով {{employee.department}} բաժնի {{employee.position}} {{employee.fullName}}-ին տրամադրում է արձակուրդ՝ գործող արձակուրդի քաղաքականությանը համապատասխան։\n\n' +
          'Տրված է՝ {{signatory.name}}, {{signatory.position}}\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
  {
    id: 'termination-order',
    category: 'order',
    accent: 'burgundy',
    signature: true,
    locales: {
      en: {
        title: 'Termination Order',
        body:
          'ORDER\n\n' +
          'The employment of {{employee.fullName}}, {{employee.position}} of the {{employee.department}} department at {{org.name}}, is hereby terminated in accordance with applicable labor law.\n\n' +
          'Final settlement to be processed per policy.\n\n' +
          'Issued by: {{signatory.name}}, {{signatory.position}}\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Приказ об увольнении',
        body:
          'ПРИКАЗ\n\n' +
          'Трудовой договор с {{employee.fullName}}, {{employee.position}} отдела {{employee.department}} компании {{org.name}}, расторгается в соответствии с действующим трудовым законодательством.\n\n' +
          'Окончательный расчёт производится согласно политике.\n\n' +
          'Издал: {{signatory.name}}, {{signatory.position}}\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Kündigungsanordnung',
        body:
          'ANORDNUNG\n\n' +
          'Das Arbeitsverhältnis von {{employee.fullName}}, {{employee.position}} der Abteilung {{employee.department}} bei {{org.name}}, wird hiermit gemäß geltendem Arbeitsrecht beendet.\n\n' +
          'Die Endabrechnung erfolgt gemäß den Richtlinien.\n\n' +
          'Ausgestellt von: {{signatory.name}}, {{signatory.position}}\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Աշխատանքից ազատման հրաման',
        body:
          'ՀՐԱՄԱՆ\n\n' +
          '{{org.name}}-ի {{employee.department}} բաժնի {{employee.position}} {{employee.fullName}}-ի հետ աշխատանքային պայմանագիրը սույնով լուծվում է՝ գործող աշխատանքային օրենսդրությանը համապատասխան։\n\n' +
          'Վերջնահաշվարկը կատարվում է ըստ քաղաքականության։\n\n' +
          'Տրված է՝ {{signatory.name}}, {{signatory.position}}\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
];

/** Look up a template by id. */
export function getCatalogTemplate(id: string): CatalogTemplate | undefined {
  return CATALOG.find((t) => t.id === id);
}

/** Resolve a template's localized content, falling back to English. */
export function localizedContent(
  template: CatalogTemplate,
  lang: SupportedLocale,
): LocalizedContent {
  return template.locales[lang] ?? template.locales.en;
}
