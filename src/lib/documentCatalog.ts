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
import {
  HIRING_PACKET_MANDATORY_IDS,
  HIRING_PACKET_TEMPLATE_IDS,
} from '../../convex/lib/documentTemplateIds';

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

  {
    id: 'job-description',
    category: 'hiring',
    accent: 'slate',
    signature: true,
    locales: {
      en: {
        title: 'Job Description',
        body:
          'Employee: {{employee.fullName}}\nPosition: {{employee.position}}\nDepartment: {{employee.department}}\nReports to: {{signatory.name}}, {{signatory.position}}\n\n' +
          '1. PURPOSE OF THE ROLE\n' +
          'The Employee performs the duties of {{employee.position}} within the {{employee.department}} department of {{org.name}}.\n\n' +
          '2. DUTIES\n' +
          '- Carry out the tasks assigned by the immediate supervisor within the scope of the position.\n' +
          '- Comply with the internal regulations, labour discipline and occupational safety rules of {{org.name}}.\n' +
          "- Treat the company's property and confidential information with due care.\n" +
          '- Report to the immediate supervisor on the results of the work performed.\n\n' +
          '3. RIGHTS\n' +
          '- Receive the information, materials and equipment required to perform the duties.\n' +
          '- Submit proposals for improving work processes within the scope of the position.\n\n' +
          '4. RESPONSIBILITY\n' +
          'The Employee is liable for non-performance or improper performance of the duties set out in this job description in accordance with the applicable labour law.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Должностная инструкция',
        body:
          'Работник: {{employee.fullName}}\nДолжность: {{employee.position}}\nОтдел: {{employee.department}}\nНепосредственный руководитель: {{signatory.name}}, {{signatory.position}}\n\n' +
          '1. НАЗНАЧЕНИЕ ДОЛЖНОСТИ\n' +
          'Работник выполняет обязанности {{employee.position}} в отделе {{employee.department}} компании {{org.name}}.\n\n' +
          '2. ОБЯЗАННОСТИ\n' +
          '- Выполнять задачи, поставленные непосредственным руководителем в рамках должности.\n' +
          '- Соблюдать внутренние правила, трудовую дисциплину и требования охраны труда {{org.name}}.\n' +
          '- Бережно относиться к имуществу компании и конфиденциальной информации.\n' +
          '- Отчитываться перед непосредственным руководителем о результатах работы.\n\n' +
          '3. ПРАВА\n' +
          '- Получать информацию, материалы и оборудование, необходимые для выполнения обязанностей.\n' +
          '- Вносить предложения по улучшению рабочих процессов в рамках должности.\n\n' +
          '4. ОТВЕТСТВЕННОСТЬ\n' +
          'Работник несёт ответственность за неисполнение или ненадлежащее исполнение обязанностей, предусмотренных настоящей инструкцией, в соответствии с действующим трудовым законодательством.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Stellenbeschreibung',
        body:
          'Arbeitnehmer: {{employee.fullName}}\nPosition: {{employee.position}}\nAbteilung: {{employee.department}}\nVorgesetzter: {{signatory.name}}, {{signatory.position}}\n\n' +
          '1. ZWECK DER STELLE\n' +
          'Der Arbeitnehmer nimmt die Aufgaben als {{employee.position}} in der Abteilung {{employee.department}} von {{org.name}} wahr.\n\n' +
          '2. AUFGABEN\n' +
          '- Erledigung der vom direkten Vorgesetzten im Rahmen der Position zugewiesenen Aufgaben.\n' +
          '- Einhaltung der internen Regelungen, der Arbeitsdisziplin und der Arbeitsschutzvorschriften von {{org.name}}.\n' +
          '- Sorgfältiger Umgang mit dem Eigentum und den vertraulichen Informationen des Unternehmens.\n' +
          '- Berichterstattung an den direkten Vorgesetzten über die Arbeitsergebnisse.\n\n' +
          '3. RECHTE\n' +
          '- Erhalt der zur Aufgabenerfüllung erforderlichen Informationen, Materialien und Arbeitsmittel.\n' +
          '- Einbringen von Vorschlägen zur Verbesserung der Arbeitsprozesse im Rahmen der Position.\n\n' +
          '4. VERANTWORTUNG\n' +
          'Der Arbeitnehmer haftet für die Nichterfüllung oder unsachgemäße Erfüllung der in dieser Stellenbeschreibung festgelegten Aufgaben gemäß dem geltenden Arbeitsrecht.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Աշխատանքի նկարագրություն',
        body:
          'Աշխատող՝ {{employee.fullName}}\nՊաշտոն՝ {{employee.position}}\nԲաժին՝ {{employee.department}}\nԱնմիջական ղեկավար՝ {{signatory.name}}, {{signatory.position}}\n\n' +
          '1. ՊԱՇՏՈՆԻ ՆՊԱՏԱԿԸ\n' +
          'Աշխատողը կատարում է {{employee.position}}-ի պարտականությունները {{org.name}}-ի {{employee.department}} բաժնում։\n\n' +
          '2. ՊԱՐՏԱԿԱՆՈՒԹՅՈՒՆՆԵՐԸ\n' +
          '- Կատարել անմիջական ղեկավարի կողմից պաշտոնի շրջանակում հանձնարարված աշխատանքները։\n' +
          '- Պահպանել {{org.name}}-ի ներքին կարգապահական կանոնները, աշխատանքային կարգապահությունը և աշխատանքի անվտանգության պահանջները։\n' +
          '- Հոգատար վերաբերմունք դրսևորել ընկերության գույքի և գաղտնի տեղեկատվության նկատմամբ։\n' +
          '- Հաշվետվություն ներկայացնել անմիջական ղեկավարին կատարված աշխատանքի արդյունքների մասին։\n\n' +
          '3. ԻՐԱՎՈՒՆՔՆԵՐԸ\n' +
          '- Ստանալ պարտականությունների կատարման համար անհրաժեշտ տեղեկատվությունը, նյութերը և սարքավորումները։\n' +
          '- Ներկայացնել առաջարկություններ պաշտոնի շրջանակում աշխատանքային գործընթացների բարելավման վերաբերյալ։\n\n' +
          '4. ՊԱՏԱՍԽԱՆԱՏՎՈՒԹՅՈՒՆԸ\n' +
          'Աշխատողը սույն նկարագրությամբ սահմանված պարտականությունները չկատարելու կամ ոչ պատշաճ կատարելու համար պատասխանատվություն է կրում գործող աշխատանքային օրենսդրությանը համապատասխան։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
  {
    id: 'material-responsibility',
    category: 'hiring',
    accent: 'burgundy',
    signature: true,
    locales: {
      en: {
        title: 'Agreement on Material Responsibility',
        body:
          'This Agreement is concluded between {{org.name}} (the "Employer") and {{employee.fullName}}, {{employee.position}} of the {{employee.department}} department (the "Employee").\n\n' +
          '1. The Employee assumes responsibility for the safekeeping of the property handed over to them by the Employer — equipment, tools, materials and other assets.\n\n' +
          "2. The Employee undertakes to: use the property for its intended purpose only; notify the Employer without delay of any loss, damage or malfunction; return the property upon termination of employment or at the Employer's request.\n\n" +
          '3. The Employer undertakes to provide the conditions required for the safekeeping of the property and to document every handover and return in a movement form signed by both parties.\n\n' +
          '4. The Employee is not liable for damage caused by normal wear and tear or by circumstances beyond their control.\n\n' +
          '5. Liability for damage is determined in accordance with the applicable labour law.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Договор о материальной ответственности',
        body:
          'Настоящий договор заключён между {{org.name}} («Работодатель») и {{employee.fullName}}, {{employee.position}} отдела {{employee.department}} («Работник»).\n\n' +
          '1. Работник принимает на себя ответственность за сохранность переданного ему Работодателем имущества — оборудования, инструментов, материалов и иных ценностей.\n\n' +
          '2. Работник обязуется: использовать имущество только по назначению; незамедлительно сообщать Работодателю об утрате, повреждении или неисправности; вернуть имущество при прекращении трудовых отношений или по требованию Работодателя.\n\n' +
          '3. Работодатель обязуется создать условия, необходимые для сохранности имущества, и оформлять каждую передачу и возврат актом, подписанным обеими сторонами.\n\n' +
          '4. Работник не несёт ответственности за ущерб, вызванный нормальным износом или обстоятельствами, не зависящими от него.\n\n' +
          '5. Ответственность за ущерб определяется в соответствии с действующим трудовым законодательством.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Vereinbarung über die materielle Verantwortung',
        body:
          'Diese Vereinbarung wird zwischen {{org.name}} (der „Arbeitgeber") und {{employee.fullName}}, {{employee.position}} der Abteilung {{employee.department}} (der „Arbeitnehmer"), geschlossen.\n\n' +
          '1. Der Arbeitnehmer übernimmt die Verantwortung für die sichere Aufbewahrung des ihm vom Arbeitgeber überlassenen Eigentums — Geräte, Werkzeuge, Materialien und sonstige Vermögenswerte.\n\n' +
          '2. Der Arbeitnehmer verpflichtet sich: das Eigentum ausschließlich zweckentsprechend zu verwenden; den Arbeitgeber unverzüglich über Verlust, Beschädigung oder Störung zu informieren; das Eigentum bei Beendigung des Arbeitsverhältnisses oder auf Verlangen des Arbeitgebers zurückzugeben.\n\n' +
          '3. Der Arbeitgeber verpflichtet sich, die für die Aufbewahrung erforderlichen Bedingungen zu schaffen und jede Übergabe und Rückgabe in einem von beiden Parteien unterzeichneten Protokoll zu dokumentieren.\n\n' +
          '4. Der Arbeitnehmer haftet nicht für Schäden durch normale Abnutzung oder durch Umstände außerhalb seines Einflussbereichs.\n\n' +
          '5. Die Haftung für Schäden richtet sich nach dem geltenden Arbeitsrecht.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Նյութական պատասխանատվության պայմանագիր',
        body:
          'Սույն պայմանագիրը կնքվում է {{org.name}}-ի («Գործատու») և {{employee.department}} բաժնի {{employee.position}} {{employee.fullName}}-ի («Աշխատող») միջև։\n\n' +
          '1. Աշխատողը պատասխանատվություն է ստանձնում Գործատուի կողմից իրեն հանձնված գույքի՝ սարքավորումների, գործիքների, նյութերի և այլ արժեքների պահպանության համար։\n\n' +
          '2. Աշխատողը պարտավորվում է՝ գույքն օգտագործել բացառապես նպատակային նշանակությամբ, անհապաղ տեղեկացնել Գործատուին կորստի, վնասման կամ անսարքության մասին, վերադարձնել գույքը աշխատանքային հարաբերությունների դադարման կամ Գործատուի պահանջի դեպքում։\n\n' +
          '3. Գործատուն պարտավորվում է ապահովել գույքի պահպանության համար անհրաժեշտ պայմանները և յուրաքանչյուր հանձնում ու վերադարձ ձևակերպել երկու կողմերի ստորագրած ակտով։\n\n' +
          '4. Աշխատողը պատասխանատվություն չի կրում սովորական մաշվածությամբ կամ իրենից անկախ հանգամանքներով պայմանավորված վնասի համար։\n\n' +
          '5. Վնասի համար պատասխանատվությունը սահմանվում է գործող աշխատանքային օրենսդրությանը համապատասխան։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
  {
    id: 'salary-payment-form',
    category: 'hiring',
    accent: 'emerald',
    signature: true,
    locales: {
      en: {
        title: 'Salary Payment Instruction',
        body:
          'To: {{org.name}}\nFrom: {{employee.fullName}}, {{employee.position}}, {{employee.department}} department\n\n' +
          'I request that my salary and any other payments due to me under my employment be transferred to my bank account with the following details:\n\n' +
          'Bank name: ____________________\nAccount number (IBAN): ____________________\nAccount holder: {{employee.fullName}}\nSocial card number: {{employee.socialCardNumber}}\n\n' +
          'I undertake to notify the Employer in writing, without delay, of any change to these details. I accept that the Employer is not liable for payments made to the details provided above before such notice is received.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Заявление о перечислении заработной платы',
        body:
          'Кому: {{org.name}}\nОт: {{employee.fullName}}, {{employee.position}}, отдел {{employee.department}}\n\n' +
          'Прошу перечислять мою заработную плату и иные причитающиеся мне выплаты на мой банковский счёт по следующим реквизитам:\n\n' +
          'Наименование банка: ____________________\nНомер счёта (IBAN): ____________________\nВладелец счёта: {{employee.fullName}}\nНомер социальной карты: {{employee.socialCardNumber}}\n\n' +
          'Обязуюсь незамедлительно уведомить Работодателя в письменной форме об изменении указанных реквизитов. Соглашаюсь, что Работодатель не несёт ответственности за выплаты, произведённые по указанным выше реквизитам до получения такого уведомления.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Antrag auf Gehaltsüberweisung',
        body:
          'An: {{org.name}}\nVon: {{employee.fullName}}, {{employee.position}}, Abteilung {{employee.department}}\n\n' +
          'Ich beantrage, mein Gehalt und alle weiteren mir aus dem Arbeitsverhältnis zustehenden Zahlungen auf mein Bankkonto mit den folgenden Angaben zu überweisen:\n\n' +
          'Name der Bank: ____________________\nKontonummer (IBAN): ____________________\nKontoinhaber: {{employee.fullName}}\nSozialkarten-Nr.: {{employee.socialCardNumber}}\n\n' +
          'Ich verpflichte mich, dem Arbeitgeber jede Änderung dieser Angaben unverzüglich schriftlich mitzuteilen. Ich akzeptiere, dass der Arbeitgeber für Zahlungen an die oben genannten Angaben vor Eingang einer solchen Mitteilung nicht haftet.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Աշխատավարձի փոխանցման դիմում',
        body:
          'Ում՝ {{org.name}}\nՈւմից՝ {{employee.fullName}}, {{employee.position}}, {{employee.department}} բաժին\n\n' +
          'Խնդրում եմ իմ աշխատավարձը և աշխատանքային հարաբերություններից բխող այլ վճարումները փոխանցել իմ բանկային հաշվին՝ ըստ հետևյալ վավերապայմանների՝\n\n' +
          'Բանկի անվանումը՝ ____________________\nՀաշվեհամարը (IBAN)՝ ____________________\nՀաշվի տիրոջ անունը՝ {{employee.fullName}}\nՍոցիալական քարտի համարը՝ {{employee.socialCardNumber}}\n\n' +
          'Պարտավորվում եմ անհապաղ գրավոր տեղեկացնել Գործատուին նշված վավերապայմանների փոփոխության մասին։ Համաձայն եմ, որ Գործատուն պատասխանատվություն չի կրում մինչև այդ ծանուցումը ստանալը վերոնշյալ վավերապայմաններով կատարված վճարումների համար։\n\n' +
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

  {
    id: 'biometric-consent',
    category: 'consent',
    accent: 'burgundy',
    signature: true,
    locales: {
      en: {
        title: 'Consent to Biometric Data Processing',
        body:
          'I, {{employee.fullName}}, born {{employee.dateOfBirth}}, give my explicit consent to {{org.name}} processing my biometric personal data — a facial image and the mathematical template derived from it — for the sole purpose of recording my working time through the automated attendance system.\n\n' +
          'I have been informed that:\n' +
          '- the biometric template is stored in encrypted form and is not transferred to third parties, except where required by law;\n' +
          '- the data is retained for the duration of my employment and is deleted within 30 days of its termination;\n' +
          '- providing biometric data is voluntary and I may withdraw this consent in writing at any time;\n' +
          '- if I refuse or withdraw consent, my working time will be recorded by an alternative method with no adverse consequences for me.\n\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Согласие на обработку биометрических данных',
        body:
          'Я, {{employee.fullName}}, дата рождения {{employee.dateOfBirth}}, даю явное согласие {{org.name}} на обработку моих биометрических персональных данных — изображения лица и производного от него математического шаблона — исключительно в целях учёта моего рабочего времени с помощью автоматизированной системы учёта посещаемости.\n\n' +
          'Мне разъяснено, что:\n' +
          '- биометрический шаблон хранится в зашифрованном виде и не передаётся третьим лицам, за исключением случаев, предусмотренных законом;\n' +
          '- данные хранятся в течение срока моей работы и удаляются в течение 30 дней после её прекращения;\n' +
          '- предоставление биометрических данных является добровольным, и я вправе отозвать данное согласие в письменной форме в любое время;\n' +
          '- в случае отказа или отзыва согласия учёт моего рабочего времени будет вестись альтернативным способом без каких-либо негативных последствий для меня.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Einwilligung zur Verarbeitung biometrischer Daten',
        body:
          'Ich, {{employee.fullName}}, geboren am {{employee.dateOfBirth}}, erteile {{org.name}} meine ausdrückliche Einwilligung zur Verarbeitung meiner biometrischen Daten — eines Gesichtsbildes und der daraus abgeleiteten mathematischen Vorlage — ausschließlich zum Zweck der Arbeitszeiterfassung über das automatisierte Anwesenheitssystem.\n\n' +
          'Ich wurde darüber informiert, dass:\n' +
          '- die biometrische Vorlage verschlüsselt gespeichert und nicht an Dritte weitergegeben wird, sofern nicht gesetzlich vorgeschrieben;\n' +
          '- die Daten für die Dauer meines Arbeitsverhältnisses gespeichert und innerhalb von 30 Tagen nach dessen Beendigung gelöscht werden;\n' +
          '- die Bereitstellung biometrischer Daten freiwillig ist und ich diese Einwilligung jederzeit schriftlich widerrufen kann;\n' +
          '- bei Verweigerung oder Widerruf meine Arbeitszeit auf alternative Weise ohne Nachteile für mich erfasst wird.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Կենսաչափական տվյալների մշակման համաձայնություն',
        body:
          'Ես՝ {{employee.fullName}}-ս, ծնված {{employee.dateOfBirth}}, տալիս եմ իմ բացահայտ համաձայնությունը {{org.name}}-ին՝ մշակելու իմ կենսաչափական անձնական տվյալները՝ դեմքի պատկերը և դրանից բխող մաթեմատիկական կաղապարը, բացառապես ավտոմատացված ներկայության համակարգի միջոցով իմ աշխատաժամանակի հաշվառման նպատակով։\n\n' +
          'Ինձ բացատրվել է, որ՝\n' +
          '- կենսաչափական կաղապարը պահվում է գաղտնագրված ձևով և չի փոխանցվում երրորդ անձանց, բացառությամբ օրենքով նախատեսված դեպքերի,\n' +
          '- տվյալները պահվում են իմ աշխատանքի ողջ ընթացքում և ջնջվում են դրա դադարումից հետո 30 օրվա ընթացքում,\n' +
          '- կենսաչափական տվյալների տրամադրումը կամավոր է, և ես կարող եմ ցանկացած պահի գրավոր հետ կանչել այս համաձայնությունը,\n' +
          '- մերժման կամ համաձայնությունը հետ կանչելու դեպքում իմ աշխատաժամանակը կհաշվառվի այլընտրանքային եղանակով՝ առանց ինձ համար բացասական հետևանքների։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
  {
    id: 'policies-acknowledgement',
    category: 'consent',
    accent: 'blue',
    signature: true,
    locales: {
      en: {
        title: 'Acknowledgement of Internal Regulations',
        body:
          'I, {{employee.fullName}}, holding the position of {{employee.position}} in the {{employee.department}} department of {{org.name}}, confirm that I have been familiarised with and have understood the following internal documents:\n\n' +
          '- Internal labour regulations\n' +
          '- Occupational health and safety rules\n' +
          '- Personal data protection policy\n' +
          '- Information security and confidentiality policy\n' +
          '- Equal treatment and anti-harassment policy\n\n' +
          "I undertake to comply with the requirements set out in these documents. I am aware that their current versions are available from the HR unit and in the company's internal system.\n\n" +
          'Date: {{today}}',
      },
      ru: {
        title: 'Лист ознакомления с локальными нормативными актами',
        body:
          'Я, {{employee.fullName}}, занимающий должность {{employee.position}} в отделе {{employee.department}} компании {{org.name}}, подтверждаю, что ознакомлен и мне понятны следующие внутренние документы:\n\n' +
          '- Правила внутреннего трудового распорядка\n' +
          '- Правила охраны труда и техники безопасности\n' +
          '- Политика защиты персональных данных\n' +
          '- Политика информационной безопасности и конфиденциальности\n' +
          '- Политика равного обращения и недопущения притеснений\n\n' +
          'Обязуюсь соблюдать требования, установленные указанными документами. Мне известно, что их действующие версии доступны в кадровой службе и во внутренней системе компании.\n\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Kenntnisnahme der internen Regelungen',
        body:
          'Ich, {{employee.fullName}}, in der Position {{employee.position}} in der Abteilung {{employee.department}} von {{org.name}}, bestätige, dass ich die folgenden internen Dokumente zur Kenntnis genommen und verstanden habe:\n\n' +
          '- Interne Arbeitsordnung\n' +
          '- Arbeitsschutz- und Sicherheitsvorschriften\n' +
          '- Datenschutzrichtlinie\n' +
          '- Richtlinie zur Informationssicherheit und Vertraulichkeit\n' +
          '- Richtlinie zur Gleichbehandlung und gegen Belästigung\n\n' +
          'Ich verpflichte mich, die in diesen Dokumenten festgelegten Anforderungen einzuhalten. Mir ist bekannt, dass die jeweils aktuellen Fassungen bei der Personalabteilung und im internen System des Unternehmens verfügbar sind.\n\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Ներքին իրավական ակտերին ծանոթացման թերթիկ',
        body:
          'Ես՝ {{employee.fullName}}-ս, զբաղեցնելով {{org.name}}-ի {{employee.department}} բաժնի {{employee.position}} պաշտոնը, հաստատում եմ, որ ծանոթացել եմ և ինձ համար հասկանալի են հետևյալ ներքին փաստաթղթերը՝\n\n' +
          '- Ներքին աշխատանքային կարգապահական կանոնները\n' +
          '- Աշխատանքի պահպանության և անվտանգության կանոնները\n' +
          '- Անձնական տվյալների պաշտպանության քաղաքականությունը\n' +
          '- Տեղեկատվական անվտանգության և գաղտնիության քաղաքականությունը\n' +
          '- Հավասար վերաբերմունքի և ոտնձգությունների անթույլատրելիության քաղաքականությունը\n\n' +
          'Պարտավորվում եմ պահպանել նշված փաստաթղթերով սահմանված պահանջները։ Տեղյակ եմ, որ դրանց գործող տարբերակները հասանելի են կադրերի ստորաբաժանումում և ընկերության ներքին համակարգում։\n\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },

  // ── Orders ──────────────────────────────────────────────────────────────
  {
    id: 'employment-order',
    category: 'order',
    accent: 'blue',
    signature: true,
    locales: {
      en: {
        title: 'Employment Order',
        body:
          'ORDER\n\n' +
          'On hiring an employee\n\n' +
          'On the basis of the employment contract concluded between {{org.name}} and {{employee.fullName}}, I hereby order:\n\n' +
          '1. To hire {{employee.fullName}} for the position of {{employee.position}} in the {{employee.department}} department, effective {{employee.hireDate}}.\n' +
          '2. To set a monthly base salary of {{employee.salary}}.\n' +
          '3. The HR unit shall familiarise the employee with the job description and the internal regulations of {{org.name}}.\n\n' +
          "Grounds: employment contract, employee's application.\n\n" +
          'Issued by: {{signatory.name}}, {{signatory.position}}\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Приказ о приёме на работу',
        body:
          'ПРИКАЗ\n\n' +
          'О приёме на работу\n\n' +
          'На основании трудового договора, заключённого между {{org.name}} и {{employee.fullName}}, приказываю:\n\n' +
          '1. Принять {{employee.fullName}} на должность {{employee.position}} в отдел {{employee.department}} с {{employee.hireDate}}.\n' +
          '2. Установить ежемесячный оклад в размере {{employee.salary}}.\n' +
          '3. Кадровой службе ознакомить работника с должностной инструкцией и внутренними правилами {{org.name}}.\n\n' +
          'Основание: трудовой договор, заявление работника.\n\n' +
          'Издал: {{signatory.name}}, {{signatory.position}}\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Einstellungsanordnung',
        body:
          'ANORDNUNG\n\n' +
          'Über die Einstellung eines Arbeitnehmers\n\n' +
          'Auf der Grundlage des zwischen {{org.name}} und {{employee.fullName}} geschlossenen Arbeitsvertrags ordne ich an:\n\n' +
          '1. {{employee.fullName}} mit Wirkung zum {{employee.hireDate}} als {{employee.position}} in der Abteilung {{employee.department}} einzustellen.\n' +
          '2. Ein monatliches Grundgehalt von {{employee.salary}} festzusetzen.\n' +
          '3. Die Personalabteilung hat den Arbeitnehmer mit der Stellenbeschreibung und den internen Regelungen von {{org.name}} vertraut zu machen.\n\n' +
          'Grundlage: Arbeitsvertrag, Antrag des Arbeitnehmers.\n\n' +
          'Ausgestellt von: {{signatory.name}}, {{signatory.position}}\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Աշխատանքի ընդունման հրաման',
        body:
          'ՀՐԱՄԱՆ\n\n' +
          'Աշխատողին աշխատանքի ընդունելու մասին\n\n' +
          '{{org.name}}-ի և {{employee.fullName}}-ի միջև կնքված աշխատանքային պայմանագրի հիման վրա՝ հրամայում եմ՝\n\n' +
          '1. {{employee.fullName}}-ին {{employee.hireDate}}-ից ընդունել աշխատանքի {{employee.department}} բաժնի {{employee.position}} պաշտոնում։\n' +
          '2. Սահմանել ամսական հիմնական աշխատավարձ՝ {{employee.salary}}։\n' +
          '3. Կադրերի ստորաբաժանմանը՝ աշխատողին ծանոթացնել աշխատանքի նկարագրությանը և {{org.name}}-ի ներքին կարգապահական կանոններին։\n\n' +
          'Հիմք՝ աշխատանքային պայմանագիր, աշխատողի դիմում։\n\n' +
          'Տրված է՝ {{signatory.name}}, {{signatory.position}}\n' +
          'Ամսաթիվ՝ {{today}}',
      },
    },
  },
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
          '{{org.name}} hereby grants {{employee.fullName}}, {{employee.position}} of the {{employee.department}} department,\n' +
          '{{leave.type}} leave for {{leave.days}} day(s), from {{leave.startDate}} to {{leave.endDate}},\n' +
          'for the following reason: {{leave.reason}}.\n\n' +
          'This order is issued in accordance with the applicable leave policy.\n\n' +
          'Issued by: {{signatory.name}}, {{signatory.position}}\n' +
          'Date: {{today}}',
      },
      ru: {
        title: 'Приказ об отпуске',
        body:
          'ПРИКАЗ\n\n' +
          '{{org.name}} предоставляет {{employee.fullName}}, {{employee.position}} отдела {{employee.department}},\n' +
          '{{leave.type}} отпуск на {{leave.days}} рабочий(их) дней, с {{leave.startDate}} по {{leave.endDate}},\n' +
          'по следующей причине: {{leave.reason}}.\n\n' +
          'Настоящий приказ издан в соответствии с действующей политикой отпусков.\n\n' +
          'Издал: {{signatory.name}}, {{signatory.position}}\n' +
          'Дата: {{today}}',
      },
      de: {
        title: 'Urlaubsanordnung',
        body:
          'ANORDNUNG\n\n' +
          '{{org.name}} gewährt {{employee.fullName}}, {{employee.position}} der Abteilung {{employee.department}},\n' +
          '{{leave.type}} Urlaub für {{leave.days}} Tag(e), vom {{leave.startDate}} bis {{leave.endDate}},\n' +
          'aus folgendem Grund: {{leave.reason}}.\n\n' +
          'Diese Anordnung wird gemäß der geltenden Urlaubsrichtlinie ausgestellt.\n\n' +
          'Ausgestellt von: {{signatory.name}}, {{signatory.position}}\n' +
          'Datum: {{today}}',
      },
      hy: {
        title: 'Արձակուրդի հրաման',
        body:
          'ՀՐԱՄԱՆ\n\n' +
          '{{org.name}}-ը սույնով {{employee.department}} բաժնի {{employee.position}} {{employee.fullName}}-ին տրամադրում է\n' +
          '{{leave.type}} արձակուրդ՝ {{leave.days}} օրով, {{leave.startDate}}-ից մինչև {{leave.endDate}},\n' +
          'հետևյալ պատճառով՝ {{leave.reason}}։\n\n' +
          'Հրամանը տրված է գործող արձակուրդի քաղաքականությանը համապատասխան։\n\n' +
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

// ─────────────────────────────────────────────────────────────────────────────
// Hiring packet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Documents generated automatically when an employee is created, in the order
 * they are presented and signed.
 *
 * Every entry is issued bilingually: Armenian (legally binding) alongside the
 * employee's chosen language. The list itself lives in `convex/lib` because the
 * backend validates against it too — a packet must never reference a template
 * this catalog cannot render.
 */
export const DEFAULT_HIRING_PACKET: readonly string[] = HIRING_PACKET_TEMPLATE_IDS;

/**
 * Packet entries that cannot be skipped — onboarding is not complete until these
 * are signed. The rest are situational (e.g. material responsibility only
 * matters once equipment is issued).
 */
export const HIRING_PACKET_MANDATORY: readonly string[] = HIRING_PACKET_MANDATORY_IDS;

/** Is this template part of the automatic hiring packet? */
export function isHiringPacketTemplate(id: string): boolean {
  return DEFAULT_HIRING_PACKET.includes(id);
}

/** Resolve a template's localized content, falling back to English. */
export function localizedContent(
  template: CatalogTemplate,
  lang: SupportedLocale,
): LocalizedContent {
  return template.locales[lang] ?? template.locales.en;
}
