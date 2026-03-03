const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'i18n', 'locales');

// Read files
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
const hy = JSON.parse(fs.readFileSync(path.join(localesDir, 'hy.json'), 'utf8'));
const ru = JSON.parse(fs.readFileSync(path.join(localesDir, 'ru.json'), 'utf8'));

// Add English
en.planGate = {
  "upgradeRequired": "Upgrade Required",
  "featureNotAvailable": "This feature is not available on your current plan. Upgrade to unlock it.",
  "upgradeTo": "Upgrade to",
  "analyticsTitle": "Analytics — Professional Plan Required",
  "analyticsDescription": "Advanced analytics and HR insights are available on the Professional plan and above.",
  "reportsTitle": "Reports — Professional Plan Required",
  "reportsDescription": "Detailed reports and CSV export are available on the Professional plan and above."
};

// Add Armenian
hy.planGate = {
  "upgradeRequired": "Անհրաժեշտ է թարմացում",
  "featureNotAvailable": "Այս ֆունկցիան հասանելի չէ ձեր ներկայիս պլանով։ Թարմացրեք՝ ապակողպելու համար:",
  "upgradeTo": "Թարմացնել մինչև",
  "analyticsTitle": "Վերլուծություն — Անհրաժեշտ է Professional պլան",
  "analyticsDescription": "Խորացված վերլուծություն և HR տեղեկատվությունը հասանելի են Professional պլանով և ավելի բարձր:",
  "reportsTitle": "Հաշվետվություններ — Անհրաժեշտ է Professional պլան",
  "reportsDescription": "Մանրամասն հաշվետվություններ և CSV արտահանումը հասանելի են Professional պլանով և ավելի բարձր:"
};

// Add Russian
ru.planGate = {
  "upgradeRequired": "Требуется обновление",
  "featureNotAvailable": "Эта функция недоступна в вашем текущем тарифе. Обновите тариф, чтобы разблокировать.",
  "upgradeTo": "Обновить до",
  "analyticsTitle": "Аналитика — Требуется тариф Professional",
  "analyticsDescription": "Расширенная аналитика и HR-инсайты доступны в тарифе Professional и выше.",
  "reportsTitle": "Отчёты — Требуется тариф Professional",
  "reportsDescription": "Детальные отчёты и экспорт в CSV доступны в тарифе Professional и выше."
};

// Write back
fs.writeFileSync(path.join(localesDir, 'en.json'), JSON.stringify(en, null, 2), 'utf8');
fs.writeFileSync(path.join(localesDir, 'hy.json'), JSON.stringify(hy, null, 2), 'utf8');
fs.writeFileSync(path.join(localesDir, 'ru.json'), JSON.stringify(ru, null, 2), 'utf8');

console.log('✅ Added planGate translations to en.json, hy.json, ru.json');
